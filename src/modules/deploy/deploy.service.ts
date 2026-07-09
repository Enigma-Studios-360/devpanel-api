import { Types } from 'mongoose';
import { Octokit } from 'octokit';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/http-errors';
import { ProjectModel, type ProjectDocument } from '../projects/project.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { activityService } from '../activity/activity.service';
import { notificationService } from '../notifications/notification.service';
import { slugify } from '../../shared/utils/slugify';
import { githubService } from '../github/github.service';
import {
  DeploymentModel,
  type DeployStatus,
  type DeploymentDocument,
} from './deployment.model';

/**
 * Thin integration in front of Vercel's REST API:
 *
 *   1. /v9/projects?search=…        — find an existing project by name
 *   2. POST /v11/projects           — create a new one linked to GitHub
 *   3. POST /v13/deployments        — trigger a deployment from the repo
 *   4. GET  /v13/deployments/:id    — poll the deployment status
 *
 * We persist a `Deployment` document for each trigger so the UI has a
 * stable handle (history, last build, status) without hitting Vercel on
 * every page load. Status refresh is opportunistic: the frontend pings
 * GET /status and we update the doc from Vercel before returning.
 *
 * The Vercel token never leaves this file — controllers receive sanitized
 * responses only.
 */

// ---------------------------------------------------------------------------
// Framework preset detection
// ---------------------------------------------------------------------------

/**
 * Vercel's known "framework" presets. When we match one, Vercel auto-picks
 * a sensible build/install/output config; we still pass overrides if the
 * user customized them. Any value we send must match
 * https://vercel.com/docs/cli/project-configuration#framework — sending
 * an unknown one returns 400.
 */
export type VercelFrameworkPreset =
  | 'nextjs'
  | 'angular'
  | 'vite'
  | 'create-react-app'
  | 'nuxtjs'
  | 'astro'
  | 'sveltekit'
  | 'remix'
  | 'gatsby'
  | 'vue'
  | 'svelte'
  | 'hugo'
  | 'jekyll'
  | 'eleventy'
  | 'docusaurus'
  | 'other';

interface FrameworkPresetGuess {
  framework: VercelFrameworkPreset;
  buildCommand: string;
  outputDirectory: string;
  installCommand: string;
  /** Env vars typically required for this stack — surfaced as suggestions. */
  suggestedEnv: string[];
}

const PRESET_BY_STACK_ID: Record<string, FrameworkPresetGuess> = {
  nextjs: {
    framework: 'nextjs',
    buildCommand: 'next build',
    outputDirectory: '.next',
    installCommand: 'npm install',
    suggestedEnv: ['NEXT_PUBLIC_API_URL'],
  },
  angular: {
    framework: 'angular',
    buildCommand: 'ng build --configuration=production',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    suggestedEnv: [],
  },
  'vite-react': {
    framework: 'vite',
    buildCommand: 'vite build',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    suggestedEnv: ['VITE_API_URL'],
  },
  'vite-vue': {
    framework: 'vite',
    buildCommand: 'vite build',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    suggestedEnv: ['VITE_API_URL'],
  },
  'create-react-app': {
    framework: 'create-react-app',
    buildCommand: 'react-scripts build',
    outputDirectory: 'build',
    installCommand: 'npm install',
    suggestedEnv: ['REACT_APP_API_URL'],
  },
  nuxt: {
    framework: 'nuxtjs',
    buildCommand: 'nuxt build',
    outputDirectory: '.output',
    installCommand: 'npm install',
    suggestedEnv: ['NUXT_PUBLIC_API_BASE'],
  },
  astro: {
    framework: 'astro',
    buildCommand: 'astro build',
    outputDirectory: 'dist',
    installCommand: 'npm install',
    suggestedEnv: [],
  },
  sveltekit: {
    framework: 'sveltekit',
    buildCommand: 'vite build',
    outputDirectory: '.svelte-kit',
    installCommand: 'npm install',
    suggestedEnv: [],
  },
  remix: {
    framework: 'remix',
    buildCommand: 'remix build',
    outputDirectory: 'public/build',
    installCommand: 'npm install',
    suggestedEnv: [],
  },
};

