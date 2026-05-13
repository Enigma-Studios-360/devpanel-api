import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ok } from '../../shared/types/api-response';

const router = Router();
router.use(requireAuth);

// TODO(phase-2+): GET /api/users/me, PATCH /api/users/me, etc.

router.get('/_placeholder', (_req, res) => {
  res.json(ok({ module: 'users', status: 'scaffold' }));
});

export const userRouter = router;
