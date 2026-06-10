import type { RequestHandler } from 'express';
import { notificationService } from './notification.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const notificationController = {
  list: (async (req, res, next) => {
    try {
      const result = await notificationService.listForUser(
        req.user!.id,
        req.query as Record<string, unknown>,
      );
      res.json(ok(result.data, { ...result.meta }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  unreadCount: (async (req, res, next) => {
    try {
      const count = await notificationService.unreadCount(req.user!.id);
      res.json(ok({ count }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  markRead: (async (req, res, next) => {
    try {
      const notification = await notificationService.markRead(
        getParam(req, 'id'),
        req.user!.id,
      );
      res.json(ok({ notification }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  markAllRead: (async (req, res, next) => {
    try {
      const result = await notificationService.markAllRead(req.user!.id);
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  remove: (async (req, res, next) => {
    try {
      const result = await notificationService.remove(
        getParam(req, 'id'),
        req.user!.id,
      );
      res.json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
