import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { Octokit } from 'octokit';
import { UserModel } from '../users/user.model';
import { decryptSecret } from '../../shared/utils/crypto';
import { githubService } from '../github/github.service';
import { PRESET_BY_STACK_ID } from '../deploy/deploy.service';
import { activityService } from '../activity/activity.service';
import { ProjectModel } from '../projects/project.model';
import {
  BadRequestError,
  NotFoundError,
} from '../../shared/errors/http-errors';
import { AppError } from '../../shared/errors/AppError';
import { slugify } from '../../shared/utils/slugify';

/**
 * "Sube tu proyecto": el usuario arrastra un ZIP con TODO (incluido .env y
 * node_modules); DevHub excluye lo peligroso/regenerable con un reporte
 * educativo, crea un repositorio EN LA CUENTA GITHUB DEL USUARIO (OAuth) y
 * empuja los archivos limpios vía la Git Data API — sin git instalado.
 *
 * Flujo en dos pasos para no re-subir el ZIP:
 *   1. analyze(zip)  → guarda el ZIP en staging y devuelve el reporte + importId
 *   2. confirm(importId, { repoName, isPrivate }) → crea repo + push + vincula
 */

const STAGING_DIR = path.resolve(process.cwd(), 'uploads', 'imports');
const STAGING_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_KEPT_FILES = 2000;
const MAX_FILE_BYTES = 95 * 1024 * 1024; // límite de blob de GitHub es 100MB

export type ExclusionCategory =
  | 'SECRETO'
  | 'DEPENDENCIAS'
  | 'CONTROL_DE_VERSIONES'
  | 'BASURA_SISTEMA'
  | 'CONFIG_EDITOR'
  | 'LOGS_Y_CACHE'
  | 'DEMASIADO_GRANDE';

export interface ExcludedEntry {
  path: string;
  category: ExclusionCategory;
}

export interface ImportAnalysis {
  importId: string;
  originalName: string;
  totalEntries: number;
  keptCount: number;
  keptBytes: number;
  excluded: ExcludedEntry[];
  excludedCounts: Partial<Record<ExclusionCategory, number>>;
  suggestedRepoName: string;
  /** Rutas de muestra que sí se subirán (para que el usuario reconozca su proyecto). */
  keptSample: string[];
}

// ---------------------------------------------------------------------------
// Reglas de exclusión (nombre de archivo / segmento de carpeta)
// ---------------------------------------------------------------------------

const SECRET_FILES = [
  /^\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /^id_rsa/i,
  /^serviceaccount.*\.json$/i,
  /credentials\.json$/i,
];

const DEP_DIRS = new Set([
  'node_modules', 'vendor', 'venv', '.venv', '__pycache__', 'pods',
  '.gradle', '.m2', 'bower_components',
]);

const VCS_DIRS = new Set(['.git', '.svn', '.hg']);

const OS_JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

const EDITOR_DIRS = new Set(['.idea', '.vs']);

const CACHE_DIRS = new Set(['.cache', '.parcel-cache', '.angular', 'coverage', '.nyc_output', '.turbo']);

const classify = (entryPath: string, sizeBytes: number): ExclusionCategory | null => {
  const parts = entryPath.split('/').filter(Boolean);
  const base = (parts[parts.length - 1] ?? '').toLowerCase();

  for (const seg of parts) {
    const s = seg.toLowerCase();
    if (DEP_DIRS.has(s)) return 'DEPENDENCIAS';
    if (VCS_DIRS.has(s)) return 'CONTROL_DE_VERSIONES';
    if (EDITOR_DIRS.has(s)) return 'CONFIG_EDITOR';
    if (CACHE_DIRS.has(s)) return 'LOGS_Y_CACHE';
  }
  if (OS_JUNK.has(base)) return 'BASURA_SISTEMA';
  if (base.endsWith('.log')) return 'LOGS_Y_CACHE';
  for (const rx of SECRET_FILES) {
    if (rx.test(base)) return 'SECRETO';
  }
  if (sizeBytes > MAX_FILE_BYTES) return 'DEMASIADO_GRANDE';
  return null;
};

// ---------------------------------------------------------------------------

const ensureStaging = (): void => {
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
};

/** Borra ZIPs de staging con más de 24 h (best-effort). */
const sweepStaging = (): void => {
  try {
    for (const f of fs.readdirSync(STAGING_DIR)) {
      const p = path.join(STAGING_DIR, f);
      if (Date.now() - fs.statSync(p).mtimeMs > STAGING_TTL_MS) fs.unlinkSync(p);
    }
  } catch {
    /* best-effort */
  }
};

