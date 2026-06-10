import { Octokit } from 'octokit';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { UserModel } from '../users/user.model';
import { decryptSecret } from '../../shared/utils/crypto';
import { ProjectModel, type ProjectDocument } from '../projects/project.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { TeamMemberModel } from '../teams/team-member.model';
import { activityService } from '../activity/activity.service';
import { AppError } from '../../shared/errors/AppError';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
} from '../../shared/errors/http-errors';
import {
  STACK_RULES,
  MANIFEST_FILES,
  type StackRule,
  type StackSignal,
} from './stack-rules';

interface RepoCoords {
  owner: string;
  repo: string;
}

export interface PublicRepoInfo {
  owner: string;
  repo: string;
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  url: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  pushedAt: string | null;
}

export interface CommitItem {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorAvatar?: string;
  authorLogin?: string;
  date: string | null;
  url: string;
}

export interface BranchItem {
  name: string;
  protected: boolean;
  sha: string;
}

export interface IssueItem {
  number: number;
  title: string;
  state: 'open' | 'closed';
  authorLogin: string;
  authorAvatar?: string;
  createdAt: string;
  url: string;
  comments: number;
  isPullRequest: boolean;
}

export interface StackEvidence {
  /** Human-readable signal: "package.json: next@14.0.0" or "next.config.ts present". */
  description: string;
  /** Path to the file that triggered this signal, if applicable. */
  file?: string;
}

export interface StackMatch {
  id: string;
  name: string;
  category: string;
  hint?: string;
  icon?: string;
  /** 0–1 confidence based on number of signals fired. */
  confidence: number;
  /** Each signal that contributed to the match. */
  evidence: StackEvidence[];
}

export interface StackDetectionResult {
  /** All matches with non-zero confidence, sorted descending. */
  matches: StackMatch[];
  /** First match (best confidence) if any — shortcut for the UI. */
  primary: StackMatch | null;
  /** Repo branch the detection was run against. */
  branch: string;
  /** When the scan finished (server time). */
  detectedAt: string;
  /** True when no rule matched anything — useful for "couldn't detect" UI copy. */
  empty: boolean;
}

// ---------------------------------------------------------------------------

/** Decrypted GitHub OAuth token for a user, or null if not connected. */
const userGithubToken = async (userId?: string): Promise<string | null> => {
  if (!userId) return null;
  const user = await UserModel.findById(userId).select('githubTokenEnc').lean();
  return user?.githubTokenEnc ? decryptSecret(user.githubTokenEnc) : null;
};

/**
 * Octokit client for a request. Prefers the calling user's connected GitHub
 * token (per-user OAuth) so private repos and "create issue as me" work;
 * falls back to the shared GITHUB_TOKEN PAT, then to anonymous (public, but
 * heavily rate-limited).
 */
const githubClient = async (userId?: string): Promise<Octokit> => {
  const userToken = await userGithubToken(userId);
  if (userToken) return new Octokit({ auth: userToken });
  return env.githubToken ? new Octokit({ auth: env.githubToken }) : new Octokit();
};

const parseUrl = (input: string): RepoCoords | null => {
  // Accepts:
  //   - "owner/repo"
  //   - "https://github.com/owner/repo"
  //   - "git@github.com:owner/repo.git"
  const trimmed = input.trim().replace(/\.git$/, '');
  const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(trimmed);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  const url = /github\.com[/:]([^/]+)\/([^/]+?)(?:\/|$)/i.exec(trimmed);
  if (url) return { owner: url[1], repo: url[2] };
  const slug = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (slug) return { owner: slug[1], repo: slug[2] };
  return null;
};

const assertProjectAccess = async (
  projectId: string,
  userId: string,
): Promise<{ project: ProjectDocument; teamId: Types.ObjectId }> => {
  if (!Types.ObjectId.isValid(projectId)) {
    throw new NotFoundError('Project not found');
  }
  const project = await ProjectModel.findById(projectId);
  if (!project) throw new NotFoundError('Project not found');

  const isProjectMember = project.members.some((m) => m.toString() === userId);
  if (!isProjectMember) {
    const teamMember = await TeamMemberModel.findOne({
      team: project.team,
      user: new Types.ObjectId(userId),
      status: 'ACTIVE',
    }).lean();
    if (!teamMember) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }
  return { project, teamId: project.team };
};

