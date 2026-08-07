import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  ClassroomModel,
  ClassroomMemberModel,
  AssignmentModel,
  SubmissionModel,
  type ClassroomDocument,
  type ClassroomMemberDocument,
  type AssignmentDocument,
  type ClassroomRole,
  type SubmissionStatus,
} from './classroom.model';
import { UserModel } from '../users/user.model';
import { activityService } from '../activity/activity.service';
import { AppError } from '../../shared/errors/AppError';
import { ConflictError, NotFoundError } from '../../shared/errors/http-errors';
import type {
  CreateClassroomInput,
  UpdateClassroomInput,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from './classroom.validation';

/**
 * Invite codes: 8 chars, uppercase alphanumeric without look-alikes
 * (no 0/O, 1/I/L) so they survive being dictated out loud in a classroom.
 * Generated with crypto.randomInt — never client-provided.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const MAX_CODE_ATTEMPTS = 10;

const generateInviteCode = (): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)],
  ).join('');

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: number }).code === 11000;

/** Shape of a populated member's user subdocument. */
interface PopulatedUser {
  _id: Types.ObjectId;
  name?: string;
  email?: string;
  avatarUrl?: string;
}

const invalidCodeError = (): AppError =>
  new AppError('Invalid or expired invite code', 404, 'CLASSROOM_INVALID_CODE');

export const classroomService = {
  // -------------------------------------------------------------------------
  // Classrooms
  // -------------------------------------------------------------------------

  /** Creates the aula and its PROFESOR membership for the creator. */
  async create(
    actorId: string,
    input: CreateClassroomInput,
  ): Promise<{ classroom: ClassroomDocument; membership: ClassroomMemberDocument }> {
    let classroom: ClassroomDocument | null = null;

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        classroom = await ClassroomModel.create({
          name: input.name,
          ...(input.description !== undefined ? { description: input.description } : {}),
          inviteCode: generateInviteCode(),
          createdBy: new Types.ObjectId(actorId),
        });
        break;
      } catch (error) {
        // Unique-index collision on inviteCode: regenerate and retry.
        if (isDuplicateKeyError(error)) continue;
        throw error;
      }
    }
    if (!classroom) {
      throw new ConflictError('Could not generate a unique invite code');
    }

    const membership = await ClassroomMemberModel.create({
      classroomId: classroom._id,
      userId: new Types.ObjectId(actorId),
      role: 'PROFESOR',
      joinedAt: new Date(),
    });

    await activityService.logClassroomCreated(classroom._id, actorId, classroom.name);

    return { classroom, membership };
  },

  /** All classrooms where the user has a membership, with role + member count. */
  async listForUser(userId: string): Promise<unknown[]> {
    const memberships = await ClassroomMemberModel.find({
      userId: new Types.ObjectId(userId),
    })
      .populate({ path: 'classroomId', model: ClassroomModel })
      .sort({ joinedAt: -1 })
      .lean();

    const withClassroom = memberships.filter((m) => m.classroomId);
    const classroomIds = withClassroom.map(
      (m) => (m.classroomId as unknown as { _id: Types.ObjectId })._id,
    );

    const counts = classroomIds.length
      ? await ClassroomMemberModel.aggregate<{ _id: Types.ObjectId; total: number }>([
          { $match: { classroomId: { $in: classroomIds } } },
          { $group: { _id: '$classroomId', total: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.total]));

    return withClassroom.map((m) => {
      const classroom = m.classroomId as unknown as { _id: Types.ObjectId };
      return {
        classroom,
        role: m.role,
        joinedAt: m.joinedAt,
        membersCount: countMap.get(classroom._id.toString()) ?? 0,
      };
    });
  },

  /**
   * Join by invite code as ALUMNO. 404 CLASSROOM_INVALID_CODE when the code
   * does not match an active (non-archived) aula. Idempotent: an existing
   * member gets their current membership back, unchanged.
   */
  async join(
    userId: string,
    inviteCode: string,
  ): Promise<{
    classroom: ClassroomDocument;
    membership: ClassroomMemberDocument;
    alreadyMember: boolean;
  }> {
    const classroom = await ClassroomModel.findOne({ inviteCode, archived: false });
    if (!classroom) {
      throw invalidCodeError();
    }

    const userObjectId = new Types.ObjectId(userId);
    const existing = await ClassroomMemberModel.findOne({
      classroomId: classroom._id,
      userId: userObjectId,
    });
    if (existing) {
      return { classroom, membership: existing, alreadyMember: true };
    }

    try {
      const membership = await ClassroomMemberModel.create({
        classroomId: classroom._id,
        userId: userObjectId,
        role: 'ALUMNO',
        joinedAt: new Date(),
      });
      await activityService.logClassroomJoined(classroom._id, userId, classroom.name);
      return { classroom, membership, alreadyMember: false };
    } catch (error) {
      // Race on the unique {classroomId, userId} index: fetch the winner.
      if (isDuplicateKeyError(error)) {
        const membership = await ClassroomMemberModel.findOne({
          classroomId: classroom._id,
          userId: userObjectId,
        });
        if (membership) {
          return { classroom, membership, alreadyMember: true };
        }
      }
      throw error;
    }
  },

  /** PATCH name/description/archived (PROFESOR only, enforced at the route). */
  async update(
    classroom: ClassroomDocument,
    input: UpdateClassroomInput,
  ): Promise<ClassroomDocument> {
    if (input.name !== undefined) classroom.name = input.name;
    if (input.description !== undefined) classroom.description = input.description;
    if (input.archived !== undefined) classroom.archived = input.archived;
    await classroom.save();
    return classroom;
  },

  /** Regenerates the invite code (invalidates the previous one). */
  async rotateInviteCode(classroom: ClassroomDocument): Promise<ClassroomDocument> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      classroom.inviteCode = generateInviteCode();
      try {
        await classroom.save();
        return classroom;
      } catch (error) {
        if (isDuplicateKeyError(error)) continue;
        throw error;
      }
    }
    throw new ConflictError('Could not generate a unique invite code');
  },

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  /**
   * Roster. Any member sees name/avatar/role/joinedAt; the email column is
   * PROFESOR-only (privacy: students never see classmates' emails).
   */
  async listMembers(
    classroomId: Types.ObjectId,
    viewerRole: ClassroomRole,
  ): Promise<unknown[]> {
    const includeEmail = viewerRole === 'PROFESOR';
    const select = includeEmail ? 'name email avatarUrl' : 'name avatarUrl';

    const members = await ClassroomMemberModel.find({ classroomId })
      .populate({ path: 'userId', model: UserModel, select })
      .sort({ role: 1, joinedAt: 1 }) // ALUMNO < PROFESOR alphabetically; stable enough
      .lean();

    return members
      .filter((m) => m.userId)
      .map((m) => {
        const user = m.userId as unknown as PopulatedUser;
        return {
          userId: user._id.toString(),
          name: user.name ?? '',
          avatarUrl: user.avatarUrl,
          ...(includeEmail ? { email: user.email } : {}),
          role: m.role,
          joinedAt: m.joinedAt,
        };
      });
  },

  /**
   * Removes a member (PROFESOR only, enforced at the route). The last
   * remaining PROFESOR can never be removed — not even by themselves — so an
   * aula is never left without a teacher.
   */
  async removeMember(
    classroom: ClassroomDocument,
    targetUserId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new NotFoundError('Member not found in this classroom');
    }

    const target = await ClassroomMemberModel.findOne({
      classroomId: classroom._id,
      userId: new Types.ObjectId(targetUserId),
    });
    if (!target) {
      throw new NotFoundError('Member not found in this classroom');
    }

    if (target.role === 'PROFESOR') {
      const professors = await ClassroomMemberModel.countDocuments({
        classroomId: classroom._id,
        role: 'PROFESOR',
      });
      if (professors <= 1) {
        throw new ConflictError(
          'Cannot remove the only PROFESOR of the classroom',
        );
      }
    }

    await target.deleteOne();
  },

  // -------------------------------------------------------------------------
  // Assignments
  // -------------------------------------------------------------------------

  async createAssignment(
    classroom: ClassroomDocument,
    actorId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentDocument> {
    const assignment = await AssignmentModel.create({
      classroomId: classroom._id,
      title: input.title,
      instructions: input.instructions ?? '',
      ...(input.templateRepoFullName !== undefined
        ? { templateRepoFullName: input.templateRepoFullName }
        : {}),
      ...(input.dueAt !== undefined ? { dueAt: new Date(input.dueAt) } : {}),
      createdBy: new Types.ObjectId(actorId),
    });

    await activityService.logAssignmentCreated(classroom._id, actorId, assignment.title);

    return assignment;
  },

  /**
   * Assignments of the aula. Enrichment depends on the viewer's role:
   *   ALUMNO   -> each item carries `mySubmission` (or null)
   *   PROFESOR -> each item carries `submissionsCount`
   */
  async listAssignments(
    classroomId: Types.ObjectId,
    viewerUserId: string,
    viewerRole: ClassroomRole,
  ): Promise<unknown[]> {
    const assignments = await AssignmentModel.find({ classroomId }).sort({
      createdAt: -1,
    });

    if (assignments.length === 0) return [];
    const assignmentIds = assignments.map((a) => a._id);

    if (viewerRole === 'ALUMNO') {
      const submissions = await SubmissionModel.find({
        assignmentId: { $in: assignmentIds },
        userId: new Types.ObjectId(viewerUserId),
      });
      const byAssignment = new Map(
        submissions.map((s) => [s.assignmentId.toString(), s]),
      );
      return assignments.map((a) => ({
        assignment: a.toJSON(),
        mySubmission: byAssignment.get(a._id.toString())?.toJSON() ?? null,
      }));
    }

    const counts = await SubmissionModel.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { assignmentId: { $in: assignmentIds } } },
      { $group: { _id: '$assignmentId', total: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.total]));

    return assignments.map((a) => ({
      assignment: a.toJSON(),
      submissionsCount: countMap.get(a._id.toString()) ?? 0,
    }));
  },

  /** Loads an assignment scoped to the aula (404 if not in this classroom). */
  async getAssignmentOrFail(
    classroomId: Types.ObjectId,
    assignmentId: string,
  ): Promise<AssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundError('Assignment not found');
    }
    const assignment = await AssignmentModel.findOne({
      _id: new Types.ObjectId(assignmentId),
      classroomId,
    });
    if (!assignment) {
      throw new NotFoundError('Assignment not found');
    }
    return assignment;
  },

  /** Detail with the same role-dependent enrichment as the list. */
  async getAssignmentDetail(
    assignment: AssignmentDocument,
    viewerUserId: string,
    viewerRole: ClassroomRole,
  ): Promise<Record<string, unknown>> {
    if (viewerRole === 'ALUMNO') {
      const mySubmission = await SubmissionModel.findOne({
        assignmentId: assignment._id,
        userId: new Types.ObjectId(viewerUserId),
      });
      return {
        assignment: assignment.toJSON(),
        mySubmission: mySubmission ? mySubmission.toJSON() : null,
      };
    }

    const submissionsCount = await SubmissionModel.countDocuments({
      assignmentId: assignment._id,
    });
    return { assignment: assignment.toJSON(), submissionsCount };
  },

  async updateAssignment(
    assignment: AssignmentDocument,
    input: UpdateAssignmentInput,
  ): Promise<AssignmentDocument> {
    if (input.title !== undefined) assignment.title = input.title;
    if (input.instructions !== undefined) assignment.instructions = input.instructions;
    if (input.templateRepoFullName !== undefined) {
      assignment.templateRepoFullName = input.templateRepoFullName;
    }
    if (input.dueAt !== undefined) assignment.dueAt = new Date(input.dueAt);
    await assignment.save();
    return assignment;
  },

  // -------------------------------------------------------------------------
  // Submissions
  // -------------------------------------------------------------------------

  /**
   * Upsert on {assignmentId, userId}: re-submitting updates the same document
   * and recomputes submittedAt/status. `submittedAt` is ALWAYS the server
   * clock — this is the whole point of the module (server-side receipt, D-009)
   * — and `status` is computed here against dueAt, never trusted from the
   * client.
   */
  async submit(
    assignment: AssignmentDocument,
    userId: string,
    repoFullName: string,
  ): Promise<unknown> {
    const now = new Date();
    const status: SubmissionStatus =
      assignment.dueAt && now.getTime() > assignment.dueAt.getTime()
        ? 'TARDE'
        : 'ENTREGADO';

    const submission = await SubmissionModel.findOneAndUpdate(
      { assignmentId: assignment._id, userId: new Types.ObjectId(userId) },
      {
        $set: {
          classroomId: assignment.classroomId,
          repoFullName,
          submittedAt: now,
          status,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await activityService.logSubmissionReceived(
      assignment.classroomId,
      userId,
      assignment.title,
    );

    return submission.toJSON();
  },

  /** All submissions of an assignment with student data (PROFESOR only). */
  async listSubmissions(assignmentId: Types.ObjectId): Promise<unknown[]> {
    const submissions = await SubmissionModel.find({ assignmentId })
      .populate({ path: 'userId', model: UserModel, select: 'name email avatarUrl' })
      .sort({ submittedAt: 1 })
      .lean();

    return submissions.map((s) => {
      const user = s.userId as unknown as PopulatedUser;
      return {
        _id: s._id.toString(),
        assignmentId: s.assignmentId.toString(),
        student: {
          userId: user._id.toString(),
          name: user.name ?? '',
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
        repoFullName: s.repoFullName,
        submittedAt: s.submittedAt,
        status: s.status,
      };
    });
  },
};
