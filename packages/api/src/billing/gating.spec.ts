import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { applyPlanChange } from './applyPlanChange';
import { checkBillingAccess } from './gating';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;

function buildApplyDeps() {
  const m = createMethods(mongoose);
  return {
    getActiveSubscriptionRecord: m.getActiveSubscriptionRecord,
    expireActiveSubscriptions: m.expireActiveSubscriptions,
    createSubscription: m.createSubscription,
    createQuota: m.createQuota,
  };
}

function buildGatingDeps() {
  return {
    getActiveSubscriptionRecord: methods.getActiveSubscriptionRecord,
    incrementQuota: methods.incrementQuota,
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
  for (const modelName of Object.keys(mongoose.models)) {
    await mongoose.models[modelName].ensureIndexes();
  }
  methods = createMethods(mongoose);
});

async function expectDenied(promise: Promise<void>, expectedCode: string): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(Error);
  const payload: { code: string } = JSON.parse((thrown as Error).message);
  expect(payload.code).toBe(expectedCode);
}

describe('checkBillingAccess — model tier gating', () => {
  test('free user + expensive model → throws upgrade_required_model', async () => {
    expect.assertions(2);
    const userId = new mongoose.Types.ObjectId();

    await expectDenied(
      checkBillingAccess({ userId, modelId: 'gpt-5.5' }, buildGatingDeps()),
      'upgrade_required_model',
    );
  });

  test('free user + cheap model 3× passes, 4th throws upgrade_required_quota', async () => {
    const userId = new mongoose.Types.ObjectId();
    const deps = buildGatingDeps();

    await expect(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
    ).resolves.toBeUndefined();
    await expect(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
    ).resolves.toBeUndefined();
    await expect(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
    ).resolves.toBeUndefined();

    await expectDenied(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
      'upgrade_required_quota',
    );
  });

  test('pro user (granted via applyPlanChange) + expensive model → passes', async () => {
    const userId = new mongoose.Types.ObjectId();
    await applyPlanChange(
      { user_id: userId, plan_code: 'pro_m', source: 'admin' },
      buildApplyDeps(),
    );

    await expect(
      checkBillingAccess({ userId, modelId: 'gpt-5.5' }, buildGatingDeps()),
    ).resolves.toBeUndefined();
  });

  test('unknown model treated as mid tier → free user denied (mid not in cheap)', async () => {
    expect.assertions(2);
    const userId = new mongoose.Types.ObjectId();

    await expectDenied(
      checkBillingAccess({ userId, modelId: 'totally-unknown-model-xyz' }, buildGatingDeps()),
      'upgrade_required_model',
    );
  });
});

describe('checkBillingAccess — feature gating', () => {
  test('featureFlag set + free plan + cheap model → throws feature_not_available', async () => {
    expect.assertions(2);
    const userId = new mongoose.Types.ObjectId();
    // gpt-5-mini is cheap (passes tier check), but agents=false on free plan

    await expectDenied(
      checkBillingAccess(
        { userId, modelId: 'gpt-5.4-mini', featureFlag: 'agents' },
        buildGatingDeps(),
      ),
      'feature_not_available',
    );
  });

  test('featureFlag set + pro plan → passes feature check and quota increment', async () => {
    const userId = new mongoose.Types.ObjectId();
    await applyPlanChange(
      { user_id: userId, plan_code: 'pro_m', source: 'admin' },
      buildApplyDeps(),
    );

    await expect(
      checkBillingAccess(
        { userId, modelId: 'gpt-5.4-mini', featureFlag: 'agents' },
        buildGatingDeps(),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('checkBillingAccess — payload shape', () => {
  test('upgrade_required_model error includes current_plan and required_tier', async () => {
    const userId = new mongoose.Types.ObjectId();

    let caughtErr: unknown;
    try {
      await checkBillingAccess({ userId, modelId: 'gpt-5.5' }, buildGatingDeps());
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeInstanceOf(Error);
    const payload: { code: string; current_plan: string; required_tier: string } = JSON.parse(
      (caughtErr as Error).message,
    );
    expect(payload.code).toBe('upgrade_required_model');
    expect(payload.current_plan).toBe('free');
    expect(payload.required_tier).toBe('expensive');
  });

  test('upgrade_required_quota error includes used and limit', async () => {
    const userId = new mongoose.Types.ObjectId();
    const deps = buildGatingDeps();

    for (let i = 0; i < 3; i++) {
      await checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps);
    }

    let caughtErr: unknown;
    try {
      await checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps);
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeInstanceOf(Error);
    const payload: { code: string; used: number; limit: number } = JSON.parse(
      (caughtErr as Error).message,
    );
    expect(payload.code).toBe('upgrade_required_quota');
    expect(payload.used).toBe(3);
    expect(payload.limit).toBe(3);
  });
});

describe('checkBillingAccess — quota period semantics', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('lifetime plan (free) does not reset across a day boundary', async () => {
    expect.assertions(2);
    // Fake only Date — leave real timers/sockets alone so mongoose's async
    // connection machinery (which relies on real setTimeout/setImmediate)
    // keeps working while `new Date()` inside resolvePeriodStart is frozen.
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    jest.setSystemTime(new Date('2026-01-01T23:00:00Z'));
    const userId = new mongoose.Types.ObjectId();
    const deps = buildGatingDeps();

    for (let i = 0; i < 3; i++) {
      await checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps);
    }

    // Cross midnight into the next day.
    jest.setSystemTime(new Date('2026-01-02T01:00:00Z'));

    // Free plan's lifetime quota (3) is already used up — a new day must not reset it.
    await expectDenied(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
      'upgrade_required_quota',
    );
  });

  test('daily plan (pro) resets after crossing a day boundary', async () => {
    // Fake only Date — leave real timers/sockets alone so mongoose's async
    // connection machinery (which relies on real setTimeout/setImmediate)
    // keeps working while `new Date()` inside resolvePeriodStart is frozen.
    jest.useFakeTimers({
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    jest.setSystemTime(new Date('2026-01-01T23:00:00Z'));
    const userId = new mongoose.Types.ObjectId();
    await applyPlanChange(
      { user_id: userId, plan_code: 'pro_m', source: 'admin' },
      buildApplyDeps(),
    );
    const deps = buildGatingDeps();

    for (let i = 0; i < 100; i++) {
      await checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps);
    }
    await expectDenied(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
      'upgrade_required_quota',
    );

    // Cross midnight into the next day — the daily quota should have reset.
    jest.setSystemTime(new Date('2026-01-02T01:00:00Z'));
    await expect(
      checkBillingAccess({ userId, modelId: 'gpt-5.4-mini' }, deps),
    ).resolves.toBeUndefined();
  });
});
