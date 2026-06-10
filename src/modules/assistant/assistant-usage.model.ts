import {
  Schema,
  model,
  Types,
  type InferSchemaType,
  type HydratedDocument,
} from 'mongoose';

/**
 * Tracks how many assistant (DeepSeek) messages a user has spent in a given
 * ISO-week bucket. Powers the per-plan weekly quota so total LLM spend stays
 * within budget no matter how many users there are. One row per (user, week).
 */
const assistantUsageSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    /** ISO week bucket, e.g. "2026-W23". */
    periodKey: { type: String, required: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

assistantUsageSchema.index({ user: 1, periodKey: 1 }, { unique: true });

export type AssistantUsage = InferSchemaType<typeof assistantUsageSchema>;
export type AssistantUsageDocument = HydratedDocument<AssistantUsage>;

export const AssistantUsageModel = model('AssistantUsage', assistantUsageSchema);
