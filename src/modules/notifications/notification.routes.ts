import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-2/3):
// GET    /api/notifications
// PATCH  /api/notifications/:id/read

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'notifications', status: 'scaffold' }));
});

export const notificationRouter = router;
