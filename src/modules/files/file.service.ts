import fs from 'fs';
import { Types } from 'mongoose';
import { ProjectFileModel } from './file.model';
import { ProjectModel } from '../projects/project.model';
import { TeamModel } from '../teams/team.model';
import { activityService } from '../activity/activity.service';
import {
  BadRequestError,
  NotFoundError,
  PlanLimitError,
} from '../../shared/errors/http-errors';
import { PLAN_LIMITS, type PlanCode } from '../../shared/constants/plans';

const MB = 1024 * 1024;

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  plan: PlanCode;
}

/** Best-effort unlink; the DB document is the source of truth. */
const safeUnlink = (absolutePath: string): void => {
  fs.promises.unlink(absolutePath).catch(() => undefined);
};

/**
 * Storage is metered per TEAM (the plan lives on the team): the sum of every
 * file across all of the team's projects counts against `maxStorageMb`.
 */
const getTeamStorageUsage = async (
  teamId: Types.ObjectId,
): Promise<StorageUsage> => {
  const team = await TeamModel.findById(teamId).select('plan').lean();
  if (!team) throw new NotFoundError('Team not found');

  const plan = (team.plan ?? 'FREE') as PlanCode;
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;

  const projects = await ProjectModel.find({ team: teamId })
    .select('_id')
    .lean();
  const totals = await ProjectFileModel.aggregate<{ total: number }>([
    { $match: { project: { $in: projects.map((p) => p._id) } } },
    { $group: { _id: null, total: { $sum: '$size' } } },
  ]);

  return {
    usedBytes: totals[0]?.total ?? 0,
    limitBytes: limits.maxStorageMb * MB,
    plan,
  };
};

const requireProject = async (projectId: string) => {
  const project = await ProjectModel.findById(projectId)
    .select('_id team name')
    .lean();
  if (!project) throw new NotFoundError('Project not found');
  return project;
};

export const fileService = {
  async listByProject(
    projectId: string,
  ): Promise<{ files: unknown[]; usage: StorageUsage }> {
    const project = await requireProject(projectId);

    const docs = await ProjectFileModel.find({ project: project._id })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email');

    const usage = await getTeamStorageUsage(project.team);
    return { files: docs.map((d) => d.toJSON()), usage };
  },

  async create(
    projectId: string,
    actorId: string,
    file: Express.Multer.File,
    taskId?: string,
  ): Promise<{ file: unknown; usage: StorageUsage }> {
    const project = await requireProject(projectId);

    if (taskId !== undefined && taskId !== '' && !Types.ObjectId.isValid(taskId)) {
      safeUnlink(file.path);
      throw new BadRequestError('Invalid task id');
    }

    const usage = await getTeamStorageUsage(project.team);
    if (usage.usedBytes + file.size > usage.limitBytes) {
      safeUnlink(file.path);
      throw new PlanLimitError(
        `El plan ${usage.plan} permite ${usage.limitBytes / MB} MB de archivos y el equipo ya usa ${Math.round(usage.usedBytes / MB)} MB`,
        { usedBytes: usage.usedBytes, limitBytes: usage.limitBytes, plan: usage.plan },
      );
    }

    const created = await ProjectFileModel.create({
      project: project._id,
      task: taskId ? new Types.ObjectId(taskId) : undefined,
      uploadedBy: new Types.ObjectId(actorId),
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    });

    await activityService.logFileUploaded(
      project.team,
      project._id,
      actorId,
      file.originalname,
    );

    const populated = await created.populate('uploadedBy', 'name email');
    return {
      file: populated.toJSON(),
      usage: { ...usage, usedBytes: usage.usedBytes + file.size },
    };
  },

  async getForDownload(
    fileId: string,
  ): Promise<{ absolutePath: string; originalName: string; mimeType: string }> {
    const file = await ProjectFileModel.findById(fileId).lean();
    if (!file) throw new NotFoundError('File not found');
    if (!fs.existsSync(file.path)) {
      throw new NotFoundError('File is no longer available in storage');
    }
    return {
      absolutePath: file.path,
      originalName: file.originalName,
      mimeType: file.mimeType,
    };
  },

  async remove(fileId: string, actorId: string): Promise<{ usage: StorageUsage }> {
    const file = await ProjectFileModel.findById(fileId);
    if (!file) throw new NotFoundError('File not found');

    const project = await ProjectModel.findById(file.project)
      .select('_id team')
      .lean();

    await file.deleteOne();
    safeUnlink(file.path);

    if (project) {
      await activityService.logFileDeleted(
        project.team,
        project._id,
        actorId,
        file.originalName,
      );
      return { usage: await getTeamStorageUsage(project.team) };
    }
    return {
      usage: { usedBytes: 0, limitBytes: PLAN_LIMITS.FREE.maxStorageMb * MB, plan: 'FREE' },
    };
  },
};
