import type { FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { ISubscription, ISubscriptionLean } from '~/types/subscription';
import type { PlanCode, SubStatus, PlanChangeSource } from 'librechat-data-provider';
import type { Types } from 'mongoose';

const ACTIVE_STATUSES: SubStatus[] = ['active', 'trialing', 'admin_granted'];

export function createSubscriptionMethods(mongoose: typeof import('mongoose')) {
  /** Returns the newest non-expired active subscription for the given user, or null. */
  async function getActiveSubscriptionRecord(
    userId: Types.ObjectId,
  ): Promise<ISubscriptionLean | null> {
    const Subscription = mongoose.models.Subscription as Model<ISubscription>;
    const filter: FilterQuery<ISubscription> = {
      user_id: userId,
      status: { $in: ACTIVE_STATUSES },
      current_period_end: { $gt: new Date() },
    };
    return Subscription.findOne(filter).sort({ current_period_end: -1 }).lean<ISubscriptionLean>();
  }

  /** Marks all active subscriptions for the given user as expired. */
  async function expireActiveSubscriptions(userId: Types.ObjectId): Promise<number> {
    const Subscription = mongoose.models.Subscription as Model<ISubscription>;
    const filter: FilterQuery<ISubscription> = {
      user_id: userId,
      status: { $in: ACTIVE_STATUSES },
    };
    const update: UpdateQuery<ISubscription> = {
      $set: { status: 'expired', updated_at: new Date() },
    };
    const result = await Subscription.updateMany(filter, update);
    return result.modifiedCount;
  }

  /** Creates a new subscription record. Use only via applyPlanChange. */
  async function createSubscription(args: {
    userId: Types.ObjectId;
    planCode: PlanCode;
    status: SubStatus;
    source: PlanChangeSource;
    periodStart: Date;
    periodEnd: Date;
    externalRef?: string | null;
    grantedBy?: Types.ObjectId | null;
    metadata?: Record<string, string>;
  }): Promise<ISubscriptionLean> {
    const Subscription = mongoose.models.Subscription as Model<ISubscription>;
    const now = new Date();
    const doc = await Subscription.create({
      user_id: args.userId,
      plan_code: args.planCode,
      status: args.status,
      source: args.source,
      current_period_start: args.periodStart,
      current_period_end: args.periodEnd,
      external_ref: args.externalRef ?? null,
      granted_by: args.grantedBy ?? null,
      metadata: args.metadata ?? {},
      created_at: now,
      updated_at: now,
    });
    return doc.toObject() as ISubscriptionLean;
  }

  return {
    getActiveSubscriptionRecord,
    expireActiveSubscriptions,
    createSubscription,
  };
}

export type SubscriptionMethods = ReturnType<typeof createSubscriptionMethods>;
