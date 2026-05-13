import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PLAN_VALUES, PLAN_LIMITS } from '../../shared/constants/plans';

export const SUBSCRIPTION_STATUS = ['ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[number];

const subscriptionLimitsSchema = new Schema(
  {
    maxProjects: { type: Number, required: true },
    maxMembers: { type: Number, required: true },
    maxStorageMb: { type: Number, required: true },
    maxTasks: { type: Number, default: null },
    canDownloadReadme: { type: Boolean, default: false },
    canUseGithubPrivateRepos: { type: Boolean, default: false },
    canUseAdvancedDeployWizard: { type: Boolean, default: false },
  },
  { _id: false },
);

const subscriptionSchema = new Schema(
  {
    team: {
      type: Types.ObjectId,
      ref: 'Team',
      required: true,
      unique: true,
      index: true,
    },
    plan: {
      type: String,
      enum: PLAN_VALUES,
      default: 'FREE',
      required: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUS,
      default: 'ACTIVE',
    },
    limits: {
      type: subscriptionLimitsSchema,
      default: () => PLAN_LIMITS.FREE,
    },
  },
  { timestamps: true },
);

subscriptionSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Subscription = InferSchemaType<typeof subscriptionSchema>;
export type SubscriptionDocument = HydratedDocument<Subscription>;

export const SubscriptionModel = model('Subscription', subscriptionSchema);
