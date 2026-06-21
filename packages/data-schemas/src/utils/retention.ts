import type { FilterQuery, Model } from 'mongoose';
import type { IMessage } from '~/types';
import { DEFAULT_RETENTION_HOURS } from './tempChatRetention';

export type RetentionFilterDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
};

export const activeExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date() } }],
  }) as FilterQuery<T>;

export const legacyPermanentExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> => ({ expiredAt: null }) as FilterQuery<T>;

export const buildRetentionVisibilityFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [
      { isTemporary: false, expiredAt: null },
      { isTemporary: false, expiredAt: { $gt: new Date() } },
      { isTemporary: null, expiredAt: null },
    ],
  }) as FilterQuery<T>;

export const createFallbackRetentionDate = (now: number = Date.now()): Date =>
  new Date(now + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);

/**
 * Applies forced-retention deadlines to a conversation's not-yet-temporary messages.
 *
 * Forced (ephemeral) retention must cover existing messages too. A conversation that
 * predates the mode keeps non-temporary messages — `expiredAt: null` permanent messages,
 * or `isTemporary: false` messages with a future `expiredAt` carried over from `all`
 * retention — that outlive the converted conversation. Targeting `isTemporary !== true`
 * pulls both onto the ephemeral schedule and stays a no-op once a conversation has been
 * converted.
 */
export const forceConversationMessagesTemporary = async (
  Message: Model<IMessage>,
  userId: string,
  conversationId: string,
  expiredAt: Date,
): Promise<void> => {
  await Message.updateMany(
    { conversationId, user: userId, isTemporary: { $ne: true } },
    { $set: { isTemporary: true, expiredAt } },
  );
};
