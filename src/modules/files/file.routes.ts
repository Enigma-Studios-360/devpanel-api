import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import {
  resolveFileMembership,
  requireTeamRole,
} from '../../middlewares/team-context.middleware';
import { fileController } from './file.controller';

const router = Router();
router.use(requireAuth);

// Role contract:
//   any member (incl. VIEWER) -> download
//   OWNER, ADMIN              -> delete (destructive, frees storage)
// Upload + list live under /api/projects/:projectId/files (project.routes.ts).

router.get('/:fileId/download', resolveFileMembership(), fileController.download);

router.delete(
  '/:fileId',
  resolveFileMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  fileController.remove,
);

export const fileRouter = router;
