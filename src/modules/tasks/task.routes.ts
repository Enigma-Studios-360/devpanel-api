import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { taskController } from './task.controller';
import {
  updateTaskSchema,
  updateTaskStatusSchema,
  createTaskCommentSchema,
} from './task.validation';

const router = Router();
router.use(requireAuth);

// /api/tasks/:taskId routes — project-scoped routes live in project.routes.ts
router.get('/:taskId', taskController.get);
router.patch('/:taskId', validate(updateTaskSchema), taskController.patch);
router.patch(
  '/:taskId/status',
  validate(updateTaskStatusSchema),
  taskController.changeStatus,
);
router.get('/:taskId/comments', taskController.listComments);
router.post(
  '/:taskId/comments',
  validate(createTaskCommentSchema),
  taskController.createComment,
);

export const taskRouter = router;
