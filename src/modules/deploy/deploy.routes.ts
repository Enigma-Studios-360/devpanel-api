import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-7):
// GET   /api/projects/:projectId/deploy
// PATCH /api/projects/:projectId/deploy
// POST  /api/projects/:projectId/deploy/detect-stack
// POST  /api/projects/:projectId/deploy/generate-guide
// PATCH /api/projects/:projectId/deploy/steps/:stepId

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'deploy', status: 'scaffold' }));
});

export const deployRouter = router;
