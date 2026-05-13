import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { PLAN_VALUES } from '../../shared/constants/plans';

const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    owner: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    plan: {
      type: String,
      enum: PLAN_VALUES,
      default: 'FREE',
      index: true,
    },
  },
  { timestamps: true },
);

teamSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type Team = InferSchemaType<typeof teamSchema>;
export type TeamDocument = HydratedDocument<Team>;

export const TeamModel = model('Team', teamSchema);
