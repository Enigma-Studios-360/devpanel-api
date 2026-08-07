import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import {
  resolveClassroomMembership,
  requireClassroomRole,
} from '../../middlewares/classroom-context.middleware';
import { classroomController } from './classroom.controller';
import {
  createClassroomSchema,
  updateClassroomSchema,
  joinClassroomSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  submitAssignmentSchema,
} from './classroom.validation';

const router = Router();
router.use(requireAuth);

// Role contract (per-aula roles, independent from the teams RBAC):
//   any authenticated user -> create an aula (becomes its PROFESOR) / join by code (ALUMNO)
//   any member             -> detail, roster (emails PROFESOR-only), assignments list/detail
//   PROFESOR               -> edit aula, rotate code, remove members, create/edit
//                             assignments, view all submissions
//   ALUMNO                 -> submit (server-side submittedAt receipt)

router.post('/', validate(createClassroomSchema), classroomController.create);
router.get('/', classroomController.listMine);
router.post('/join', validate(joinClassroomSchema), classroomController.join);

router.get('/:classroomId', resolveClassroomMembership(), classroomController.get);
router.patch(
  '/:classroomId',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  validate(updateClassroomSchema),
  classroomController.update,
);
router.post(
  '/:classroomId/invite-code/rotate',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  classroomController.rotateInviteCode,
);

router.get(
  '/:classroomId/members',
  resolveClassroomMembership(),
  classroomController.members,
);
router.delete(
  '/:classroomId/members/:userId',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  classroomController.removeMember,
);

router.post(
  '/:classroomId/assignments',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  validate(createAssignmentSchema),
  classroomController.createAssignment,
);
router.get(
  '/:classroomId/assignments',
  resolveClassroomMembership(),
  classroomController.listAssignments,
);
router.get(
  '/:classroomId/assignments/:assignmentId',
  resolveClassroomMembership(),
  classroomController.getAssignment,
);
router.patch(
  '/:classroomId/assignments/:assignmentId',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  validate(updateAssignmentSchema),
  classroomController.updateAssignment,
);
router.post(
  '/:classroomId/assignments/:assignmentId/submit',
  resolveClassroomMembership(),
  requireClassroomRole('ALUMNO'),
  validate(submitAssignmentSchema),
  classroomController.submit,
);
router.get(
  '/:classroomId/assignments/:assignmentId/submissions',
  resolveClassroomMembership(),
  requireClassroomRole('PROFESOR'),
  classroomController.listSubmissions,
);

export const classroomRouter = router;
