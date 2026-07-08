import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { TeamMemberModel } from '../modules/teams/team-member.model';
import { ProjectModel } from '../modules/projects/project.model';
import { TaskModel } from '../modules/tasks/task.model';
import { ProjectFileModel } from '../modules/files/file.model';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../shared/errors/http-errors';
import type { TeamRole } from '../shared/constants/roles';
import { getParam } from '../shared/utils/request';

/**
 * Resolves the team membership of the authenticated user for the
 * `:teamId` route param. Adds `teamId` and `teamRole` to req.user.
 *
 * Must be mounted AFTER `requireAuth`.
 */
export const resolveTeamMembership = (
  param: string = 'teamId',
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required'));
      }
      const teamId = getParam(req, param);
      if (!teamId || !Types.ObjectId.isValid(teamId)) {
        return next(new BadRequestError('Invalid team id'));
      }

      const membership = await TeamMemberModel.findOne({
        team: new Types.ObjectId(teamId),
        user: new Types.ObjectId(req.user.id),
        status: 'ACTIVE',
      }).lean();

      if (!membership) {
        return next(new ForbiddenError('You are not a member of this team'));
      }

      req.user.teamId = teamId;
      req.user.teamRole = membership.role as TeamRole;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * Requires that the resolved team role is one of `allowed`.
 * Must run after `resolveTeamMembership` / `resolveProjectMembership` /
 * `resolveTaskMembership`.
 */
export const requireTeamRole = (
  ...allowed: TeamRole[]
): RequestHandler => {
  return (req, _res, next) => {
    const role = req.user?.teamRole;
    if (!role || !allowed.includes(role)) {
      return next(new ForbiddenError('Insufficient team role'));
    }
    return next();
  };
};

/**
 * Resolves the user's role on the team that owns the project referenced by
 * `:projectId`. Sets `req.user.teamId` and `req.user.teamRole`.
 *
 * Must be mounted AFTER `requireAuth`. Pair with `requireTeamRole(...)` to
 * gate write endpoints by role (e.g. block VIEWER from creating tasks).
 *
 * Notes:
 * - Returns 404 NotFoundError when the project does not exist, mirroring the
 *   existing behavior of `task.service.assertProjectAccess`.
 * - Returns 403 ForbiddenError when the user has no active membership on the
 *   project's team. Project-level `members[]` is NOT a substitute for team
 *   membership at this stage.
 */
export const resolveProjectMembership = (
  param: string = 'projectId',
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required'));
      }
      const projectId = getParam(req, param);
      if (!projectId || !Types.ObjectId.isValid(projectId)) {
        return next(new BadRequestError('Invalid project id'));
      }

      const project = await ProjectModel.findById(projectId).select('_id team').lean();
      if (!project) {
        return next(new NotFoundError('Project not found'));
      }

      const membership = await TeamMemberModel.findOne({
        team: project.team,
        user: new Types.ObjectId(req.user.id),
        status: 'ACTIVE',
      }).lean();

      if (!membership) {
        return next(new ForbiddenError('You do not have access to this project'));
      }

      req.user.teamId = project.team.toString();
      req.user.teamRole = membership.role as TeamRole;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * Resolves the user's role on the team that owns the task referenced by
 * `:taskId`. Sets `req.user.teamId` and `req.user.teamRole`.
 *
 * Must be mounted AFTER `requireAuth`. Pair with `requireTeamRole(...)` to
 * gate write endpoints (status change, comments, edit) by role.
 */
/**
 * Resolves the user's role on the team that owns the file referenced by
 * `:fileId`. Sets `req.user.teamId` and `req.user.teamRole`.
 *
 * Must be mounted AFTER `requireAuth`. Pair with `requireTeamRole(...)` to
 * gate destructive endpoints (delete) by role.
 */
export const resolveFileMembership = (
  param: string = 'fileId',
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required'));
      }
      const fileId = getParam(req, param);
      if (!fileId || !Types.ObjectId.isValid(fileId)) {
        return next(new BadRequestError('Invalid file id'));
      }

      const file = await ProjectFileModel.findById(fileId).select('_id project').lean();
      if (!file) {
        return next(new NotFoundError('File not found'));
      }

      const project = await ProjectModel.findById(file.project).select('_id team').lean();
      if (!project) {
        return next(new NotFoundError('Project not found'));
      }

      const membership = await TeamMemberModel.findOne({
        team: project.team,
        user: new Types.ObjectId(req.user.id),
        status: 'ACTIVE',
      }).lean();

      if (!membership) {
        return next(new ForbiddenError('You do not have access to this file'));
      }

      req.user.teamId = project.team.toString();
      req.user.teamRole = membership.role as TeamRole;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const resolveTaskMembership = (
  param: string = 'taskId',
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required'));
      }
      const taskId = getParam(req, param);
      if (!taskId || !Types.ObjectId.isValid(taskId)) {
        return next(new BadRequestError('Invalid task id'));
      }

      const task = await TaskModel.findById(taskId).select('_id project').lean();
      if (!task) {
        return next(new NotFoundError('Task not found'));
      }

      const project = await ProjectModel.findById(task.project).select('_id team').lean();
      if (!project) {
        return next(new NotFoundError('Project not found'));
      }

      const membership = await TeamMemberModel.findOne({
        team: project.team,
        user: new Types.ObjectId(req.user.id),
        status: 'ACTIVE',
      }).lean();

      if (!membership) {
        return next(new ForbiddenError('You do not have access to this task'));
      }

      req.user.teamId = project.team.toString();
      req.user.teamRole = membership.role as TeamRole;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};
