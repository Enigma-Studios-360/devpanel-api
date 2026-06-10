import type { RequestHandler } from 'express';
import { searchService } from './search.service';
import { ok } from '../../shared/types/api-response';

export const searchController = {
  /** GET /api/search?q=... — global search scoped to the caller's teams. */
  search: (async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const results = await searchService.search(req.user!.id, q);
      res.json(ok(results));
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
