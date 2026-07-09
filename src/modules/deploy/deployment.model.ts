import {
  Schema,
  model,
  Types,
  type InferSchemaType,
  type HydratedDocument,
} from 'mongoose';

/**
 * High-level status the UI cares about. We map every Vercel state into
 * one of these five so the frontend can render colored badges without
 * worrying about edge cases (CANCELED → CANCELED, INITIALIZING → QUEUED,
 * etc.).
 */
export const DEPLOY_STATUS_VALUES = [
  'QUEUED',
  'BUILDING',
  'READY',
  'ERROR',
  'CANCELED',
] as const;

export type DeployStatus = (typeof DEPLOY_STATUS_VALUES)[number];

const deploymentSchema = new Schema(
  {
    project: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    team: { type: Types.ObjectId, ref: 'Team', required: true, index: true },
    triggeredBy: { type: Types.ObjectId, ref: 'User', required: true },

    provider: { type: String, default: 'VERCEL' },

    /** ID Vercel returns for the deployment, e.g. "dpl_abc123". */
    vercelDeploymentId: { type: String, index: true },
    /** Internal Vercel project id (prj_…) — used to list further deployments. */
    vercelProjectId: { type: String, index: true },
    /** The user-facing project name on Vercel (slug-ish). */
    vercelProjectName: { type: String },

    /** Public URL of the deployment, populated when status reaches READY. */
    url: { type: String },
    /**
     * Stable production URL of the Vercel project (`https://<name>.vercel.app`).
     * Unlike `url` (per-deployment, may sit behind Vercel's deployment
     * protection), this one always points at the latest production build and
     * is what end users / QR codes should get.
     */
    publicUrl: { type: String },
    /** Direct link to the build/logs view on vercel.com. */
    inspectorUrl: { type: String },

    status: {
      type: String,
      enum: DEPLOY_STATUS_VALUES,
      default: 'QUEUED',
      index: true,
    },

    /** Last user-visible message when status is ERROR. */
    errorMessage: { type: String },

    /** Build configuration that was used to trigger the deploy. */
    framework: { type: String },
    buildCommand: { type: String },
    outputDirectory: { type: String },
    installCommand: { type: String },
    rootDirectory: { type: String },
    /** GitHub branch deployed (defaults to project.defaultBranch). */
    gitBranch: { type: String },
    /** Commit SHA Vercel ended up deploying (informational). */
    commitSha: { type: String },

    finishedAt: { type: Date },
  },
  { timestamps: true },
);

deploymentSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Deployment = InferSchemaType<typeof deploymentSchema>;
export type DeploymentDocument = HydratedDocument<Deployment>;

export const DeploymentModel = model('Deployment', deploymentSchema);
