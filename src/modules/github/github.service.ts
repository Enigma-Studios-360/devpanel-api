import { Octokit } from 'octokit';
import { Types } from 'mongoose';
import { env } from '../../config/env';
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

// ---------------------------------------------------------------------------

const githubClient = (): Octokit => {
  // We use a single PAT from env. In Phase 9 this becomes per-team OAuth.
  return env.githubToken
    ? new Octokit({ auth: env.githubToken })
    : new Octokit();
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

    const octokit = githubClient();
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
    const octokit = githubClient();
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

  async listCommits(
    projectId: string,
    userId: string,
    perPage = 15,
  ): Promise<CommitItem[]> {
    const { project } = await assertProjectAccess(projectId, userId);
    const coords = requireLinked(project);
    const octokit = githubClient();
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
    const octokit = githubClient();
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
    const octokit = githubClient();
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
    const octokit = githubClient();
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
