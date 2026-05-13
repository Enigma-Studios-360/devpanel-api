import type { RequestHandler } from 'express';
import { activityService } from './activity.service';
import { ok } from '../../shared/types/api-response';
import { getParam } from '../../shared/utils/request';

export const activityController = {
  byTeam: (async (req, res, next) => {
    try {
      const result = await activityService.listByTeam(
        getParam(req, 'teamId'),
        req.query as Record<string, unknown>,
      );
      res.json(ok(result.data, { ...result.meta }));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
