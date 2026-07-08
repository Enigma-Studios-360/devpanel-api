import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { arcadeController } from './arcade.controller';
import { reportProgressSchema } from './arcade.validation';

const router = Router();
router.use(requireAuth);

// The game client (DevCrafting, Unity) logs in with regular credentials and
// reports a snapshot at the end of each in-game day. Progress is per-user,
// so no team-role gate applies: you can only read/write your own save.

router.get('/progress', arcadeController.get);
router.post('/progress', validate(reportProgressSchema), arcadeController.report);
router.get('/leaderboard', arcadeController.leaderboard);

export const arcadeRouter = router;
