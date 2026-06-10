import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { deployController } from './deploy.controller';

/**
 * Top-level deploy router. Endpoints scoped to a project live in
 * project.routes.ts so the membership/role middleware can apply
 * consistently with the rest of the project-scoped surface.
 *
 * Here we only expose unscoped probes (status). Keep it small.
 */
const router = Router();
router.use(requireAuth);

router.get('/status', deployController.status);

export const deployRouter = router;
