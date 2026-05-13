import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

const projectFileSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    task: { type: Types.ObjectId, ref: 'Task' },
    uploadedBy: { type: Types.ObjectId, ref: 'User', required: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

projectFileSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    delete r.path; // do not expose absolute path
    return r;
  },
});

export type ProjectFile = InferSchemaType<typeof projectFileSchema>;
export type ProjectFileDocument = HydratedDocument<ProjectFile>;

export const ProjectFileModel = model('ProjectFile', projectFileSchema);
