import { Router } from 'express';
import { PLAN_CATALOG } from '../../shared/constants/plans';
import { ok } from '../../shared/types/api-response';

const router = Router();

// GET /api/plans  - public catalog of plans
router.get('/plans', (_req, res) => {
  res.json(ok(PLAN_CATALOG));
});

// TODO(phase-2):
// GET  /api/teams/:teamId/subscription
// POST /api/teams/:teamId/subscription/simulate-upgrade

export const subscriptionRouter = router;
