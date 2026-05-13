import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

const docSectionSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, default: '' },
    completed: { type: Boolean, default: false },
  },
  { _id: false },
);

export const DOC_SECTION_KEYS = [
  'overview',
  'stack',
  'installation',
  'env',
  'commands',
  'database',
  'deploy',
  'commonErrors',
  'contributors',
] as const;

export type DocSectionKey = (typeof DOC_SECTION_KEYS)[number];

const projectDocSchema = new Schema(
  {
    project: {
      type: Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    sections: {
      overview: { type: docSectionSchema, default: () => ({ title: 'Overview' }) },
      stack: { type: docSectionSchema, default: () => ({ title: 'Stack' }) },
      installation: { type: docSectionSchema, default: () => ({ title: 'Installation' }) },
      env: { type: docSectionSchema, default: () => ({ title: 'Environment Variables' }) },
      commands: { type: docSectionSchema, default: () => ({ title: 'Commands' }) },
      database: { type: docSectionSchema, default: () => ({ title: 'Database' }) },
      deploy: { type: docSectionSchema, default: () => ({ title: 'Deploy' }) },
      commonErrors: { type: docSectionSchema, default: () => ({ title: 'Common Errors' }) },
      contributors: { type: docSectionSchema, default: () => ({ title: 'Contributors' }) },
    },
    completionPercent: { type: Number, default: 0, min: 0, max: 100 },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

projectDocSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type ProjectDoc = InferSchemaType<typeof projectDocSchema>;
export type ProjectDocDocument = HydratedDocument<ProjectDoc>;

export const ProjectDocModel = model('ProjectDoc', projectDocSchema);