const stagingPath = (importId: string): string => {
  if (!/^[a-f0-9]{32}$/.test(importId)) {
    throw new BadRequestError('Identificador de importación inválido.');
  }
  return path.join(STAGING_DIR, `${importId}.zip`);
};

const userGithubToken = async (userId: string): Promise<string> => {
  const user = await UserModel.findById(userId).select('githubTokenEnc githubLogin').lean();
  const token = user?.githubTokenEnc ? decryptSecret(user.githubTokenEnc) : null;
  if (!token) {
    throw new BadRequestError(
      'Conecta tu cuenta de GitHub primero (pestaña GitHub del proyecto) para que podamos crear el repositorio a tu nombre.',
    );
  }
  return token;
};

const analyzeZip = (zipPath: string): Omit<ImportAnalysis, 'importId' | 'originalName' | 'suggestedRepoName'> => {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  const excluded: ExcludedEntry[] = [];
  const kept: Array<{ path: string; size: number }> = [];

  for (const e of entries) {
    const cat = classify(e.entryName.replace(/\\/g, '/'), e.header.size);
    if (cat) excluded.push({ path: e.entryName, category: cat });
    else kept.push({ path: e.entryName, size: e.header.size });
  }

  const excludedCounts: Partial<Record<ExclusionCategory, number>> = {};
  for (const ex of excluded) {
    excludedCounts[ex.category] = (excludedCounts[ex.category] ?? 0) + 1;
  }

  return {
    totalEntries: entries.length,
    keptCount: kept.length,
    keptBytes: kept.reduce((a, b) => a + b.size, 0),
    excluded: excluded.slice(0, 500), // el detalle completo puede ser enorme (node_modules)
    excludedCounts,
    keptSample: kept.slice(0, 12).map((k) => k.path),
  };
};

/**
 * Los ZIP hechos con "clic derecho → comprimir carpeta" suelen envolver todo
 * en una carpeta raíz ("mi-proyecto/…"). La quitamos para que el repo quede
 * con package.json en la raíz — de eso depende la detección de stack.
 */
const stripRootDir = (paths: string[]): ((p: string) => string) => {
  if (paths.length === 0) return (p) => p;
  const first = paths[0].split('/')[0];
  const allShareRoot = first && paths.every((p) => p.split('/')[0] === first);
  return allShareRoot ? (p) => p.split('/').slice(1).join('/') : (p) => p;
};

// ---------------------------------------------------------------------------

