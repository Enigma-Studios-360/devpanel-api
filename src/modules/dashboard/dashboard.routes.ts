import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { dashboardController } from './dashboard.controller';

const router = Router();
router.use(requireAuth);

router.get('/overview', dashboardController.overview);
// Builds a tiny playground (team + project + 5 tasks) for empty accounts
// so a brand-new user can take the onboarding tour with real data instead
// of "no hay nada por aquí" emptiness.
router.post('/seed-demo', dashboardController.seedDemo);

export const dashboardRouter = router;
