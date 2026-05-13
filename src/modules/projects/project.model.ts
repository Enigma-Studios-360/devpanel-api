import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PROJECT_STATUS_VALUES } from '../../shared/constants/project-status';

const projectSchema = new Schema(
  {
    team: { type: Types.ObjectId, ref: 'Team', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, index: true },
    description: { type: String },
    stack: { type: [String], default: [] },
    status: {
      type: String,
      enum: PROJECT_STATUS_VALUES,
      default: 'PLANNING',
      index: true,
    },
    dueDate: { type: Date },
    repositoryUrl: { type: String },
    githubOwner: { type: String },
    githubRepo: { type: String },
    defaultBranch: { type: String, default: 'main' },
    color: { type: String, default: '#3B82F6' },
    logoUrl: { type: String },
    members: [{ type: Types.ObjectId, ref: 'User' }],
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

projectSchema.index({ team: 1, slug: 1 }, { unique: true });

projectSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Project = InferSchemaType<typeof projectSchema>;
export type ProjectDocument = HydratedDocument<Project>;

export const ProjectModel = model('Project', projectSchema);
