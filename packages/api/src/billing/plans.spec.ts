import { PLANS } from './plans';

const CODES = ['free', 'trial', 'pro_m', 'pro_q', 'pro_h'] as const;

describe('PLANS', () => {
  test('every PlanCode has a config with matching code', () => {
    for (const code of CODES) {
      expect(PLANS[code]).toBeDefined();
      expect(PLANS[code].code).toBe(code);
    }
  });
  test('free only allows cheap tier with a lifetime 3-message limit', () => {
    expect(PLANS.free.allowed_cost_tiers).toEqual(['cheap']);
    expect(PLANS.free.quota_period).toBe('lifetime');
    expect(PLANS.free.message_limit).toBe(3);
    expect(PLANS.free.features.image_gen).toBe(false);
  });
  test('pro plans allow all tiers + all features with a daily quota period', () => {
    for (const code of ['pro_m', 'pro_q', 'pro_h'] as const) {
      expect(PLANS[code].allowed_cost_tiers).toEqual(['cheap', 'mid', 'expensive']);
      expect(PLANS[code].quota_period).toBe('daily');
      expect(Object.values(PLANS[code].features).every(Boolean)).toBe(true);
    }
  });
});
