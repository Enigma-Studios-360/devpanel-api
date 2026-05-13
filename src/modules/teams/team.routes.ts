import { Router } from 'express';
import { teamController } from './team.controller';
import { validate } from '../../middlewares/validate.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { resolveTeamMembership } from '../../middlewares/team-context.middleware';
import { createTeamSchema } from './team.validation';
import { projectController } from '../projects/project.controller';
import { createProjectSchema } from '../projects/project.validation';
import { subscriptionController } from '../subscriptions/subscription.controller';
import { simulateUpgradeSchema } from '../subscriptions/subscription.validation';
import { requireTeamRole } from '../../middlewares/team-context.middleware';
import { activityController } from '../activity/activity.controller';

const router = Router();

router.use(requireAuth);

router.get('/', teamController.list);
router.post('/', validate(createTeamSchema), teamController.create);

router.get('/:teamId', resolveTeamMembership(), teamController.get);
router.get('/:teamId/members', resolveTeamMembership(), teamController.members);

// Nested under team for proper RBAC scoping
router.get(
  '/:teamId/projects',
  resolveTeamMembership(),
  projectController.listByTeam,
);
router.post(
  '/:teamId/projects',
  resolveTeamMembership(),
  validate(createProjectSchema),
  projectController.create,
);

router.get(
  '/:teamId/subscription',
  resolveTeamMembership(),
  subscriptionController.getForTeam,
);
router.post(
  '/:teamId/subscription/simulate-upgrade',
  resolveTeamMembership(),
  requireTeamRole('OWNER', 'ADMIN'),
  validate(simulateUpgradeSchema),
  subscriptionController.simulateUpgrade,
);

router.get(
  '/:teamId/activity',
  resolveTeamMembership(),
  activityController.byTeam,
);

export const teamRouter = router;
