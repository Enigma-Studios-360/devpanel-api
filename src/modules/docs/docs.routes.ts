import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-4):
// GET   /api/projects/:projectId/docs
// PATCH /api/projects/:projectId/docs
// POST  /api/projects/:projectId/docs/generate-readme
// GET   /api/projects/:projectId/docs/download-readme

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'docs', status: 'scaffold' }));
});

export const docsRouter = router;
