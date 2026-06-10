import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { TASK_STATUS_VALUES, TASK_PRIORITY_VALUES } from '../../shared/constants/task-status';

const taskSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    status: {
      type: String,
      enum: TASK_STATUS_VALUES,
      default: 'TODO',
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITY_VALUES,
      default: 'MEDIUM',
      index: true,
    },
    assignees: [{ type: Types.ObjectId, ref: 'User' }],
    dueDate: { type: Date },
    githubIssueNumber: { type: Number },
    attachments: [{ type: Types.ObjectId, ref: 'ProjectFile' }],
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    /**
     * Soft-archive timestamp. Archived tasks are excluded from the default
     * board listing but stay queryable via `?archived=true`. Different from
     * the `DONE` status — a DONE task is finished work, an archived task
     * is hidden from the board.
     */
    archivedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

taskSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Task = InferSchemaType<typeof taskSchema>;
export type TaskDocument = HydratedDocument<Task>;

export const TaskModel = model('Task', taskSchema);
