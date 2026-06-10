import type { RequestHandler } from 'express';
import { projectService } from './project.service';
import { ok } from '../../shared/types/api-response';
import { activityService } from '../activity/activity.service';
import { getParam } from '../../shared/utils/request';

export const projectController = {
  /** GET /api/projects — all projects across the user's teams (+ team name). */
  listAll: (async (req, res, next) => {
    try {
      const projects = await projectService.listAllForUser(req.user!.id);
      res.json(ok(projects));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listByTeam: (async (req, res, next) => {
    try {
      const projects = await projectService.listByTeam(getParam(req, 'teamId'));
      res.json(ok(projects));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  create: (async (req, res, next) => {
    try {
      const project = await projectService.create(
        getParam(req, 'teamId'),
        req.user!.id,
        req.body,
      );
      res.status(201).json(ok({ project }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    try {
      const project = await projectService.assertUserCanAccess(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok({ project, userRole: req.user!.teamRole ?? null }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  patch: (async (req, res, next) => {
    try {
      await projectService.assertUserCanAccess(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      const project = await projectService.update(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body,
      );
      res.json(ok({ project }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  archive: (async (req, res, next) => {
    try {
      await projectService.assertUserCanAccess(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      const project = await projectService.archive(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      res.json(ok({ project }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  dashboard: (async (req, res, next) => {
    try {
      await projectService.assertUserCanAccess(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      const data = await projectService.dashboard(getParam(req, 'projectId'));
      // resolveProjectMembership populates req.user.teamRole upstream.
      // Exposing it lets the frontend hide/disable role-gated actions
      // without an extra round-trip.
      res.json(
        ok({
          ...(data as Record<string, unknown>),
          userRole: req.user!.teamRole ?? null,
        }),
      );
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  activity: (async (req, res, next) => {
    try {
      await projectService.assertUserCanAccess(
        getParam(req, 'projectId'),
        req.user!.id,
      );
      const result = await activityService.listByProject(
        getParam(req, 'projectId'),
        req.query as Record<string, unknown>,
      );
      res.json(ok(result.data, { ...result.meta }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
