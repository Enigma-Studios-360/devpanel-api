import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-6):
// POST /api/projects/:projectId/github/link
// GET  /api/projects/:projectId/github/commits
// GET  /api/projects/:projectId/github/issues
// GET  /api/projects/:projectId/github/branches
// POST /api/projects/:projectId/github/issues

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'github', status: 'scaffold' }));
});

export const githubRouter = router;