export const importService = {
  /** Paso 1: guarda el ZIP subido en staging y devuelve el análisis. */
  async analyze(
    projectId: string,
    file: Express.Multer.File,
  ): Promise<ImportAnalysis> {
    ensureStaging();
    sweepStaging();

    const project = await ProjectModel.findById(projectId).select('name slug').lean();
    if (!project) throw new NotFoundError('Project not found');

    const importId = crypto.randomBytes(16).toString('hex');
    const dest = stagingPath(importId);
    fs.renameSync(file.path, dest);

    try {
      const analysis = analyzeZip(dest);
      if (analysis.keptCount === 0) {
        fs.unlinkSync(dest);
        throw new BadRequestError(
          'El ZIP no contiene archivos subibles (todo fue excluido o está vacío).',
        );
      }
      if (analysis.keptCount > MAX_KEPT_FILES) {
        fs.unlinkSync(dest);
        throw new BadRequestError(
          `El proyecto tiene ${analysis.keptCount} archivos; el máximo por importación es ${MAX_KEPT_FILES}. ¿Seguro que no incluiste carpetas de dependencias con otro nombre?`,
        );
      }
      return {
        importId,
        originalName: file.originalname,
        suggestedRepoName: slugify(project.name) || 'mi-proyecto',
        ...analysis,
      };
    } catch (error) {
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      throw error;
    }
  },

  /**
   * Paso 2: crea el repo en la cuenta GitHub del usuario, empuja los archivos
   * limpios (Git Data API), vincula el proyecto y da el veredicto de deploy.
   */
  async confirm(
    projectId: string,
    userId: string,
    importId: string,
    opts: { repoName: string; isPrivate: boolean },
  ): Promise<{
    repoFullName: string;
    repoUrl: string;
    pushedFiles: number;
    linked: boolean;
    linkError: string | null;
    stackName: string | null;
    deployable: boolean;
    verdict: string;
  }> {
    const zipPath = stagingPath(importId);
    if (!fs.existsSync(zipPath)) {
      throw new NotFoundError(
        'La importación expiró o no existe. Vuelve a subir tu ZIP.',
      );
    }

    const token = await userGithubToken(userId);
    const octokit = new Octokit({ auth: token });

    const repoName = slugify(opts.repoName);
    if (!repoName) throw new BadRequestError('El nombre del repositorio no es válido.');

    // 1) Crear el repositorio del usuario. auto_init:true deja un commit base
    //    (README) para que la Git Data API pueda crear blobs — GitHub rechaza
    //    blobs en un repo totalmente vacío.
    let owner = '';
    try {
      const { data } = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        private: opts.isPrivate,
        description: 'Subido con DevHub — de idea a deploy, sin perder el control.',
        auto_init: true,
      });
      owner = data.owner?.login ?? '';
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      if (/name already exists/i.test(msg)) {
        throw new BadRequestError(
          `Ya tienes un repositorio llamado "${repoName}". Elige otro nombre.`,
        );
      }
      throw new AppError(
        `GitHub no pudo crear el repositorio: ${msg}`,
        502,
        'IMPORT_REPO_CREATE_FAILED',
      );
    }

    // 2) Push de los archivos limpios vía Git Data API (blob → tree → commit).
    const zip = new AdmZip(zipPath);
    const entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory)
      .filter((e) => classify(e.entryName.replace(/\\/g, '/'), e.header.size) === null);

    const normalize = stripRootDir(entries.map((e) => e.entryName.replace(/\\/g, '/')));

    const treeItems: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < entries.length; i += CONCURRENCY) {
      const batch = entries.slice(i, i + CONCURRENCY);
      const shas = await Promise.all(
        batch.map(async (e) => {
          const { data } = await octokit.rest.git.createBlob({
            owner,
            repo: repoName,
            content: e.getData().toString('base64'),
            encoding: 'base64',
          });
          return data.sha;
        }),
      );
      batch.forEach((e, idx) => {
        const p = normalize(e.entryName.replace(/\\/g, '/'));
        if (p) treeItems.push({ path: p, mode: '100644', type: 'blob', sha: shas[idx] });
      });
    }

    // El repo trae un commit base (README) de auto_init. Nuestro árbol lo
    // reemplaza por completo, apuntando al commit base como padre.
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: 'heads/main',
    });
    const { data: tree } = await octokit.rest.git.createTree({
      owner,
      repo: repoName,
      tree: treeItems, // árbol absoluto (sin base_tree) = reemplaza el README
    });
    const { data: commit } = await octokit.rest.git.createCommit({
      owner,
      repo: repoName,
      message: 'feat: proyecto importado desde DevHub',
      tree: tree.sha,
      parents: [baseRef.object.sha],
    });
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: 'heads/main',
      sha: commit.sha,
      force: true,
    });

    fs.unlinkSync(zipPath);

    // 3) Vincular el proyecto (best-effort: el plan puede vetar repos privados).
    let linked = false;
    let linkError: string | null = null;
    try {
      await githubService.linkRepo(projectId, userId, `${owner}/${repoName}`);
      linked = true;
    } catch (err) {
      linkError = (err as { message?: string }).message ?? 'No se pudo vincular.';
    }

    // 4) Veredicto de stack/deploy (solo si quedó vinculado).
    let stackName: string | null = null;
    let deployable = false;
    let verdict =
      'Tu código ya está seguro en GitHub. Vincula el repositorio para detectar el stack.';
    if (linked) {
      try {
        const detection = await githubService.detectStack(projectId, userId);
        const primary = detection.primary;
        stackName = primary?.name ?? null;
        const preset = primary ? PRESET_BY_STACK_ID[primary.id] : undefined;
        if (preset) {
          deployable = true;
          verdict = `Detectamos ${stackName}: tu proyecto ES desplegable. ¿Lo llevamos a producción con el Deploy Wizard?`;
        } else if (primary) {
          deployable = false;
          verdict =
            `Detectamos ${stackName}. Por ahora no podemos desplegar este tipo de proyecto (nuestro destino, Vercel, no lo ejecuta) — estamos trabajando para soportar más frameworks. Tu código ya está en GitHub y puedes trabajar con él desde DevHub.`;
        } else {
          deployable = true;
          verdict =
            'No detectamos un framework conocido. Si es un sitio estático (HTML/JS), el Deploy Wizard puede publicarlo dejando la configuración de build vacía.';
        }
      } catch {
        verdict = 'Tu código ya está en GitHub. La detección de stack se puede correr desde la pestaña GitHub.';
      }
    }

    const projDoc = await ProjectModel.findById(projectId).select('team name').lean();
    if (projDoc) {
      await activityService.log({
        actor: userId,
        team: projDoc.team,
        project: projDoc._id,
        type: 'GITHUB_SYNCED',
        message: `Proyecto importado a GitHub: ${owner}/${repoName} (${treeItems.length} archivos)`,
      });
    }

    return {
      repoFullName: `${owner}/${repoName}`,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      pushedFiles: treeItems.length,
      linked,
      linkError,
      stackName,
      deployable,
      verdict,
    };
  },
};
