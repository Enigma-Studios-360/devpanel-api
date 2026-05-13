import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { projectController } from './project.controller';
import { updateProjectSchema } from './project.validation';
import { taskController } from '../tasks/task.controller';
import { createTaskSchema } from '../tasks/task.validation';
import { docsController } from '../docs/docs.controller';
import { updateDocSchema } from '../docs/docs.validation';
import { githubController } from '../github/github.controller';
import {
  linkRepoSchema,
  createIssueSchema,
} from '../github/github.validation';

const router = Router();
router.use(requireAuth);

router.get('/:projectId', projectController.get);
router.patch('/:projectId', validate(updateProjectSchema), projectController.patch);
router.post('/:projectId/archive', projectController.archive);
router.get('/:projectId/dashboard', projectController.dashboard);
router.get('/:projectId/activity', projectController.activity);

// Tasks scoped by project
router.get('/:projectId/tasks', taskController.listByProject);
router.post(
  '/:projectId/tasks',
  validate(createTaskSchema),
  taskController.create,
);

// Docs scoped by project
router.get('/:projectId/docs', docsController.get);
router.patch('/:projectId/docs', validate(updateDocSchema), docsController.patch);
router.post('/:projectId/docs/generate-readme', docsController.generateReadme);
router.get('/:projectId/docs/download-readme', docsController.downloadReadme);

// GitHub scoped by project
router.post('/:projectId/github/link', validate(linkRepoSchema), githubController.link);
router.post('/:projectId/github/unlink', githubController.unlink);
router.get('/:projectId/github/repo', githubController.info);
router.get('/:projectId/github/commits', githubController.commits);
router.get('/:projectId/github/branches', githubController.branches);
router.get('/:projectId/github/issues', githubController.issues);
router.post(
  '/:projectId/github/issues',
  validate(createIssueSchema),
  githubController.createIssue,
);

export const projectRouter = router;
