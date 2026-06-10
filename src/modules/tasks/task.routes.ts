import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  resolveTaskMembership,
  requireTeamRole,
} from '../../middlewares/team-context.middleware';
import { taskController } from './task.controller';
import {
  updateTaskSchema,
  updateTaskStatusSchema,
  createTaskCommentSchema,
} from './task.validation';

const router = Router();
router.use(requireAuth);

// Role contract:
//   OWNER, ADMIN, DEVELOPER -> edit task, move status, add comments.
//   VIEWER                  -> read-only (GET task + GET comments).

// --- Read --------------------------------------------------------------------

router.get('/:taskId', resolveTaskMembership(), taskController.get);
router.get('/:taskId/comments', resolveTaskMembership(), taskController.listComments);

// --- Write -------------------------------------------------------------------

router.patch(
  '/:taskId',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(updateTaskSchema),
  taskController.patch,
);
router.patch(
  '/:taskId/status',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(updateTaskStatusSchema),
  taskController.changeStatus,
);
router.post(
  '/:taskId/comments',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(createTaskCommentSchema),
  taskController.createComment,
);

// Archive / restore: any contributor (OWNER, ADMIN, DEV) can soft-archive.
router.post(
  '/:taskId/archive',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  taskController.archive,
);
router.post(
  '/:taskId/restore',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  taskController.restore,
);

// Hard delete: OWNER / ADMIN only — destructive, loses comments.
router.delete(
  '/:taskId',
  resolveTaskMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  taskController.remove,
);

export const taskRouter = router;