const DEFAULT_PRESET: FrameworkPresetGuess = {
  framework: 'other',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  installCommand: 'npm install',
  suggestedEnv: [],
};

// ---------------------------------------------------------------------------
// Vercel API helpers
// ---------------------------------------------------------------------------

const VERCEL_TIMEOUT_MS = 20_000;

const assertConfigured = (): void => {
  if (!env.vercelToken) {
    throw new AppError(
      'Vercel no está configurado en el servidor. Pide al administrador que añada VERCEL_TOKEN al .env del backend.',
      503,
      'DEPLOY_NOT_CONFIGURED',
    );
  }
};

const teamQuery = (): string =>
  env.vercelTeamId ? `?teamId=${encodeURIComponent(env.vercelTeamId)}` : '';

interface VercelError {
  error?: { code?: string; message?: string };
}

const vercelFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  assertConfigured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERCEL_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.vercelApiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
        Authorization: `Bearer ${env.vercelToken}`,
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = (err as { name?: string }).name === 'AbortError';
    throw new AppError(
      aborted
        ? 'Vercel tardó demasiado en responder. Intenta de nuevo.'
        : 'No fue posible contactar con Vercel.',
      aborted ? 504 : 502,
      aborted ? 'DEPLOY_TIMEOUT' : 'DEPLOY_UPSTREAM',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';
    let upstreamCode = '';
    try {
      const body = (await response.json()) as VercelError;
      detail = body.error?.message ?? '';
      upstreamCode = body.error?.code ?? '';
    } catch {
      // ignore non-JSON error
    }
    if (response.status === 401 || response.status === 403) {
      // Don't leak details — the user can't fix this anyway.
      // eslint-disable-next-line no-console
      console.warn(
        '[deploy] Vercel auth rejected (status=%d, upstreamCode=%s).',
        response.status,
        upstreamCode,
      );
      throw new AppError(
        'Vercel rechazó la autenticación. Revisa VERCEL_TOKEN o el alcance del token.',
        502,
        'DEPLOY_AUTH_FAILED',
      );
    }
    if (response.status === 404) {
      throw new NotFoundError(
        `Vercel no encontró el recurso solicitado${detail ? ` (${detail})` : ''}.`,
      );
    }
    if (response.status === 429) {
      throw new AppError(
        'Vercel alcanzó el rate limit. Espera unos segundos.',
        429,
        'DEPLOY_UPSTREAM_RATE_LIMIT',
      );
    }
    // Special case: the Vercel ACCOUNT has no GitHub identity linked
    // ("Login Connection"). Installing the GitHub app is not enough —
    // Vercel can't associate the installation with this account.
    if (detail.toLowerCase().includes('login connection')) {
      throw new AppError(
        'Tu cuenta de Vercel no está conectada a GitHub. En vercel.com entra a Account Settings → Authentication y conecta tu cuenta de GitHub (Login Connection); después reintenta el deploy.',
        502,
        'DEPLOY_VERCEL_GITHUB_UNLINKED',
      );
    }
    // Special case: missing GitHub install. Surface a clear CTA so the
    // UI can render setup instructions instead of a generic error.
    if (
      upstreamCode === 'no_github_app' ||
      upstreamCode === 'not_authorized' ||
      detail.toLowerCase().includes('github')
    ) {
      throw new AppError(
        'Tu cuenta de Vercel no tiene acceso al repo de GitHub. Instala la "Vercel" app en https://github.com/apps/vercel y concédele acceso al repo.',
        502,
        'DEPLOY_GITHUB_APP_MISSING',
      );
    }
    throw new AppError(
      `Vercel devolvió ${response.status}${detail ? `: ${detail}` : ''}.`,
      502,
      'DEPLOY_UPSTREAM',
    );
  }

  // 204 / empty body safety.
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
};

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

interface VercelDeploymentShape {
  id?: string;
  uid?: string;
  url?: string;
  inspectorUrl?: string;
  projectId?: string;
  readyState?: string;
  state?: string;
  meta?: {
    githubCommitSha?: string;
    githubCommitRef?: string;
    [k: string]: unknown;
  };
  errorMessage?: string;
}

