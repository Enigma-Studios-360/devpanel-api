import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Classroom module (DevHub Classroom): a Classroom is one course/group
 * (e.g. "AWP 10°B"). Roles are PER CLASSROOM, not global — whoever creates
 * the aula is PROFESOR; students join with an invite code as ALUMNO.
 *
 * LEGAL CONSTRAINT (D-009): the ONLY telemetry stored is the server-side
 * `submittedAt` receipt. No time-on-task, no activity counters, no paste
 * events, nothing else. Do not add fields of that kind to these schemas.
 */

export const CLASSROOM_ROLES = ['PROFESOR', 'ALUMNO'] as const;
export type ClassroomRole = (typeof CLASSROOM_ROLES)[number];

export const SUBMISSION_STATUSES = ['ENTREGADO', 'TARDE'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const jsonTransform = {
  versionKey: false,
  transform: (_doc: unknown, ret: unknown) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
};

// ---------------------------------------------------------------------------
// Classroom
// ---------------------------------------------------------------------------

const classroomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    /** 8-char alphanumeric join code, generated server-side. */
    inviteCode: { type: String, required: true, unique: true, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

classroomSchema.set('toJSON', jsonTransform);

export type Classroom = InferSchemaType<typeof classroomSchema>;
export type ClassroomDocument = HydratedDocument<Classroom>;

export const ClassroomModel = model('Classroom', classroomSchema);

// ---------------------------------------------------------------------------
// ClassroomMember
// ---------------------------------------------------------------------------

const classroomMemberSchema = new Schema(
  {
    classroomId: { type: Types.ObjectId, ref: 'Classroom', required: true, index: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: CLASSROOM_ROLES, required: true },
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

classroomMemberSchema.index({ classroomId: 1, userId: 1 }, { unique: true });

classroomMemberSchema.set('toJSON', jsonTransform);

export type ClassroomMember = InferSchemaType<typeof classroomMemberSchema>;
export type ClassroomMemberDocument = HydratedDocument<ClassroomMember>;

export const ClassroomMemberModel = model('ClassroomMember', classroomMemberSchema);

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

const assignmentSchema = new Schema(
  {
    classroomId: { type: Types.ObjectId, ref: 'Classroom', required: true, index: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, default: '' },
    /** Optional starter repo in `owner/repo` format (validated at the edge). */
    templateRepoFullName: { type: String, trim: true },
    dueAt: { type: Date },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

assignmentSchema.set('toJSON', jsonTransform);

export type Assignment = InferSchemaType<typeof assignmentSchema>;
export type AssignmentDocument = HydratedDocument<Assignment>;

export const AssignmentModel = model('ClassroomAssignment', assignmentSchema);

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

const submissionSchema = new Schema(
  {
    assignmentId: { type: Types.ObjectId, ref: 'ClassroomAssignment', required: true, index: true },
    classroomId: { type: Types.ObjectId, ref: 'Classroom', required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    repoFullName: { type: String, required: true, trim: true },
    /**
     * Server-side receipt: ALWAYS assigned with `new Date()` on the server.
     * Client timestamps are never accepted (D-009).
     */
    submittedAt: { type: Date, required: true },
    /** Computed server-side against the assignment's dueAt at submit time. */
    status: { type: String, enum: SUBMISSION_STATUSES, required: true },
  },
  { timestamps: true },
);

// Re-submitting updates the same document (submittedAt/status recomputed).
submissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });

submissionSchema.set('toJSON', jsonTransform);

export type Submission = InferSchemaType<typeof submissionSchema>;
export type SubmissionDocument = HydratedDocument<Submission>;

export const SubmissionModel = model('ClassroomSubmission', submissionSchema);
