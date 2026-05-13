import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { TeamMemberModel } from '../modules/teams/team-member.model';
import {
  BadRequestError,
  ForbiddenError,
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
 * Must run after `resolveTeamMembership`.
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
