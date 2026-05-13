import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

const taskCommentSchema = new Schema(
  {
    task: { type: Types.ObjectId, ref: 'Task', required: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    attachments: [{ type: Types.ObjectId, ref: 'ProjectFile' }],
  },
  { timestamps: true },
);

taskCommentSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type TaskComment = InferSchemaType<typeof taskCommentSchema>;
export type TaskCommentDocument = HydratedDocument<TaskComment>;

export const TaskCommentModel = model('TaskComment', taskCommentSchema);
