import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'INVITATION',
  'TASK_ASSIGNED',
  'COMMENT',
  'SYSTEM',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const notificationActionSchema = new Schema(
  {
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const notificationSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    team: { type: Types.ObjectId, ref: 'Team' },
    project: { type: Types.ObjectId, ref: 'Project' },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    readAt: { type: Date },
    action: { type: notificationActionSchema },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Notification = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<Notification>;

export const NotificationModel = model('Notification', notificationSchema);
