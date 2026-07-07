import type { Types } from 'mongoose';
import type { PlanConfig } from 'librechat-data-provider';
import type { ISubscriptionLean, IQuotaLean } from '@librechat/data-schemas';
import { getActiveSubscription } from './applyPlanChange';
import { PLANS } from './plans';
import { getModelTier } from './modelRegistry';
import type { FeatureKey } from './modelRegistry';

export interface GatingDeps {
  getActiveSubscriptionRecord: (userId: Types.ObjectId) => Promise<ISubscriptionLean | null>;
  incrementQuota: (args: {
    userId: Types.ObjectId;
    periodStart: Date;
    limit: number;
  }) => Promise<IQuotaLean | null>;
}

/** Fixed epoch used as the quota `period_start` for lifetime (never-reset) plans. */
const LIFETIME_EPOCH = new Date(0);

/** Midnight UTC for the given date — the quota `period_start` for daily-reset plans. */
function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resolves the quota `period_start` for a plan from its `quota_period`.
 * `lifetime` plans always resolve to the same fixed epoch, so their quota
 * document is created once and never rolls over. `daily` plans resolve to
 * the current UTC day, so `incrementQuota`'s upsert naturally opens a fresh
 * quota document each day — no cron/rollover job required.
 */
function resolvePeriodStart(plan: PlanConfig): Date {
  return plan.quota_period === 'lifetime' ? LIFETIME_EPOCH : startOfUTCDay(new Date());
}

/**
 * Checks whether a user is allowed to use a model (and optional feature).
 *
 * Throws `Error(JSON.stringify({ code, ... }))` on denial — callers parse the
 * JSON payload to extract `code` and surface the right UI message.
 *
 * Three denial codes (lowercase, matching the future ErrorTypes enum values):
 *   - 'upgrade_required_model'  — model tier blocked by current plan
 *   - 'feature_not_available'   — feature flag disabled on current plan
 *   - 'upgrade_required_quota'  — message quota exhausted for the current period
 */
export async function checkBillingAccess(
  args: { userId: string | Types.ObjectId; modelId: string; featureFlag?: FeatureKey },
  deps: GatingDeps,
): Promise<void> {
  const userId =
    typeof args.userId === 'string' ? (args.userId as unknown as Types.ObjectId) : args.userId;

  const sub = await getActiveSubscription(userId, deps);
  const plan = PLANS[sub.plan_code];
  const tier = getModelTier(args.modelId);

  if (!plan.allowed_cost_tiers.includes(tier)) {
    throw new Error(
      JSON.stringify({
        code: 'upgrade_required_model',
        current_plan: plan.code,
        required_tier: tier,
      }),
    );
  }

  if (args.featureFlag !== undefined && !plan.features[args.featureFlag]) {
    throw new Error(JSON.stringify({ code: 'feature_not_available', feature: args.featureFlag }));
  }

  if (plan.message_limit > 0) {
    const q = await deps.incrementQuota({
      userId,
      periodStart: resolvePeriodStart(plan),
      limit: plan.message_limit,
    });
    if (q === null) {
      throw new Error(
        JSON.stringify({
          code: 'upgrade_required_quota',
          used: plan.message_limit,
          limit: plan.message_limit,
        }),
      );
    }
  }
}
