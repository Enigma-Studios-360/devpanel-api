import type { RequestHandler } from 'express';
import { arcadeService } from './arcade.service';
import { ok } from '../../shared/types/api-response';

export const arcadeController = {
  get: (async (req, res, next) => {
    try {
      const progress = await arcadeService.getForUser(req.user!.id);
      res.json(ok({ progress }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  report: (async (req, res, next) => {
    try {
      const progress = await arcadeService.report(req.user!.id, req.body);
      res.status(201).json(ok({ progress }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  leaderboard: (async (_req, res, next) => {
    try {
      const entries = await arcadeService.leaderboard();
      res.json(ok({ entries }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
