import type { FilterQuery } from 'mongoose';
import { DEFAULT_RETENTION_HOURS } from './tempChatRetention';

export type RetentionFilterDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | null;
};

export const activeExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [
      { expiredAt: null },
      { expiredAt: { $exists: false } },
      { expiredAt: { $gt: new Date() } },
    ],
  }) as FilterQuery<T>;

export const legacyPermanentExpirationFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
  }) as FilterQuery<T>;

export const buildRetentionVisibilityFilter = <
  T extends RetentionFilterDocument = RetentionFilterDocument,
>(): FilterQuery<T> =>
  ({
    $or: [
      {
        isTemporary: false,
        ...activeExpirationFilter<T>(),
      },
      {
        isTemporary: { $exists: false },
        ...legacyPermanentExpirationFilter<T>(),
      },
      {
        isTemporary: null,
        ...legacyPermanentExpirationFilter<T>(),
      },
    ],
  }) as FilterQuery<T>;

export const createFallbackRetentionDate = (now = Date.now()): Date =>
  new Date(now + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);
