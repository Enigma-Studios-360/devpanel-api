import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  resolveProjectMembership,
  requireTeamRole,
} from '../../middlewares/team-context.middleware';
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
import { deployController } from '../deploy/deploy.controller';
import { triggerDeploySchema } from '../deploy/deploy.validation';
import { fileController } from '../files/file.controller';
import { upload, uploadProjectZip } from '../../config/storage';
import { importController } from '../imports/import.controller';

const router = Router();
router.use(requireAuth);

// Role contract (see devpanel_readmes/04_ORGANIZACION_DEL_EQUIPO.md):
//   OWNER, ADMIN     -> project settings (edit, archive, link/unlink repo)
//   OWNER, ADMIN, DEVELOPER -> work artifacts (tasks, comments, docs, issues)
//   VIEWER           -> read-only (any GET)
// `resolveProjectMembership` populates req.user.teamRole; `requireTeamRole`
// rejects with 403 INSUFFICIENT_ROLE before the controller runs.

// --- All projects for the user (global "Proyectos" page) ----------------------

router.get('/', projectController.listAll);

// --- Project read / settings --------------------------------------------------

router.get('/:projectId', resolveProjectMembership(), projectController.get);
router.patch(
  '/:projectId',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  validate(updateProjectSchema),
  projectController.patch,
);
router.post(
  '/:projectId/archive',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  projectController.archive,
);
router.get('/:projectId/dashboard', resolveProjectMembership(), projectController.dashboard);
router.get('/:projectId/activity', resolveProjectMembership(), projectController.activity);

// --- Tasks scoped by project --------------------------------------------------

router.get('/:projectId/tasks', resolveProjectMembership(), taskController.listByProject);
router.post(
  '/:projectId/tasks',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(createTaskSchema),
  taskController.create,
);

// --- Docs scoped by project ---------------------------------------------------

router.get('/:projectId/docs', resolveProjectMembership(), docsController.get);
router.patch(
  '/:projectId/docs',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(updateDocSchema),
  docsController.patch,
);
router.post(
  '/:projectId/docs/generate-readme',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  docsController.generateReadme,
);
router.post(
  '/:projectId/docs/generate-ai',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  docsController.generateAi,
);
router.get(
  '/:projectId/docs/download-readme',
  resolveProjectMembership(),
  docsController.downloadReadme,
);

// --- Files scoped by project ----------------------------------------------------
// List is open to any member (incl. VIEWER); upload requires a contributor
// role. Per-file download/delete live in file.routes.ts (/api/files/:fileId).

router.get('/:projectId/files', resolveProjectMembership(), fileController.listByProject);
router.post(
  '/:projectId/files',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  upload.single('file'),
  fileController.upload,
);

// --- Importar proyecto (ZIP → repo GitHub del usuario) -------------------------
// Mismo gate que vincular repo: OWNER/ADMIN (es configuración del proyecto).

router.post(
  '/:projectId/import',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  uploadProjectZip.single('file'),
  importController.analyze,
);
router.post(
  '/:projectId/import/:importId/confirm',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  importController.confirm,
);

// --- GitHub scoped by project -------------------------------------------------

router.post(
  '/:projectId/github/link',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  validate(linkRepoSchema),
  githubController.link,
);
router.post(
  '/:projectId/github/unlink',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  githubController.unlink,
);
router.get('/:projectId/github/repo', resolveProjectMembership(), githubController.info);
router.get('/:projectId/github/commits', resolveProjectMembership(), githubController.commits);
router.get('/:projectId/github/branches', resolveProjectMembership(), githubController.branches);
router.get('/:projectId/github/issues', resolveProjectMembership(), githubController.issues);
// Stack detection: read-only, any team member can run it.
router.get(
  '/:projectId/github/detect-stack',
  resolveProjectMembership(),
  githubController.detectStack,
);
router.post(
  '/:projectId/github/issues',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN', 'DEVELOPER'),
  validate(createIssueSchema),
  githubController.createIssue,
);

// --- Deploy (Vercel wizard) ---------------------------------------------------
// Read-only endpoints are open to any project member (incl. VIEWER) so they
// can see deployment status and history. Triggers and refresh-on-demand are
// reserved to OWNER/ADMIN because they touch the Vercel account and burn API
// quota.

router.get(
  '/:projectId/deploy',
  resolveProjectMembership(),
  deployController.history,
);
router.get(
  '/:projectId/deploy/prepare',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  deployController.prepare,
);
router.post(
  '/:projectId/deploy/trigger',
  resolveProjectMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  validate(triggerDeploySchema),
  deployController.trigger,
);
router.post(
  '/:projectId/deploy/:deploymentId/refresh',
  resolveProjectMembership(),
  deployController.refresh,
);

export const projectRouter = router;
