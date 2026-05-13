import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const DEPLOY_PROVIDERS = ['VERCEL', 'OTHER'] as const;
export const DEPLOY_STACKS = ['ANGULAR', 'NODE', 'REACT', 'VITE', 'OTHER'] as const;

const deployStepSchema = new Schema(
  {
    key: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    completed: { type: Boolean, default: false },
  },
  { _id: false },
);

const deployChecklistSchema = new Schema(
  {
    project: {
      type: Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    provider: { type: String, enum: DEPLOY_PROVIDERS, default: 'VERCEL' },
    stack: { type: String, enum: DEPLOY_STACKS, default: 'OTHER' },
    buildCommand: { type: String },
    installCommand: { type: String },
    outputDirectory: { type: String },
    environmentNotes: { type: String },
    finalUrl: { type: String },
    steps: { type: [deployStepSchema], default: [] },
  },
  { timestamps: true },
);

deployChecklistSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type DeployChecklist = InferSchemaType<typeof deployChecklistSchema>;
export type DeployChecklistDocument = HydratedDocument<DeployChecklist>;

export const DeployChecklistModel = model('DeployChecklist', deployChecklistSchema);
