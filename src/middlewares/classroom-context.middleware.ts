import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import {
  ClassroomModel,
  ClassroomMemberModel,
  type ClassroomDocument,
  type ClassroomMemberDocument,
  type ClassroomRole,
} from '../modules/classroom/classroom.model';
import { AppError } from '../shared/errors/AppError';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../shared/errors/http-errors';
import { getParam } from '../shared/utils/request';

/**
 * Classroom context (mirrors team-context.middleware): classroom roles are
 * PER AULA and independent from the teams RBAC. `resolveClassroomMembership`
 * attaches `{ classroom, classroomMembership }` to the request so downstream
 * handlers never re-check access themselves.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      classroom?: ClassroomDocument;
      classroomMembership?: ClassroomMemberDocument;
    }
  }
}

/**
 * Loads the classroom referenced by the `:classroomId` route param (404 if it
 * does not exist) and the authenticated user's membership on it (403
 * CLASSROOM_NOT_MEMBER if none). Must be mounted AFTER `requireAuth`.
 */
export const resolveClassroomMembership = (
  param: string = 'classroomId',
): RequestHandler => {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        return next(new ForbiddenError('Authentication required'));
      }
      const classroomId = getParam(req, param);
      if (!classroomId || !Types.ObjectId.isValid(classroomId)) {
        return next(new BadRequestError('Invalid classroom id'));
      }

      const classroom = await ClassroomModel.findById(classroomId);
      if (!classroom) {
        return next(new NotFoundError('Classroom not found'));
      }

      const membership = await ClassroomMemberModel.findOne({
        classroomId: classroom._id,
        userId: new Types.ObjectId(req.user.id),
      });

      if (!membership) {
        return next(
          new AppError(
            'You are not a member of this classroom',
            403,
            'CLASSROOM_NOT_MEMBER',
          ),
        );
      }

      req.classroom = classroom;
      req.classroomMembership = membership;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/**
 * Requires that the resolved classroom role is one of `allowed`.
 * Must run after `resolveClassroomMembership`.
 */
export const requireClassroomRole = (
  ...allowed: ClassroomRole[]
): RequestHandler => {
  return (req, _res, next) => {
    const role = req.classroomMembership?.role;
    if (!role || !allowed.includes(role)) {
      return next(
        new AppError(
          'Insufficient classroom role',
          403,
          'CLASSROOM_INSUFFICIENT_ROLE',
        ),
      );
    }
    return next();
  };
};
