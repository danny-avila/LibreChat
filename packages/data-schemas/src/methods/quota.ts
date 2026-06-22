import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { IQuota, IQuotaLean } from '~/types/quota';
import type { Types } from 'mongoose';

export function createQuotaMethods(mongoose: typeof import('mongoose')) {
  /** Creates a new quota record for a user + period. */
  async function createQuota(args: {
    userId: Types.ObjectId;
    periodStart: Date;
  }): Promise<IQuotaLean> {
    const Quota = mongoose.models.Quota as Model<IQuota>;
    const now = new Date();
    const doc = await Quota.create({
      user_id: args.userId,
      period_start: args.periodStart,
      messages_used: 0,
      created_at: now,
      updated_at: now,
    });
    return doc.toObject() as IQuotaLean;
  }

  /**
   * Atomically increments messages_used by 1 if below limit.
   * Returns the updated doc on success, or null when the quota is exhausted.
   *
   * Uses a single findOneAndUpdate with a `messages_used < limit` filter so
   * MongoDB enforces the cap atomically — no read-then-write race.
   *
   * On duplicate-key (11000) from a concurrent upsert, retries once via an
   * update-only path (no upsert) to resolve the race without creating a dupe.
   */
  async function incrementQuota(args: {
    userId: Types.ObjectId;
    periodStart: Date;
    limit: number;
  }): Promise<IQuotaLean | null> {
    const Quota = mongoose.models.Quota as Model<IQuota>;
    const now = new Date();

    const filter: FilterQuery<IQuota> = {
      user_id: args.userId,
      period_start: args.periodStart,
      messages_used: { $lt: args.limit },
    };
    const update: UpdateQuery<IQuota> = {
      $inc: { messages_used: 1 },
      $setOnInsert: { created_at: now },
      $set: { updated_at: now },
    };

    try {
      return await Quota.findOneAndUpdate(filter, update, {
        new: true,
        upsert: true,
      }).lean<IQuotaLean>();
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code !== 11000) {
        throw err;
      }
      // Concurrent upsert collision: retry once without upsert
      return Quota.findOneAndUpdate(
        filter,
        { $inc: { messages_used: 1 }, $set: { updated_at: now } },
        {
          new: true,
          upsert: false,
        },
      ).lean<IQuotaLean>();
    }
  }

  /** Resets messages_used to 0 for the given user + period. */
  async function resetQuota(args: {
    userId: Types.ObjectId;
    periodStart: Date;
  }): Promise<IQuotaLean | null> {
    const Quota = mongoose.models.Quota as Model<IQuota>;
    const filter: FilterQuery<IQuota> = {
      user_id: args.userId,
      period_start: args.periodStart,
    };
    const update: UpdateQuery<IQuota> = {
      $set: { messages_used: 0, updated_at: new Date() },
    };
    return Quota.findOneAndUpdate(filter, update, { new: true }).lean<IQuotaLean>();
  }

  return {
    createQuota,
    incrementQuota,
    resetQuota,
  };
}

export type QuotaMethods = ReturnType<typeof createQuotaMethods>;
