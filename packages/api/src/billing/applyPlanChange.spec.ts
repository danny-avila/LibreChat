import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import {
  applyPlanChange,
  getActiveSubscription,
  SYSTEM_DEFAULT_FREE_SUBSCRIPTION,
} from './applyPlanChange';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

let mongoServer: MongoMemoryServer;
let deps: ReturnType<typeof buildDeps>;

function buildDeps() {
  const methods = createMethods(mongoose);
  return {
    getActiveSubscriptionRecord: methods.getActiveSubscriptionRecord,
    expireActiveSubscriptions: methods.expireActiveSubscriptions,
    createSubscription: methods.createSubscription,
    createQuota: methods.createQuota,
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  // Ensure indexes are in place after each drop
  for (const modelName of Object.keys(mongoose.models)) {
    await mongoose.models[modelName].ensureIndexes();
  }
  deps = buildDeps();
});

describe('applyPlanChange', () => {
  test('grant pro_m: creates active subscription + zeroed quota; previous_plan is null first time', async () => {
    const userId = new mongoose.Types.ObjectId();

    const result = await applyPlanChange(
      { user_id: userId, plan_code: 'pro_m', source: 'admin' },
      deps,
    );

    expect(result.previous_plan).toBeNull();
    expect(result.subscription.plan_code).toBe('pro_m');
    expect(result.subscription.status).toBe('admin_granted');
    expect(result.quota.messages_used).toBe(0);
    expect(result.quota.period_start.getTime()).toBe(
      result.subscription.current_period_start.getTime(),
    );
  });

  test('second grant (trial) expires first sub; exactly one active remains; previous_plan=pro_m', async () => {
    const userId = new mongoose.Types.ObjectId();

    await applyPlanChange({ user_id: userId, plan_code: 'pro_m', source: 'admin' }, deps);
    const Subscription = mongoose.models.Subscription;

    const countAfterFirst = await Subscription.countDocuments({
      user_id: userId,
      status: { $in: ['active', 'admin_granted', 'trialing'] },
    });
    expect(countAfterFirst).toBe(1);

    const result2 = await applyPlanChange(
      { user_id: userId, plan_code: 'trial', source: 'admin' },
      deps,
    );

    expect(result2.previous_plan).toBe('pro_m');
    expect(result2.subscription.plan_code).toBe('trial');

    const activeCount = await Subscription.countDocuments({
      user_id: userId,
      status: { $in: ['active', 'admin_granted', 'trialing'] },
    });
    expect(activeCount).toBe(1);

    const expiredCount = await Subscription.countDocuments({ user_id: userId, status: 'expired' });
    expect(expiredCount).toBe(1);
  });

  test('period_end is now + correct period_days per plan_code', async () => {
    const cases: Array<{
      plan_code: 'pro_m' | 'pro_q' | 'pro_h' | 'trial' | 'free';
      days: number;
    }> = [
      { plan_code: 'pro_m', days: 30 },
      { plan_code: 'pro_q', days: 90 },
      { plan_code: 'pro_h', days: 180 },
      { plan_code: 'trial', days: 7 },
      { plan_code: 'free', days: 30 },
    ];

    for (const { plan_code, days } of cases) {
      const userId = new mongoose.Types.ObjectId();
      const before = Date.now();
      const result = await applyPlanChange({ user_id: userId, plan_code, source: 'admin' }, deps);
      const after = Date.now();

      const expectedMs = days * 24 * 60 * 60 * 1000;
      const actualMs =
        result.subscription.current_period_end.getTime() -
        result.subscription.current_period_start.getTime();

      // Allow 1 second tolerance for test execution time
      expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(actualMs).toBeLessThanOrEqual(expectedMs + (after - before) + 1000);
    }
  });

  test('custom period_days overrides plan default', async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await applyPlanChange(
      { user_id: userId, plan_code: 'pro_m', source: 'admin', period_days: 45 },
      deps,
    );

    const actualDays = Math.round(
      (result.subscription.current_period_end.getTime() -
        result.subscription.current_period_start.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    expect(actualDays).toBe(45);
  });
});

describe('getActiveSubscription', () => {
  test('returns the active subscription when one exists', async () => {
    const userId = new mongoose.Types.ObjectId();
    await applyPlanChange({ user_id: userId, plan_code: 'pro_m', source: 'admin' }, deps);

    const sub = await getActiveSubscription(userId, deps);
    expect(sub.plan_code).toBe('pro_m');
    expect('_id' in sub).toBe(true);
  });

  test('returns SYSTEM_DEFAULT_FREE_SUBSCRIPTION when no active sub exists', async () => {
    const userId = new mongoose.Types.ObjectId();

    const sub = await getActiveSubscription(userId, deps);
    expect(sub.plan_code).toBe('free');
    expect(sub.source).toBe('system_default');
    expect('_id' in sub).toBe(false);
  });

  test('after expiring the only sub, returns system default free', async () => {
    const userId = new mongoose.Types.ObjectId();
    await applyPlanChange({ user_id: userId, plan_code: 'pro_m', source: 'admin' }, deps);
    await deps.expireActiveSubscriptions(userId);

    const sub = await getActiveSubscription(userId, deps);
    expect(sub.plan_code).toBe('free');
    expect(sub.source).toBe('system_default');
  });
});

describe('SYSTEM_DEFAULT_FREE_SUBSCRIPTION', () => {
  test('returns plan_code free and source system_default', () => {
    const sub = SYSTEM_DEFAULT_FREE_SUBSCRIPTION();
    expect(sub.plan_code).toBe('free');
    expect(sub.source).toBe('system_default');
  });

  test('current_period_start is start of current month', () => {
    const sub = SYSTEM_DEFAULT_FREE_SUBSCRIPTION();
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1);
    expect(sub.current_period_start.getTime()).toBe(expectedStart.getTime());
  });

  test('current_period_end is start of next month', () => {
    const sub = SYSTEM_DEFAULT_FREE_SUBSCRIPTION();
    const now = new Date();
    const expectedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(sub.current_period_end.getTime()).toBe(expectedEnd.getTime());
  });
});