const mapVercelStatus = (raw?: string): DeployStatus => {
  switch ((raw ?? '').toUpperCase()) {
    case 'READY':
      return 'READY';
    case 'ERROR':
    case 'FAILED':
      return 'ERROR';
    case 'CANCELED':
      return 'CANCELED';
    case 'BUILDING':
    case 'INITIALIZING':
    case 'ANALYZING':
      return 'BUILDING';
    case 'QUEUED':
    default:
      return 'QUEUED';
  }
};

// ---------------------------------------------------------------------------
// Project access helper (duplicated locally to keep the service self-contained)
// ---------------------------------------------------------------------------

const assertProjectAccess = async (
  projectId: string,
  userId: string,
): Promise<{ project: ProjectDocument; teamId: Types.ObjectId }> => {
  if (!Types.ObjectId.isValid(projectId)) {
    throw new NotFoundError('Project not found');
  }
  const project = await ProjectModel.findById(projectId);
  if (!project) throw new NotFoundError('Project not found');

  const isMember = project.members.some((m) => m.toString() === userId);
  if (!isMember) {
    const member = await TeamMemberModel.findOne({
      team: project.team,
      user: new Types.ObjectId(userId),
      status: 'ACTIVE',
    }).lean();
    if (!member) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return { project, teamId: project.team };
};

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

export interface DeployPrepareResult {
  framework: VercelFrameworkPreset;
  buildCommand: string;
  outputDirectory: string;
  installCommand: string;
  suggestedEnv: string[];
  branch: string;
  /** What we derived from the stack detector — useful for the UI summary. */
  detectedStackId: string | null;
  detectedStackName: string | null;
  /** Repo coords pulled from project.githubOwner/repo. */
  repo: { owner: string; repo: string };
  /** Vercel project name we plan to use (slug). */
  suggestedProjectName: string;
}

export interface TriggerDeployInput {
  projectName?: string;
  framework: VercelFrameworkPreset;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
  rootDirectory?: string;
  branch?: string;
  envVars?: Array<{ key: string; value: string }>;
}

export const deployService = {
  isConfigured(): boolean {
    return Boolean(env.vercelToken);
  },

  /**
   * Step 1 of the wizard. Inspects the linked GitHub repo, runs the
   * stack detector, and proposes a build configuration. Pure: doesn't
   * touch Vercel yet.
   */
  async prepare(projectId: string, userId: string): Promise<DeployPrepareResult> {
    const { project } = await assertProjectAccess(projectId, userId);
    if (!project.githubOwner || !project.githubRepo) {
      throw new BadRequestError(
        'Antes de desplegar, vincula un repositorio de GitHub en la pestaña GitHub del proyecto.',
      );
    }

    let detectedId: string | null = null;
    let detectedName: string | null = null;
    try {
      const detection = await githubService.detectStack(projectId, userId);
      const primary = detection.primary;
      if (primary) {
        detectedId = primary.id;
        detectedName = primary.name;
      }
    } catch {
      // Detection failure is non-fatal — we still propose a sensible default.
    }

    const preset =
      (detectedId && PRESET_BY_STACK_ID[detectedId]) || DEFAULT_PRESET;
    const suggestedProjectName = slugify(project.name) || 'devhub-project';

    return {
      framework: preset.framework,
      buildCommand: preset.buildCommand,
      outputDirectory: preset.outputDirectory,
      installCommand: preset.installCommand,
      suggestedEnv: preset.suggestedEnv,
      branch: project.defaultBranch || 'main',
      detectedStackId: detectedId,
      detectedStackName: detectedName,
      repo: { owner: project.githubOwner, repo: project.githubRepo },
      suggestedProjectName,
    };
  },

  /**
   * Steps 2-4 of the wizard. Idempotent: if we've already created a
   * Vercel project for this name, we reuse it. Otherwise we create one
   * linked to the GitHub repo. Then we trigger a new deployment off the
   * configured branch.
   */
  async trigger(
    projectId: string,
    userId: string,
    input: TriggerDeployInput,
  ): Promise<DeploymentDocument> {
    assertConfigured();
    const { project, teamId } = await assertProjectAccess(projectId, userId);
    if (!project.githubOwner || !project.githubRepo) {
      throw new BadRequestError(
        'El proyecto no tiene un repositorio de GitHub vinculado.',
      );
    }
    const owner = project.githubOwner;
    const repo = project.githubRepo;
    const branch = (input.branch || project.defaultBranch || 'main').trim();
    const projectName =
      (input.projectName && slugify(input.projectName)) ||
      slugify(project.name) ||
      `devhub-${project._id.toString().slice(-8)}`;

    // 1) Try to find an existing Vercel project with that name.
    let vercelProject = await this.findVercelProject(projectName);

    // 2) If not found, create one linked to the GitHub repo.
    if (!vercelProject) {
      vercelProject = await this.createVercelProject(projectName, {
        owner,
        repo,
        framework: input.framework,
        buildCommand: input.buildCommand,
        outputDirectory: input.outputDirectory,
        installCommand: input.installCommand,
        rootDirectory: input.rootDirectory,
      });
    }

    // 2.5) Make deployment URLs public (best-effort): Vercel enables
    //      "Deployment Protection" by default, which puts per-deployment
    //      URLs behind a Vercel login. Our users get the production URL,
    //      but we also lift the protection so nothing ever asks for login.
    await this.disableDeploymentProtection(vercelProject.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[deploy] protection opt-out failed:', (err as Error).message);
    });

    // 3) Push environment variables if any (best-effort; we don't crash
    //    the deploy on a single bad value).
    if (input.envVars && input.envVars.length > 0) {
      await this.upsertEnvVars(vercelProject.id, input.envVars).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[deploy] env vars upsert failed:', (err as Error).message);
      });
    }

    // 4) Trigger a deployment from the configured branch. Vercel's v13 API
    //    identifies the repo by its numeric GitHub id, so resolve it first.
    const repoId = await this.getGithubRepoId(owner, repo);
    const deployment = await this.createDeployment({
      vercelProjectId: vercelProject.id,
      vercelProjectName: projectName,
      repoId,
      branch,
    });

    // 5) Persist locally and log activity.
    const doc = await DeploymentModel.create({
      project: project._id,
      team: teamId,
      triggeredBy: new Types.ObjectId(userId),
      provider: 'VERCEL',
      vercelDeploymentId: deployment.id ?? deployment.uid,
      vercelProjectId: vercelProject.id,
      vercelProjectName: projectName,
      url: deployment.url ? `https://${deployment.url}` : undefined,
      publicUrl: `https://${projectName}.vercel.app`,
      inspectorUrl: deployment.inspectorUrl,
      status: mapVercelStatus(deployment.readyState ?? deployment.state),
      framework: input.framework,
      buildCommand: input.buildCommand,
      outputDirectory: input.outputDirectory,
      installCommand: input.installCommand,
      rootDirectory: input.rootDirectory,
      gitBranch: branch,
      commitSha: deployment.meta?.githubCommitSha,
    });

    await activityService.log({
      actor: userId,
      team: teamId,
      project: project._id,
      type: 'GITHUB_SYNCED',
      message: `Deploy lanzado en Vercel: ${projectName}`,
      metadata: {
        vercelProjectId: vercelProject.id,
        vercelDeploymentId: doc.vercelDeploymentId,
        branch,
      },
    });

    return doc;
  },

  /**
   * Refresh the local deployment from Vercel (cheap — single GET) and
   * return the updated document. Used by the polling UI.
   */
  async refresh(
    projectId: string,
    deploymentId: string,
    userId: string,
  ): Promise<DeploymentDocument> {
    await assertProjectAccess(projectId, userId);
    if (!Types.ObjectId.isValid(deploymentId)) {
      throw new NotFoundError('Deployment not found');
    }
    const doc = await DeploymentModel.findById(deploymentId);
    if (!doc || doc.project.toString() !== projectId) {
      throw new NotFoundError('Deployment not found');
    }
    if (!doc.vercelDeploymentId) return doc;

    // Don't hit Vercel if the deploy already settled — saves rate limit.
    if (
      doc.status === 'READY' ||
      doc.status === 'ERROR' ||
      doc.status === 'CANCELED'
    ) {
      return doc;
    }

    const fresh = await vercelFetch<VercelDeploymentShape>(
      `/v13/deployments/${doc.vercelDeploymentId}${teamQuery()}`,
    );
    const status = mapVercelStatus(fresh.readyState ?? fresh.state);
    const previousStatus = doc.status;
    doc.status = status;
    if (fresh.url) doc.url = `https://${fresh.url}`;
    if (fresh.inspectorUrl) doc.inspectorUrl = fresh.inspectorUrl;
    if (status === 'READY' || status === 'ERROR' || status === 'CANCELED') {
      doc.finishedAt = new Date();
      if (status === 'ERROR') {
        doc.errorMessage = fresh.errorMessage ?? 'Deploy failed on Vercel.';
      }
    }
    await doc.save();

    // Notify the user who triggered the deploy when it settles.
    // `dedupKey` ensures we don't fire twice if polling races with a
    // user-initiated refresh.
    if (
      previousStatus !== status &&
      (status === 'READY' || status === 'ERROR') &&
      doc.triggeredBy
    ) {
      const projectName = doc.vercelProjectName ?? 'tu proyecto';
      await notificationService.createForUser(doc.triggeredBy, {
        type: status === 'READY' ? 'DEPLOY_READY' : 'DEPLOY_FAILED',
        title:
          status === 'READY'
            ? `Deploy listo · ${projectName}`
            : `Deploy falló · ${projectName}`,
        message:
          status === 'READY'
            ? `Tu rama ${doc.gitBranch ?? 'main'} está en producción.`
            : doc.errorMessage ?? 'Revisa los logs en Vercel para más detalle.',
        team: doc.team,
        project: doc.project,
        action: {
          label: status === 'READY' ? 'Abrir URL' : 'Ver logs',
          url:
            status === 'READY' && doc.url
              ? doc.url
              : `/app/projects/${doc.project.toString()}/deploy`,
        },
        metadata: { deploymentId: doc._id.toString() },
        dedupKey: `deploy:${doc._id.toString()}:${status}`,
      });
    }

    return doc;
  },

  /**
   * Read-only summary for the deploy page: the last 10 deployments of
   * the project + a peek at the "current" one (latest, optionally
   * refreshed if in-flight).
   */
  async listForProject(
    projectId: string,
    userId: string,
    options: { refreshLatest?: boolean } = {},
  ): Promise<{
    current: DeploymentDocument | null;
    history: DeploymentDocument[];
  }> {
    await assertProjectAccess(projectId, userId);
    const projObj = new Types.ObjectId(projectId);
    const history = await DeploymentModel.find({ project: projObj })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('triggeredBy', 'name email avatarUrl')
      .exec();

    let current: DeploymentDocument | null = history[0] ?? null;
    if (
      current &&
      options.refreshLatest &&
      current.status !== 'READY' &&
      current.status !== 'ERROR' &&
      current.status !== 'CANCELED'
    ) {
      try {
        current = await this.refresh(projectId, current._id.toString(), userId);
      } catch {
        // best-effort — keep the stale doc rather than crash the list call
      }
    }
    return { current, history };
  },

  // ---- Internal: Vercel calls ---------------------------------------------

  async findVercelProject(
    name: string,
  ): Promise<{ id: string; name: string } | null> {
    interface ProjectList {
      projects?: Array<{ id?: string; name?: string }>;
    }
    const data = await vercelFetch<ProjectList>(
      `/v9/projects?search=${encodeURIComponent(name)}&limit=20${
        env.vercelTeamId ? `&teamId=${env.vercelTeamId}` : ''
      }`,
    );
    const match = (data.projects ?? []).find(
      (p) => (p.name ?? '').toLowerCase() === name.toLowerCase(),
    );
    if (!match?.id) return null;
    return { id: match.id, name: match.name ?? name };
  },

  async createVercelProject(
    name: string,
    opts: {
      owner: string;
      repo: string;
      framework: VercelFrameworkPreset;
      buildCommand?: string;
      outputDirectory?: string;
      installCommand?: string;
      rootDirectory?: string;
    },
  ): Promise<{ id: string; name: string }> {
    interface CreateProjectResponse {
      id?: string;
      name?: string;
    }
    const body = {
      name,
      framework: opts.framework === 'other' ? null : opts.framework,
      gitRepository: {
        type: 'github',
        repo: `${opts.owner}/${opts.repo}`,
      },
      buildCommand: opts.buildCommand,
      outputDirectory: opts.outputDirectory,
      installCommand: opts.installCommand,
      rootDirectory: opts.rootDirectory,
    };
    const data = await vercelFetch<CreateProjectResponse>(
      `/v11/projects${teamQuery()}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    if (!data.id) {
      throw new AppError(
        'Vercel creó el proyecto pero no devolvió un id válido.',
        502,
        'DEPLOY_UPSTREAM',
      );
    }
    return { id: data.id, name: data.name ?? name };
  },

  /**
   * Turns off Vercel's "Deployment Protection" (SSO auth wall) for the
   * project so per-deployment URLs are publicly reachable, same as the
   * production domain. Idempotent; safe to call on every trigger.
   */
  async disableDeploymentProtection(vercelProjectId: string): Promise<void> {
    await vercelFetch(
      `/v9/projects/${encodeURIComponent(vercelProjectId)}${teamQuery()}`,
      { method: 'PATCH', body: JSON.stringify({ ssoProtection: null }) },
    );
  },

  async upsertEnvVars(
    vercelProjectId: string,
    pairs: Array<{ key: string; value: string }>,
  ): Promise<void> {
    if (pairs.length === 0) return;
    // POST /v10/projects/:id/env supports an array body — sends all in one round-trip.
    await vercelFetch(
      `/v10/projects/${encodeURIComponent(vercelProjectId)}/env?upsert=true${
        env.vercelTeamId ? `&teamId=${env.vercelTeamId}` : ''
      }`,
      {
        method: 'POST',
        body: JSON.stringify(
          pairs.map((p) => ({
            key: p.key,
            value: p.value,
            type: 'encrypted',
            target: ['production', 'preview', 'development'],
          })),
        ),
      },
    );
  },

  /** Numeric GitHub repo id — what Vercel's v13 gitSource requires. */
  async getGithubRepoId(owner: string, repo: string): Promise<number> {
    const octokit = env.githubToken
      ? new Octokit({ auth: env.githubToken })
      : new Octokit();
    try {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return data.id;
    } catch {
      throw new BadRequestError(
        `No se pudo leer ${owner}/${repo} en GitHub para obtener su id. Revisa el GITHUB_TOKEN.`,
      );
    }
  },

  async createDeployment(opts: {
    vercelProjectId: string;
    vercelProjectName: string;
    repoId: number;
    branch: string;
  }): Promise<VercelDeploymentShape> {
    // Vercel needs an integration to know which commit to build: project +
    // numeric repoId + ref, and it resolves the SHA from GitHub itself.
    const body = {
      name: opts.vercelProjectName,
      project: opts.vercelProjectId,
      target: 'production',
      gitSource: {
        type: 'github',
        ref: opts.branch,
        repoId: opts.repoId,
      },
    };
    return vercelFetch<VercelDeploymentShape>(
      `/v13/deployments${teamQuery()}`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  /**
   * Convenience helper for callers that want a project-name uniqueness
   * check before submitting the wizard (used by the prepare step UI).
   */
  async checkProjectNameAvailability(name: string): Promise<{
    available: boolean;
    existingVercelProjectId: string | null;
  }> {
    assertConfigured();
    const slug = slugify(name);
    if (!slug) {
      throw new BadRequestError('El nombre del proyecto en Vercel no es válido.');
    }
    const existing = await this.findVercelProject(slug);
    return {
      available: !existing,
      existingVercelProjectId: existing?.id ?? null,
    };
  },

  /**
   * Guard used internally and by the routes layer: makes sure the user
   * even has a chance to deploy (token + linked repo). Throws a typed
   * error if not, so the wizard can render a setup checklist.
   */
  async assertReady(projectId: string, userId: string): Promise<void> {
    assertConfigured();
    const { project } = await assertProjectAccess(projectId, userId);
    if (!project.githubOwner || !project.githubRepo) {
      throw new ConflictError(
        'Vincula un repositorio de GitHub antes de desplegar.',
      );
    }
  },
};
