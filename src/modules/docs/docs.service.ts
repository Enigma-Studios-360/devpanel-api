import { Types } from 'mongoose';
import {
  ProjectDocModel,
  type ProjectDocDocument,
  DOC_SECTION_KEYS,
  type DocSectionKey,
} from './project-doc.model';
import { ProjectModel } from '../projects/project.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { activityService } from '../activity/activity.service';
import { githubService } from '../github/github.service';
import { deepseekChat } from '../../shared/utils/deepseek';
import { AppError } from '../../shared/errors/AppError';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
} from '../../shared/errors/http-errors';

interface SectionPatch {
  title?: string;
  content?: string;
  completed?: boolean;
}

interface UpdateDocInput {
  sections?: Partial<Record<DocSectionKey, SectionPatch>>;
}

// Default human-readable titles per section
const DEFAULT_TITLES: Record<DocSectionKey, string> = {
  overview: 'Visión general',
  stack: 'Stack tecnológico',
  installation: 'Instalación',
  env: 'Variables de entorno',
  commands: 'Comandos',
  database: 'Base de datos',
  deploy: 'Deploy',
  commonErrors: 'Errores comunes',
  contributors: 'Contribuidores',
};

const assertProjectAccess = async (
  projectId: string,
  userId: string,
): Promise<{ teamId: Types.ObjectId; projectId: Types.ObjectId }> => {
  if (!Types.ObjectId.isValid(projectId)) {
    throw new NotFoundError('Project not found');
  }
  const project = await ProjectModel.findById(projectId).select('_id team members');
  if (!project) throw new NotFoundError('Project not found');

  const userObjId = new Types.ObjectId(userId);
  const isProjectMember = project.members.some((m) => m.toString() === userId);
  if (!isProjectMember) {
    const teamMember = await TeamMemberModel.findOne({
      team: project.team,
      user: userObjId,
      status: 'ACTIVE',
    }).lean();
    if (!teamMember) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return { teamId: project.team, projectId: project._id };
};

const recomputeCompletion = (doc: ProjectDocDocument): void => {
  let completed = 0;
  for (const key of DOC_SECTION_KEYS) {
    const section = (doc.sections as unknown as Record<string, { completed?: boolean }>)[key];
    if (section?.completed) completed += 1;
  }
  doc.completionPercent = Math.round((completed / DOC_SECTION_KEYS.length) * 100);
};

const escapeMd = (s: string): string => s.replace(/\r\n/g, '\n').trim();

const buildReadme = (doc: ProjectDocDocument, projectName: string): string => {
  const lines: string[] = [];
  lines.push(`# ${projectName}`);
  lines.push('');

  for (const key of DOC_SECTION_KEYS) {
    const section = (doc.sections as unknown as Record<string, { title?: string; content?: string }>)[key];
    const title = section?.title?.trim() || DEFAULT_TITLES[key];
    const content = escapeMd(section?.content ?? '');
    if (!content) continue;
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_README generado con DevPanel · completion: ${doc.completionPercent}%_`);
  lines.push('');
  return lines.join('\n');
};

export const docsService = {
  /**
   * Returns the project's doc, lazy-creating the document with default
   * section titles the first time it's accessed.
   */
  async getOrCreate(
    projectId: string,
    userId: string,
  ): Promise<ProjectDocDocument> {
    await assertProjectAccess(projectId, userId);
    const projectObjId = new Types.ObjectId(projectId);
    let doc = await ProjectDocModel.findOne({ project: projectObjId });
    if (doc) return doc;

    const sections = DOC_SECTION_KEYS.reduce<Record<string, unknown>>(
      (acc, key) => {
        acc[key] = {
          title: DEFAULT_TITLES[key],
          content: '',
          completed: false,
        };
        return acc;
      },
      {},
    );

    doc = await ProjectDocModel.create({
      project: projectObjId,
      sections,
      completionPercent: 0,
    });
    return doc;
  },

  async update(
    projectId: string,
    userId: string,
    input: UpdateDocInput,
  ): Promise<ProjectDocDocument> {
    const { teamId } = await assertProjectAccess(projectId, userId);
    const doc = await this.getOrCreate(projectId, userId);

    if (input.sections) {
      for (const key of DOC_SECTION_KEYS) {
        const patch = input.sections[key];
        if (!patch) continue;
        const current = (doc.sections as unknown as Record<string, { title: string; content: string; completed: boolean }>)[key];
        if (!current) continue;
        if (patch.title !== undefined) current.title = patch.title;
        if (patch.content !== undefined) current.content = patch.content;
        if (patch.completed !== undefined) current.completed = patch.completed;
      }
      doc.markModified('sections');
    }

    recomputeCompletion(doc);
    doc.updatedBy = new Types.ObjectId(userId);
    await doc.save();

    const project = await ProjectModel.findById(projectId).select('name').lean();
    await activityService.log({
      actor: userId,
      team: teamId,
      project: new Types.ObjectId(projectId),
      type: 'DOC_UPDATED',
      message: `Documentación de "${project?.name ?? 'proyecto'}" actualizada (${doc.completionPercent}%)`,
    });

    return doc;
  },

  async generateReadme(
    projectId: string,
    userId: string,
  ): Promise<{ markdown: string; doc: ProjectDocDocument; projectName: string }> {
    await assertProjectAccess(projectId, userId);
    const doc = await this.getOrCreate(projectId, userId);
    const project = await ProjectModel.findById(projectId).select('name').lean();
    const projectName = project?.name ?? 'Project';
    return { markdown: buildReadme(doc, projectName), doc, projectName };
  },

  /**
   * Generate content for all 9 doc sections from the linked GitHub repo using
   * DeepSeek, then persist it through the normal `update` path (which logs
   * activity + recomputes completion). Requires a linked repository.
   */
  async generateWithAi(
    projectId: string,
    userId: string,
  ): Promise<ProjectDocDocument> {
    await assertProjectAccess(projectId, userId);
    const project = await ProjectModel.findById(projectId)
      .select('githubOwner githubRepo')
      .lean();
    if (!project?.githubOwner || !project?.githubRepo) {
      throw new BadRequestError(
        'Primero vincula un repositorio de GitHub (pestaña GitHub) para generar la documentación con IA.',
      );
    }

    const context = await githubService.getAiRepoContext(projectId, userId);

    const sectionList = DOC_SECTION_KEYS.map(
      (k) => `"${k}" (${DEFAULT_TITLES[k]})`,
    ).join(', ');

    const system =
      'Eres un escritor técnico. A partir del contexto de un repositorio, ' +
      'redactas documentación clara, concreta y en español, en formato Markdown, ' +
      'para cada sección de un README. No inventes datos que el contexto no ' +
      'respalde; si falta información, escribe una guía genérica razonable acorde ' +
      'al stack detectado. Devuelves EXCLUSIVAMENTE un objeto JSON válido.';

    const userPrompt =
      `Contexto del repositorio:\n\n${context}\n\n` +
      `Devuelve un objeto JSON con EXACTAMENTE estas claves: ${sectionList}. ` +
      'El valor de cada clave es el contenido en Markdown de esa sección ' +
      '(NO incluyas el encabezado del título, solo el cuerpo). Sé conciso pero útil.';

    const raw = await deepseekChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
      { jsonMode: true, maxTokens: 2200, temperature: 0.4 },
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new AppError(
        'La IA devolvió un formato inesperado. Intenta de nuevo.',
        502,
        'DOCS_AI_BAD_FORMAT',
      );
    }

    const sections: Partial<Record<DocSectionKey, SectionPatch>> = {};
    for (const key of DOC_SECTION_KEYS) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) {
        sections[key] = { content: value.trim() };
      }
    }
    if (Object.keys(sections).length === 0) {
      throw new AppError(
        'La IA no generó contenido utilizable. Intenta de nuevo.',
        502,
        'DOCS_AI_EMPTY',
      );
    }

    return this.update(projectId, userId, { sections });
  },

  /**
   * Download README as a `.md` file. Gated by plan: only teams whose
   * subscription has `canDownloadReadme: true` are allowed.
   */
  async downloadReadme(
    projectId: string,
    userId: string,
  ): Promise<{ markdown: string; filename: string }> {
    const { teamId } = await assertProjectAccess(projectId, userId);

    const subscription = await SubscriptionModel.findOne({ team: teamId }).lean();
    if (!subscription?.limits?.canDownloadReadme) {
      throw new PlanLimitError(
        'Tu plan actual no permite descargar el README. Cambia de plan para habilitarlo.',
        { feature: 'canDownloadReadme', currentPlan: subscription?.plan ?? 'FREE' },
      );
    }

    const { markdown, projectName } = await this.generateReadme(projectId, userId);
    const slug = projectName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project';
    return { markdown, filename: `${slug}-README.md` };
  },

  /** Cheap helper used by the project dashboard. */
  async completionFor(projectId: string): Promise<number> {
    const doc = await ProjectDocModel.findOne({
      project: new Types.ObjectId(projectId),
    })
      .select('completionPercent')
      .lean();
    return doc?.completionPercent ?? 0;
  },
};
