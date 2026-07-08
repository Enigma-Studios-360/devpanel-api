import { Types } from 'mongoose';
import { ActivityLogModel, type ActivityType } from './activity.model';
import {
  parsePagination,
  buildPaginationResult,
  type PaginationResult,
} from '../../shared/utils/pagination';

interface LogInput {
  actor: string | Types.ObjectId;
  team?: string | Types.ObjectId;
  project?: string | Types.ObjectId;
  type: ActivityType;
  message: string;
  metadata?: Record<string, unknown>;
}

const safeLog = async (input: LogInput): Promise<void> => {
  try {
    await ActivityLogModel.create({
      actor: input.actor,
      team: input.team,
      project: input.project,
      type: input.type,
      message: input.message,
      metadata: input.metadata,
    });
  } catch (error) {
    // Logging is best-effort; never crash the caller.
    // eslint-disable-next-line no-console
    console.warn('[activity] Failed to write log entry:', (error as Error).message);
  }
};

export const activityService = {
  async log(input: LogInput): Promise<void> {
    await safeLog(input);
  },

  async logUserRegistered(userId: string, name: string): Promise<void> {
    await safeLog({
      actor: userId,
      type: 'USER_REGISTERED',
      message: `${name} se registró en DevPanel`,
    });
  },

  async logTeamCreated(
    teamId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    teamName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      type: 'TEAM_CREATED',
      message: `Equipo "${teamName}" creado`,
    });
  },

  async logProjectCreated(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    projectName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'PROJECT_CREATED',
      message: `Proyecto "${projectName}" creado`,
    });
  },

  async logProjectArchived(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    projectName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'PROJECT_ARCHIVED',
      message: `Proyecto "${projectName}" archivado`,
    });
  },

  async logProjectUpdated(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    projectName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'PROJECT_UPDATED',
      message: `Proyecto "${projectName}" actualizado`,
    });
  },

  async logTaskCreated(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_CREATED',
      message: `Tarea "${taskTitle}" creada`,
    });
  },

  async logTaskUpdated(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_UPDATED',
      message: `Tarea "${taskTitle}" actualizada`,
    });
  },

  async logTaskStatusChanged(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_STATUS_CHANGED',
      message: `"${taskTitle}": ${fromStatus} → ${toStatus}`,
      metadata: { from: fromStatus, to: toStatus },
    });
  },

  async logTaskCommentCreated(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_COMMENT_CREATED',
      message: `Nuevo comentario en "${taskTitle}"`,
    });
  },

  async logTaskArchived(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_ARCHIVED',
      message: `Tarea "${taskTitle}" archivada`,
    });
  },

  async logTaskDeleted(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    taskTitle: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'TASK_DELETED',
      message: `Tarea "${taskTitle}" eliminada`,
    });
  },

  async logFileUploaded(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    fileName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'FILE_UPLOADED',
      message: `Archivo "${fileName}" subido`,
    });
  },

  async logFileDeleted(
    teamId: string | Types.ObjectId,
    projectId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    fileName: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      project: projectId,
      type: 'FILE_DELETED',
      message: `Archivo "${fileName}" eliminado`,
    });
  },

  async logSubscriptionChanged(
    teamId: string | Types.ObjectId,
    actorId: string | Types.ObjectId,
    fromPlan: string,
    toPlan: string,
  ): Promise<void> {
    await safeLog({
      actor: actorId,
      team: teamId,
      type: 'SUBSCRIPTION_CHANGED',
      message: `Plan cambiado de ${fromPlan} a ${toPlan}`,
      metadata: { from: fromPlan, to: toPlan },
    });
  },

  async listByTeam(
    teamId: string,
    query: Record<string, unknown>,
  ): Promise<PaginationResult<unknown>> {
    const params = parsePagination(query);
    const filter = { team: new Types.ObjectId(teamId) };

    const [data, total] = await Promise.all([
      ActivityLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(params.skip)
        .limit(params.limit)
        .populate('actor', 'name email avatarUrl')
        .lean(),
      ActivityLogModel.countDocuments(filter),
    ]);

    return buildPaginationResult(data, total, params);
  },

  async listByProject(
    projectId: string,
    query: Record<string, unknown>,
  ): Promise<PaginationResult<unknown>> {
    const params = parsePagination(query);
    const filter = { project: new Types.ObjectId(projectId) };

    const [data, total] = await Promise.all([
      ActivityLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(params.skip)
        .limit(params.limit)
        .populate('actor', 'name email avatarUrl')
        .lean(),
      ActivityLogModel.countDocuments(filter),
    ]);

    return buildPaginationResult(data, total, params);
  },
};
