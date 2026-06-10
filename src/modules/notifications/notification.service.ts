import { Types } from 'mongoose';
import {
  NotificationModel,
  type NotificationDocument,
  type NotificationType,
} from './notification.model';
import {
  parsePagination,
  buildPaginationResult,
  type PaginationResult,
} from '../../shared/utils/pagination';
import {
  BadRequestError,
  NotFoundError,
} from '../../shared/errors/http-errors';

/**
 * In-app notifications.
 *
 * Design notes:
 *
 * - **Per-user fanout.** Every notification belongs to exactly one user
 *   (`user` field). When a domain event has multiple recipients (e.g. a
 *   task is assigned to 3 people), we create N documents — one per
 *   user. This keeps the read state simple and lets each user manage
 *   their own bell independently.
 *
 * - **Best-effort.** `createForUser` and friends never throw. Domain
 *   code that hooks into notifications (task assign, deploy ready, …)
 *   shouldn't crash because a notification failed to write.
 *
 * - **Dedup ID.** The optional `dedupKey` argument lets callers prevent
 *   double-fires from idempotent hooks (a polling refresh that sees the
 *   same status twice). We index it together with `user` so the upsert
 *   stays O(log n).
 */

interface CreatePayload {
  type: NotificationType;
  title: string;
  message: string;
  team?: string | Types.ObjectId;
  project?: string | Types.ObjectId;
  action?: { label: string; url: string };
  metadata?: Record<string, unknown>;
  /**
   * Optional unique key per (user, dedupKey). If provided AND a doc
   * with the same pair already exists, we skip the insert. Used by
   * deploy hooks to avoid double-notifying when polling settles.
   */
  dedupKey?: string;
}

const toObjectId = (value: string | Types.ObjectId): Types.ObjectId =>
  value instanceof Types.ObjectId ? value : new Types.ObjectId(value);

const ensureValid = (id: string, field: string): void => {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${field} id`);
  }
};

export const notificationService = {
  /**
   * Best-effort write. Returns the created doc on success, or null when
   * the deduplication key prevented it. Never throws.
   */
  async createForUser(
    userId: string | Types.ObjectId,
    payload: CreatePayload,
  ): Promise<NotificationDocument | null> {
    try {
      if (payload.dedupKey) {
        const existing = await NotificationModel.findOne({
          user: toObjectId(userId),
          'metadata.dedupKey': payload.dedupKey,
        }).select('_id');
        if (existing) return null;
      }
      const metadata = payload.dedupKey
        ? { ...(payload.metadata ?? {}), dedupKey: payload.dedupKey }
        : payload.metadata;
      return await NotificationModel.create({
        user: toObjectId(userId),
        team: payload.team ? toObjectId(payload.team) : undefined,
        project: payload.project ? toObjectId(payload.project) : undefined,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        action: payload.action,
        metadata,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        '[notifications] Failed to create:',
        (error as Error).message,
      );
      return null;
    }
  },

  /**
   * Fan out the same payload to multiple recipients. Skips self when
   * `excludeUserId` is provided (you don't want to notify yourself
   * when you comment your own task). Best-effort overall.
   */
  async createForMany(
    userIds: Array<string | Types.ObjectId>,
    payload: CreatePayload,
    excludeUserId?: string,
  ): Promise<number> {
    const uniqueIds = Array.from(
      new Set(userIds.map((id) => id.toString())),
    ).filter((id) => id !== excludeUserId && Types.ObjectId.isValid(id));
    if (uniqueIds.length === 0) return 0;
    const results = await Promise.all(
      uniqueIds.map((id) => this.createForUser(id, payload)),
    );
    return results.filter(Boolean).length;
  },

  /**
   * Page through a user's notifications. `?onlyUnread=true` filters out
   * everything they've already seen — used by the dropdown's "unread" tab.
   */
  async listForUser(
    userId: string,
    query: Record<string, unknown>,
  ): Promise<PaginationResult<unknown>> {
    const params = parsePagination(query);
    const filter: Record<string, unknown> = {
      user: toObjectId(userId),
    };
    if (query['onlyUnread'] === 'true' || query['onlyUnread'] === true) {
      filter.readAt = null;
    }
    const [data, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(params.skip)
        .limit(params.limit)
        .lean(),
      NotificationModel.countDocuments(filter),
    ]);
    return buildPaginationResult(data, total, params);
  },

  async unreadCount(userId: string): Promise<number> {
    return NotificationModel.countDocuments({
      user: toObjectId(userId),
      readAt: null,
    });
  },

  async markRead(notificationId: string, userId: string): Promise<NotificationDocument> {
    ensureValid(notificationId, 'notification');
    const doc = await NotificationModel.findOne({
      _id: new Types.ObjectId(notificationId),
      user: toObjectId(userId),
    });
    if (!doc) throw new NotFoundError('Notification not found');
    if (!doc.readAt) {
      doc.readAt = new Date();
      await doc.save();
    }
    return doc;
  },

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await NotificationModel.updateMany(
      { user: toObjectId(userId), readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updated: result.modifiedCount ?? 0 };
  },

  async remove(notificationId: string, userId: string): Promise<{ deleted: true }> {
    ensureValid(notificationId, 'notification');
    const result = await NotificationModel.deleteOne({
      _id: new Types.ObjectId(notificationId),
      user: toObjectId(userId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundError('Notification not found');
    }
    return { deleted: true };
  },
};
