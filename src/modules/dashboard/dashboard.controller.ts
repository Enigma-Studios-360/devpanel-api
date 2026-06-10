import type { RequestHandler } from 'express';
import { dashboardService } from './dashboard.service';
import { ok } from '../../shared/types/api-response';

export const dashboardController = {
  overview: (async (req, res, next) => {
    try {
      const data = await dashboardService.overview(req.user!.id);
      res.json(ok(data));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /**
   * Build a tiny playground for the calling user (team + project + tasks).
   * Refuses with 409 if they already have a workspace — the frontend uses
   * that to know it doesn't have to show the "Create demo data" CTA.
   */
  seedDemo: (async (req, res, next) => {
    try {
      const result = await dashboardService.seedDemoData(
        req.user!.id,
        req.user!.name ?? 'Mi',
      );
      res.status(201).json(ok(result));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
