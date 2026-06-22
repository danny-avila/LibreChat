// packages/api/src/billing/plans.ts
import type { PlanCode, PlanConfig } from 'librechat-data-provider';

export const PLANS: Record<PlanCode, PlanConfig> = {
  free: {
    code: 'free',
    name: 'Free',
    monthly_price_cents: 0,
    allowed_cost_tiers: ['cheap'],
    monthly_message_limit: 3, // 3 条试用
    features: { agents: false, image_gen: false, voice: false, web_search: false },
  },
  trial: {
    code: 'trial',
    name: 'Trial',
    monthly_price_cents: 100,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 100,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_m: {
    code: 'pro_m',
    name: 'Pro Monthly',
    monthly_price_cents: 2999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_q: {
    code: 'pro_q',
    name: 'Pro Quarterly',
    monthly_price_cents: 7999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
  pro_h: {
    code: 'pro_h',
    name: 'Pro Half-Year',
    monthly_price_cents: 14999,
    allowed_cost_tiers: ['cheap', 'mid', 'expensive'],
    monthly_message_limit: 2000,
    features: { agents: true, image_gen: true, voice: true, web_search: true },
  },
};
