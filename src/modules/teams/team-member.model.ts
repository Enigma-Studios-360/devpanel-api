import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { TEAM_ROLE_VALUES, TEAM_MEMBER_STATUS_VALUES } from '../../shared/constants/roles';

const teamMemberSchema = new Schema(
  {
    team: { type: Types.ObjectId, ref: 'Team', required: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: TEAM_ROLE_VALUES, default: 'DEVELOPER' },
    status: {
      type: String,
      enum: TEAM_MEMBER_STATUS_VALUES,
      default: 'ACTIVE',
      index: true,
    },
    invitedBy: { type: Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
  },
  { timestamps: true },
);

teamMemberSchema.index({ team: 1, user: 1 }, { unique: true });

teamMemberSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type TeamMember = InferSchemaType<typeof teamMemberSchema>;
export type TeamMemberDocument = HydratedDocument<TeamMember>;

export const TeamMemberModel = model('TeamMember', teamMemberSchema);
