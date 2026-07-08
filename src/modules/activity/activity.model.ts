import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ACTIVITY_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_ARCHIVED',
  'PROJECT_UPDATED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_STATUS_CHANGED',
  'TASK_COMMENT_CREATED',
  'TASK_ARCHIVED',
  'TASK_DELETED',
  'DOC_UPDATED',
  'FILE_UPLOADED',
  'FILE_DELETED',
  'GITHUB_SYNCED',
  'MEMBER_INVITED',
  'TEAM_CREATED',
  'USER_REGISTERED',
  'SUBSCRIPTION_CHANGED',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

const activityLogSchema = new Schema(
  {
    team: { type: Types.ObjectId, ref: 'Team', index: true },
    project: { type: Types.ObjectId, ref: 'Project', index: true },
    actor: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true, index: true },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type ActivityLog = InferSchemaType<typeof activityLogSchema>;
export type ActivityLogDocument = HydratedDocument<ActivityLog>;

export const ActivityLogModel = model('ActivityLog', activityLogSchema);
