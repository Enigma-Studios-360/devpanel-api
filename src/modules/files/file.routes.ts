import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-3/4):
// GET    /api/projects/:projectId/files
// POST   /api/projects/:projectId/files   (multipart, multer)
// DELETE /api/files/:fileId

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'files', status: 'scaffold' }));
});

export const fileRouter = router;
