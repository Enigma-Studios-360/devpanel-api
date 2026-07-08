import { Types } from 'mongoose';
import { ArcadeProgressModel } from './arcade.model';
import type { ReportProgressInput } from './arcade.validation';

const DEFAULT_GAME = 'devcrafting';

export const arcadeService = {
  /** Latest snapshot for the authenticated user (null = never played). */
  async getForUser(userId: string, game = DEFAULT_GAME): Promise<unknown> {
    const doc = await ArcadeProgressModel.findOne({
      user: new Types.ObjectId(userId),
      game,
    });
    return doc ? doc.toJSON() : null;
  },

  /**
   * Upsert the snapshot the game reports at the end of each in-game day.
   * The game client is the source of truth for its own save, so we take the
   * report as-is (validated by Zod) instead of merging field by field.
   */
  async report(userId: string, input: ReportProgressInput): Promise<unknown> {
    const game = input.game ?? DEFAULT_GAME;
    const doc = await ArcadeProgressModel.findOneAndUpdate(
      { user: new Types.ObjectId(userId), game },
      {
        $set: {
          day: input.day,
          totalStars: input.totalStars,
          money: input.money,
          ...(input.rank !== undefined ? { rank: input.rank } : {}),
          ticketsResolved: input.ticketsResolved,
          ...(input.ticketsLost !== undefined ? { ticketsLost: input.ticketsLost } : {}),
          lastPlayedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return doc.toJSON();
  },

  /** Top players by stars — powers the dashboard leaderboard. */
  async leaderboard(game = DEFAULT_GAME, limit = 10): Promise<unknown[]> {
    const docs = await ArcadeProgressModel.find({ game })
      .sort({ totalStars: -1, day: -1 })
      .limit(limit)
      .populate('user', 'name');
    return docs.map((d) => d.toJSON());
  },
};
