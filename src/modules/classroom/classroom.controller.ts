import type { RequestHandler } from 'express';
import { classroomService } from './classroom.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

/**
 * Thin controllers: every /:classroomId route runs AFTER
 * resolveClassroomMembership, so `req.classroom` and `req.classroomMembership`
 * are guaranteed here (same non-null contract as `req.user!` after
 * requireAuth).
 */
export const classroomController = {
  create: (async (req, res, next) => {
    try {
      const { classroom, membership } = await classroomService.create(
        req.user!.id,
        req.body,
      );
      res.status(201).json(ok({ classroom, membership }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listMine: (async (req, res, next) => {
    try {
      const classrooms = await classroomService.listForUser(req.user!.id);
      res.json(ok({ classrooms }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  join: (async (req, res, next) => {
    try {
      const { classroom, membership, alreadyMember } = await classroomService.join(
        req.user!.id,
        (req.body as { inviteCode: string }).inviteCode,
      );
      res.json(ok({ classroom, membership, alreadyMember }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    try {
      res.json(
        ok({
          classroom: req.classroom!.toJSON(),
          role: req.classroomMembership!.role,
        }),
      );
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  update: (async (req, res, next) => {
    try {
      const classroom = await classroomService.update(req.classroom!, req.body);
      res.json(ok({ classroom }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  rotateInviteCode: (async (req, res, next) => {
    try {
      const classroom = await classroomService.rotateInviteCode(req.classroom!);
      res.json(ok({ classroom }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  members: (async (req, res, next) => {
    try {
      const members = await classroomService.listMembers(
        req.classroom!._id,
        req.classroomMembership!.role,
      );
      res.json(ok({ members }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  removeMember: (async (req, res, next) => {
    try {
      await classroomService.removeMember(req.classroom!, getParam(req, 'userId'));
      res.json(ok({ removed: true }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  createAssignment: (async (req, res, next) => {
    try {
      const assignment = await classroomService.createAssignment(
        req.classroom!,
        req.user!.id,
        req.body,
      );
      res.status(201).json(ok({ assignment }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listAssignments: (async (req, res, next) => {
    try {
      const assignments = await classroomService.listAssignments(
        req.classroom!._id,
        req.user!.id,
        req.classroomMembership!.role,
      );
      res.json(ok({ assignments }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  getAssignment: (async (req, res, next) => {
    try {
      const assignment = await classroomService.getAssignmentOrFail(
        req.classroom!._id,
        getParam(req, 'assignmentId'),
      );
      const detail = await classroomService.getAssignmentDetail(
        assignment,
        req.user!.id,
        req.classroomMembership!.role,
      );
      res.json(ok(detail));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  updateAssignment: (async (req, res, next) => {
    try {
      const assignment = await classroomService.getAssignmentOrFail(
        req.classroom!._id,
        getParam(req, 'assignmentId'),
      );
      const updated = await classroomService.updateAssignment(assignment, req.body);
      res.json(ok({ assignment: updated }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  submit: (async (req, res, next) => {
    try {
      const assignment = await classroomService.getAssignmentOrFail(
        req.classroom!._id,
        getParam(req, 'assignmentId'),
      );
      const submission = await classroomService.submit(
        assignment,
        req.user!.id,
        (req.body as { repoFullName: string }).repoFullName,
      );
      res.status(201).json(ok({ submission }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listSubmissions: (async (req, res, next) => {
    try {
      const assignment = await classroomService.getAssignmentOrFail(
        req.classroom!._id,
        getParam(req, 'assignmentId'),
      );
      const submissions = await classroomService.listSubmissions(assignment._id);
      res.json(ok({ submissions }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