const wrapGithubError = (error: unknown): never => {
  const e = error as { status?: number; message?: string };
  if (e.status === 404) {
    throw new NotFoundError(
      'No se encontró el repositorio en GitHub. Verifica owner/repo y que sea accesible.',
    );
  }
  if (e.status === 401) {
    throw new AppError(
      'GitHub rechazó la autenticación. Configura GITHUB_TOKEN en el backend.',
      502,
      'GITHUB_AUTH_FAILED',
    );
  }
  if (e.status === 403) {
    throw new AppError(
      'GitHub bloqueó la petición (rate limit o falta de permisos).',
      502,
      'GITHUB_RATE_LIMIT',
    );
  }
  throw new AppError(
    `Error de GitHub: ${e.message ?? 'desconocido'}`,
    502,
    'GITHUB_ERROR',
  );
};

const requireLinked = (project: ProjectDocument): RepoCoords => {
  if (!project.githubOwner || !project.githubRepo) {
    throw new BadRequestError(
      'Este proyecto no tiene un repositorio de GitHub vinculado.',
    );
  }
  return { owner: project.githubOwner, repo: project.githubRepo };
};

// ---------------------------------------------------------------------------

export const githubService = {
  parseUrl,

  async linkRepo(
    projectId: string,
    userId: string,
    input: string,
  ): Promise<PublicRepoInfo> {
    const { project, teamId } = await assertProjectAccess(projectId, userId);
    const coords = parseUrl(input);
    if (!coords) {
      throw new BadRequestError(
        'URL inválida. Usa "owner/repo" o el enlace completo de GitHub.',
      );
    }

    const octokit = await githubClient(userId);
    let info: PublicRepoInfo;
    try {
      const { data } = await octokit.rest.repos.get(coords);
      info = {
        owner: data.owner.login,
        repo: data.name,
        description: data.description,
        defaultBranch: data.default_branch,
        isPrivate: data.private,
        url: data.html_url,
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        language: data.language,
        pushedAt: data.pushed_at,
      };
    } catch (error) {
      return wrapGithubError(error);
    }

    if (info.isPrivate) {
      const subscription = await SubscriptionModel.findOne({ team: teamId }).lean();
      if (!subscription?.limits?.canUseGithubPrivateRepos) {
        throw new PlanLimitError(
          'Tu plan actual no permite vincular repos privados de GitHub. ' +
            'Cambia a PRO o superior.',
          { feature: 'canUseGithubPrivateRepos', currentPlan: subscription?.plan ?? 'FREE' },
        );
      }
    }

    project.githubOwner = info.owner;
    project.githubRepo = info.repo;
    project.repositoryUrl = info.url;
    project.defaultBranch = info.defaultBranch;
    await project.save();

    await activityService.log({
      actor: userId,
      team: teamId,
      project: project._id,
      type: 'GITHUB_SYNCED',
      message: `Repositorio vinculado: ${info.owner}/${info.repo}`,
      metadata: { owner: info.owner, repo: info.repo, isPrivate: info.isPrivate },
    });

    return info;
  },

  async unlinkRepo(projectId: string, userId: string): Promise<void> {
    const { project, teamId } = await assertProjectAccess(projectId, userId);
    const previous =
      project.githubOwner && project.githubRepo
        ? `${project.githubOwner}/${project.githubRepo}`
        : null;
    project.githubOwner = undefined;
    project.githubRepo = undefined;
    await project.save();
    if (previous) {
      await activityService.log({
        actor: userId,
        team: teamId,
        project: project._id,
        type: 'GITHUB_SYNCED',
        message: `Repositorio desvinculado: ${previous}`,
      });
    }
  },

  async getRepoInfo(projectId: string, userId: string): Promise<PublicRepoInfo> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = await githubClient(userId);
    try {
      const { data } = await octokit.rest.repos.get(coords);
      return {
        owner: data.owner.login,
        repo: data.name,
        description: data.description,
        defaultBranch: data.default_branch,
        isPrivate: data.private,
        url: data.html_url,
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        language: data.language,
        pushedAt: data.pushed_at,
      };
    } catch (error) {
      return wrapGithubError(error);
    }
  },

  /**
   * Compact text snapshot of the repo (info + root files + README +
   * package.json) for feeding the AI doc generator. Best-effort: missing
   * pieces are simply skipped.
   */
  async getAiRepoContext(projectId: string, userId: string): Promise<string> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = await githubClient(userId);

    const parts: string[] = [`Repositorio: ${coords.owner}/${coords.repo}`];

    try {
      const { data } = await octokit.rest.repos.get(coords);
      if (data.description) parts.push(`Descripción: ${data.description}`);
      if (data.language) parts.push(`Lenguaje principal: ${data.language}`);
      parts.push(`Rama por defecto: ${data.default_branch}`);
    } catch (error) {
      return wrapGithubError(error);
    }

    try {
      const { data } = await octokit.rest.repos.getContent({ ...coords, path: '' });
      if (Array.isArray(data)) {
        parts.push(`Archivos en la raíz: ${data.map((f) => f.name).join(', ')}`);
      }
    } catch {
      /* no root listing — skip */
    }

    try {
      const { data } = await octokit.rest.repos.getReadme(coords);
      const readme = Buffer.from(data.content, 'base64').toString('utf8').slice(0, 6000);
      if (readme.trim()) parts.push(`\n--- README actual ---\n${readme}`);
    } catch {
      /* no README — skip */
    }

    try {
      const { data } = await octokit.rest.repos.getContent({ ...coords, path: 'package.json' });
      if (!Array.isArray(data) && data.type === 'file' && data.content) {
        const pkg = Buffer.from(data.content, 'base64').toString('utf8').slice(0, 3000);
        parts.push(`\n--- package.json ---\n${pkg}`);
      }
    } catch {
      /* no package.json — skip */
    }

    return parts.join('\n');
  },

  async listCommits(
    projectId: string,
    userId: string,
    perPage = 15,
  ): Promise<CommitItem[]> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = await githubClient(userId);
    try {
      const { data } = await octokit.rest.repos.listCommits({
        ...coords,
        per_page: Math.min(perPage, 30),
      });
      // Octokit's response typings collapse to `never` here under strict TS,
      // so we cast to a small shape we trust.
      return (data as unknown as Array<{
        sha: string;
        commit: { message?: string; author?: { name?: string; date?: string } };
        author?: { login?: string; avatar_url?: string } | null;
        html_url: string;
      }>).map((c) => ({
        sha: c.sha,
        shortSha: c.sha.slice(0, 7),
        message: (c.commit.message ?? '').split('\n')[0] ?? '',
        authorName: c.commit.author?.name ?? c.author?.login ?? 'desconocido',
        authorLogin: c.author?.login,
        authorAvatar: c.author?.avatar_url,
        date: c.commit.author?.date ?? null,
        url: c.html_url,
      }));
    } catch (error) {
      return wrapGithubError(error);
    }
  },

  async listBranches(
    projectId: string,
    userId: string,
  ): Promise<BranchItem[]> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = await githubClient(userId);
    try {
      const { data } = await octokit.rest.repos.listBranches({
        ...coords,
        per_page: 30,
      });
      return (data as unknown as Array<{
        name: string;
        protected: boolean;
        commit: { sha: string };
      }>).map((b) => ({
        name: b.name,
        protected: b.protected,
        sha: b.commit.sha,
      }));
    } catch (error) {
      return wrapGithubError(error);
    }
  },

  async listIssues(
    projectId: string,
    userId: string,
    state: 'open' | 'closed' | 'all' = 'open',
  ): Promise<IssueItem[]> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = await githubClient(userId);
    try {
      const { data } = await octokit.rest.issues.listForRepo({
        ...coords,
        state,
        per_page: 20,
      });
      return (data as unknown as Array<{
        number: number;
        title: string;
        state: string;
        user?: { login?: string; avatar_url?: string } | null;
        created_at: string;
        html_url: string;
        comments: number;
        pull_request?: unknown;
      }>).map((i) => ({
        number: i.number,
        title: i.title,
        state: i.state as 'open' | 'closed',
        authorLogin: i.user?.login ?? 'desconocido',
        authorAvatar: i.user?.avatar_url,
        createdAt: i.created_at,
        url: i.html_url,
        comments: i.comments,
        isPullRequest: Boolean(i.pull_request),
      }));
    } catch (error) {
      return wrapGithubError(error);
    }
  },

  /**
   * Inspect the linked repository's root tree + a curated set of manifest
   * files, then run every rule from `STACK_RULES` against the collected
   * evidence. Returns matches with confidence scores and per-signal
   * evidence. Designed to be ~2-5 GitHub API calls regardless of repo size:
   * one tree read at the default branch, then one content read per manifest
   * actually present at the root.
   */
  async detectStack(
    projectId: string,
    userId: string,
  ): Promise<StackDetectionResult> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const branch = project.defaultBranch || 'main';
    const octokit = await githubClient(userId);

    // 1) Read the root tree (recursive=false, just root entries).
    let rootFiles: Set<string>;
    try {
      const { data } = await octokit.rest.git.getTree({
        ...coords,
        tree_sha: branch,
      });
      // Octokit's strict types collapse `tree` to `never[]` under our TS
      // config, so we narrow to the shape we actually need.
      const entries = (data.tree ?? []) as Array<{
        type?: string;
        path?: string;
      }>;
      rootFiles = new Set(
        entries
          .filter((entry) => entry.type === 'blob' && !!entry.path)
          .map((entry) => entry.path as string),
      );
    } catch (error) {
      return wrapGithubError(error);
    }

    // 2) Pull the content of every manifest that's actually present.
    //    We never read non-manifest files — keeps the API budget bounded.
    const manifestContent = new Map<string, string>();
    const presentManifests = MANIFEST_FILES.filter((m) => rootFiles.has(m));
    await Promise.all(
      presentManifests.map(async (path) => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            ...coords,
            path,
            ref: branch,
          });
          if (
            !Array.isArray(data) &&
            'content' in data &&
            typeof data.content === 'string'
          ) {
            const text = Buffer.from(data.content, 'base64').toString('utf-8');
            manifestContent.set(path, text);
          }
        } catch {
          // Best-effort: a missing or oversized file isn't fatal — the rule
          // simply won't match that signal.
        }
      }),
    );

    // 3) Parse package.json once for the dependency-based rules.
    const packageJson = manifestContent.get('package.json');
    let nodeDeps: Record<string, string> = {};
    if (packageJson) {
      try {
        const parsed = JSON.parse(packageJson) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
        };
        nodeDeps = {
          ...(parsed.dependencies ?? {}),
          ...(parsed.devDependencies ?? {}),
          ...(parsed.peerDependencies ?? {}),
        };
      } catch {
        // Malformed package.json: treat as no deps. The user's actual repo
        // is broken; we won't crash detection over it.
      }
    }

    // 4) Run rules.
    const matches: StackMatch[] = [];
    for (const rule of STACK_RULES) {
      const evidence = this.collectEvidence(
        rule,
        rootFiles,
        manifestContent,
        nodeDeps,
      );
      if (evidence.length === 0) continue;
      const rawConfidence = evidence.length * rule.perSignalConfidence;
      const confidence = Math.min(1, Math.round(rawConfidence * 100) / 100);
      matches.push({
        id: rule.id,
        name: rule.name,
        category: rule.category,
        hint: rule.hint,
        icon: rule.icon,
        confidence,
        evidence,
      });
    }
    matches.sort((a, b) => b.confidence - a.confidence);

    return {
      matches,
      primary: matches[0] ?? null,
      branch,
      detectedAt: new Date().toISOString(),
      empty: matches.length === 0,
    };
  },

  /**
   * Pure helper: turn a rule + collected facts into the list of triggered
   * signals (with human-readable evidence). Kept as a method on the
   * service so unit tests can mock it without touching Octokit.
   */
  collectEvidence(
    rule: StackRule,
    rootFiles: Set<string>,
    manifestContent: Map<string, string>,
    nodeDeps: Record<string, string>,
  ): StackEvidence[] {
    const out: StackEvidence[] = [];
    for (const signal of rule.signals) {
      const ev = this.evaluateSignal(signal, rootFiles, manifestContent, nodeDeps);
      if (ev) out.push(ev);
    }
    return out;
  },

  evaluateSignal(
    signal: StackSignal,
    rootFiles: Set<string>,
    manifestContent: Map<string, string>,
    nodeDeps: Record<string, string>,
  ): StackEvidence | null {
    switch (signal.type) {
      case 'fileExists': {
        if (rootFiles.has(signal.path)) {
          return { description: `${signal.path} presente`, file: signal.path };
        }
        return null;
      }
      case 'dep': {
        const version = nodeDeps[signal.dep];
        if (version) {
          return {
            description: `package.json: ${signal.dep}@${version}`,
            file: 'package.json',
          };
        }
        return null;
      }
      case 'fileContent': {
        const content = manifestContent.get(signal.path);
        if (!content) return null;
        if (signal.pattern.test(content)) {
          return {
            description: `${signal.path} contiene patrón "${signal.pattern.source}"`,
            file: signal.path,
          };
        }
        return null;
      }
      default:
        return null;
    }
  },

  async createIssue(
    projectId: string,
    userId: string,
    title: string,
    body?: string,
  ): Promise<IssueItem> {
    const { project, teamId } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    if (!env.githubToken) {
      throw new AppError(
        'Para crear issues se requiere configurar GITHUB_TOKEN en el backend.',
        502,
        'GITHUB_NO_TOKEN',
      );
    }
    const octokit = await githubClient(userId);
    try {
      const { data } = await octokit.rest.issues.create({
        ...coords,
        title,
        body,
      });
      await activityService.log({
        actor: userId,
        team: teamId,
        project: project._id,
        type: 'GITHUB_SYNCED',
        message: `Issue #${data.number} creado: ${data.title}`,
        metadata: { issueNumber: data.number },
      });
      return {
        number: data.number,
        title: data.title,
        state: data.state as 'open' | 'closed',
        authorLogin: data.user?.login ?? 'desconocido',
        authorAvatar: data.user?.avatar_url,
        createdAt: data.created_at,
        url: data.html_url,
        comments: data.comments,
        isPullRequest: false,
      };
    } catch (error) {
      return wrapGithubError(error);
    }
  },
};
