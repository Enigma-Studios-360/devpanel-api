import { Types } from 'mongoose';
import { ProjectModel, type ProjectDocument } from './project.model';
import { SubscriptionModel } from '../subscriptions/subscription.model';
import { ActivityLogModel } from '../activity/activity.model';
import { TeamModel } from '../teams/team.model';
import { activityService } from '../activity/activity.service';
import { taskService } from '../tasks/task.service';
import { docsService } from '../docs/docs.service';
import { slugify } from '../../shared/utils/slugify';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PlanLimitError,
} from '../../shared/errors/http-errors';
import { PLAN_LIMITS, type PlanCode } from '../../shared/constants/plans';
import type { ProjectStatus } from '../../shared/constants/project-status';

interface CreateProjectInput {
  name: string;
  description?: string;
  stack?: string[];
  status?: ProjectStatus;
  dueDate?: string;
  repositoryUrl?: string;
  color?: string;
}

interface UpdateProjectInput extends Partial<CreateProjectInput> {}

const ensureUniqueSlugForTeam = async (
  teamId: Types.ObjectId,
  base: string,
): Promise<string> => {
  const safeBase = slugify(base) || 'project';
  let candidate = safeBase;
  let suffix = 1;
  while (await ProjectModel.exists({ team: teamId, slug: candidate })) {
    suffix += 1;
    candidate = `${safeBase}-${suffix}`;
    if (suffix > 50) {
      throw new ConflictError('Could not generate a unique project slug');
    }
  }
  return candidate;
};

const enforceProjectLimit = async (teamId: Types.ObjectId): Promise<void> => {
  const subscription = await SubscriptionModel.findOne({ team: teamId }).lean();
  const limits = subscription?.limits ?? PLAN_LIMITS.FREE;

  const activeCount = await ProjectModel.countDocuments({
    team: teamId,
    status: { $ne: 'ARCHIVED' },
  });

  if (activeCount >= limits.maxProjects) {
    throw new PlanLimitError(
      `Tu plan permite ${limits.maxProjects} proyecto(s) activo(s). Archiva uno o haz upgrade para crear más.`,
      {
        currentPlan: subscription?.plan ?? 'FREE',
        maxProjects: limits.maxProjects,
        activeProjects: activeCount,
      },
    );
  }
};

export const projectService = {
  async listByTeam(teamId: string): Promise<ProjectDocument[]> {
    return ProjectModel.find({ team: new Types.ObjectId(teamId) })
      .sort({ archivedAt: 1, createdAt: -1 });
  },

  async create(
    teamId: string,
    actorId: string,
    input: CreateProjectInput,
  ): Promise<ProjectDocument> {
    const teamObjId = new Types.ObjectId(teamId);
    await enforceProjectLimit(teamObjId);

    const slug = await ensureUniqueSlugForTeam(teamObjId, input.name);

    const project = await ProjectModel.create({
      team: teamObjId,
      name: input.name.trim(),
      slug,
      description: input.description,
      stack: input.stack ?? [],
      status: input.status ?? 'PLANNING',
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      repositoryUrl: input.repositoryUrl,
      color: input.color ?? '#3B82F6',
      members: [new Types.ObjectId(actorId)],
      createdBy: new Types.ObjectId(actorId),
    });

    await activityService.logProjectCreated(
      teamObjId,
      project._id,
      actorId,
      project.name,
    );
    return project;
  },

  async getById(projectId: string): Promise<ProjectDocument> {
    const project = await ProjectModel.findById(projectId);
    if (!project) throw new NotFoundError('Project not found');
    return project;
  },

  async getByIdWithTeamId(projectId: string): Promise<{
    project: ProjectDocument;
    teamId: string;
  }> {
    const project = await this.getById(projectId);
    return { project, teamId: project.team.toString() };
  },

  async update(
    projectId: string,
    actorId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDocument> {
    const project = await this.getById(projectId);
    if (input.name !== undefined) project.name = input.name.trim();
    if (input.description !== undefined) project.description = input.description;
    if (input.stack !== undefined) project.stack = input.stack;
    if (input.status !== undefined) project.status = input.status;
    if (input.dueDate !== undefined) {
      project.dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
    }
    if (input.repositoryUrl !== undefined) project.repositoryUrl = input.repositoryUrl;
    if (input.color !== undefined) project.color = input.color;
    await project.save();
    await activityService.logProjectUpdated(
      project.team,
      project._id,
      actorId,
      project.name,
    );
    return project;
  },

  async archive(projectId: string, actorId: string): Promise<ProjectDocument> {
    const project = await this.getById(projectId);
    if (project.status === 'ARCHIVED') {
      throw new ConflictError('Project is already archived');
    }
    project.status = 'ARCHIVED';
    project.archivedAt = new Date();
    await project.save();

    await activityService.logProjectArchived(
      project.team,
      project._id,
      actorId,
      project.name,
    );
    return project;
  },

  async dashboard(projectId: string): Promise<unknown> {
    const project = await this.getById(projectId);
    const [team, subscription, recentActivity, taskMetrics, docPercent] =
      await Promise.all([
        TeamModel.findById(project.team).lean(),
        SubscriptionModel.findOne({ team: project.team }).lean(),
        ActivityLogModel.find({ project: project._id })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('actor', 'name avatarUrl')
          .lean(),
        taskService.metricsForProject(projectId),
        docsService.completionFor(projectId),
      ]);

    return {
      project,
      metrics: {
        ...taskMetrics,
        documentationPercent: docPercent,
      },
      recentActivity,
      plan: {
        code: (subscription?.plan ?? team?.plan ?? 'FREE') as PlanCode,
        limits: subscription?.limits ?? PLAN_LIMITS.FREE,
      },
    };
  },

  async assertUserCanAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectDocument> {
    const project = await this.getById(projectId);
    // Simple membership check via members array. Team membership is covered
    // through the create/update flow. Phase 3 will tighten this with explicit
    // project ACL.
    const isMember = project.members.some((m) => m.toString() === userId);
    if (!isMember) {
      // Not a project member: fall back to team membership check.
      const { TeamMemberModel } = await import('../teams/team-member.model');
      const teamMember = await TeamMemberModel.findOne({
        team: project.team,
        user: new Types.ObjectId(userId),
        status: 'ACTIVE',
      }).lean();
      if (!teamMember) {
        throw new ForbiddenError('You do not have access to this project');
      }
    }
    return project;
  },
};
