// packages/api/src/billing/plans.ts
import type { PlanCode, PlanConfig } from 'librechat-data-provider';

export const PLANS: Record<PlanCode, PlanConfig> = {
  free: {
    code: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    allowed_cost_tiers: ['cheap'],
    quota_period: 'lifetime',
    message_limit: 3, // 终身 3 条试用，不重置
    features: { agents: false, image_gen: false, voice: false, web_search: false },
  },
  trial: {
    code: 'trial',
    name: 'Trial',
    monthly_price_cents: 100,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    quota_period: 'daily',
    message_limit: 30, // 占位数字，待阶段4调研同行后校准
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_m: {
    code: 'pro_m',
    name: 'Pro Monthly',
    monthly_price_cents: 2999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    quota_period: 'daily',
    message_limit: 100, // 占位数字，待阶段4调研同行后校准
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_q: {
    code: 'pro_q',
    name: 'Pro Quarterly',
    monthly_price_cents: 7999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    quota_period: 'daily',
    message_limit: 100, // 占位数字，待阶段4调研同行后校准
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_h: {
    code: 'pro_h',
    name: 'Pro Half-Year',
    monthly_price_cents: 14999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    quota_period: 'daily',
    message_limit: 100, // 占位数字，待阶段4调研同行后校准
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
};
