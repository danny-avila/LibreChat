// packages/data-provider/src/types/billing.ts
export type PlanCode = 'free' | 'trial' | 'pro_m' | 'pro_q' | 'pro_h';
export type CostTier = 'cheap' | 'mid' | 'expensive';
export type SubStatus = 'active' | 'trialing' | 'expired' | 'admin_granted';
export type PlanChangeSource = 'admin' | 'stripe' | 'system_default' | 'cli';

export type QuotaPeriod = 'lifetime' | 'daily';

export interface PlanConfig {
  code: PlanCode;
  name: string; // 用户可见名："Pro Monthly"
  monthly_price_cents: number; // 仅展示和未来 Stripe 映射
  allowed_cost_tiers: CostTier[];
  quota_period: QuotaPeriod; // lifetime = 终身次数(不重置), daily = 每日重置
  message_limit: number; // 该周期内的消息上限，-1 = unlimited
  features: {
    agents: boolean;
    image_gen: boolean;
    voice: boolean;
    web_search: boolean;
  };
}
