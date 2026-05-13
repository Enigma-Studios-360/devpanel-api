import type { RequestHandler } from 'express';
import { taskService } from './task.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const taskController = {
  listByProject: (async (req, res, next) => {
    try {
      await taskService.assertProjectAccess(getParam(req, 'projectId'), req.user!.id);
      const tasks = await taskService.listByProject(getParam(req, 'projectId'));
      res.json(ok(tasks));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  create: (async (req, res, next) => {
    try {
      const task = await taskService.create(
        getParam(req, 'projectId'),
        req.user!.id,
        req.body,
      );
      res.status(201).json(ok({ task }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  get: (async (req, res, next) => {
    try {
      const task = await taskService.getById(getParam(req, 'taskId'), req.user!.id);
      res.json(ok({ task }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  patch: (async (req, res, next) => {
    try {
      const task = await taskService.update(
        getParam(req, 'taskId'),
        req.user!.id,
        req.body,
      );
      res.json(ok({ task }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  changeStatus: (async (req, res, next) => {
    try {
      const task = await taskService.changeStatus(
        getParam(req, 'taskId'),
        req.user!.id,
        req.body.status,
      );
      res.json(ok({ task }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listComments: (async (req, res, next) => {
    try {
      const comments = await taskService.listComments(
        getParam(req, 'taskId'),
        req.user!.id,
      );
      res.json(ok(comments));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  createComment: (async (req, res, next) => {
    try {
      const comment = await taskService.addComment(
        getParam(req, 'taskId'),
        req.user!.id,
        req.body.message,
      );
      res.status(201).json(ok({ comment }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
