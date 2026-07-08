import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Player progress for the arcade component (DevCrafting). One document per
 * user+game: the game reports a snapshot at the end of each in-game day and
 * we keep the latest state, so the dashboard can show it and the progress
 * survives reinstalls of the game client.
 */
const arcadeProgressSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    game: { type: String, required: true, default: 'devcrafting' },
    day: { type: Number, required: true, min: 1, default: 1 },
    totalStars: { type: Number, required: true, min: 0, default: 0 },
    money: { type: Number, required: true, min: 0, default: 0 },
    rank: { type: String, default: 'Becario' },
    ticketsResolved: { type: Number, required: true, min: 0, default: 0 },
    ticketsLost: { type: Number, min: 0, default: 0 },
    lastPlayedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

arcadeProgressSchema.index({ user: 1, game: 1 }, { unique: true });

arcadeProgressSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    const r = ret as Record<string, unknown>;
    r._id = (r._id as { toString(): string }).toString();
    return r;
  },
});

export type ArcadeProgress = InferSchemaType<typeof arcadeProgressSchema>;
export type ArcadeProgressDocument = HydratedDocument<ArcadeProgress>;

export const ArcadeProgressModel = model('ArcadeProgress', arcadeProgressSchema);
