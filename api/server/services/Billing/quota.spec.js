const mongoose = require('mongoose');

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      error: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock('~/db/models', () => ({
  SubscriptionProfile: {
    collection: {
      collectionName: 'subscriptionprofiles',
    },
  },
}));

const { evaluateSubscriptionQuota, getCurrentPeriod, isCountableChatRequest } = require('./quota');

describe('Billing quota service', () => {
  let profiles;
  let collection;

  beforeEach(() => {
    profiles = new Map();

    Object.defineProperty(mongoose.connection, 'readyState', {
      value: 1,
      configurable: true,
    });

    collection = {
      findOne: jest.fn(async ({ userId }) => profiles.get(userId.toString()) ?? null),
      // Mirrors real Mongo: $setOnInsert applies only on insert. With
      // upsert: true and a unique userId index, a second insert against an
      // existing key throws E11000 — but the production code only inserts
      // when the doc is missing, so this mock just no-ops on update.
      updateOne: jest.fn(async (filter, update, options = {}) => {
        const key = filter.userId.toString();
        if (profiles.has(key)) {
          return { upsertedCount: 0, modifiedCount: 0, matchedCount: 1 };
        }
        if (options.upsert && update.$setOnInsert) {
          profiles.set(key, { ...update.$setOnInsert });
          return { upsertedCount: 1, modifiedCount: 0, matchedCount: 0 };
        }
        return { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
      }),
      // Real Mongo with upsert: false returns null when the filter doesn't
      // match, which is how the production code distinguishes "over quota"
      // from "allowed". (Previously the production code passed upsert: true
      // here, which masked the over-quota case as an E11000 error and
      // fail-opened — see the "fail-closes when at the limit" regression
      // test below.)
      findOneAndUpdate: jest.fn(async (filter, updatePipeline, options = {}) => {
        const userId = filter.userId;
        const key = userId.toString();
        const current = profiles.get(key) ?? null;
        const nextUpdate = updatePipeline[0].$set;
        const nextPeriod = nextUpdate.quota.period;
        const limit = nextUpdate.quota.limit;
        const isPro = !!current?.isPro || !!current?.entitlements?.codecan_ai_pro?.isActive;
        const currentUsage = current?.quota?.usedMessages ?? 0;
        const currentPeriod = current?.quota?.period;
        const allowed =
          isPro ||
          current == null ||
          currentPeriod !== nextPeriod ||
          (current?.quota?.usedMessages ?? 0) < limit;

        if (!allowed) {
          return options.upsert ? { value: null } : null;
        }

        let nextUsedMessages = 1;
        if (isPro) {
          nextUsedMessages = currentUsage;
        } else if (currentPeriod === nextPeriod) {
          nextUsedMessages = currentUsage + 1;
        }

        const nextProfile = {
          ...current,
          userId,
          appUserId: nextUpdate.appUserId,
          entitlementId: current?.entitlementId ?? 'codecan_ai_pro',
          isPro,
          quota: {
            period: nextPeriod,
            limit,
            usedMessages: nextUsedMessages,
          },
        };

        profiles.set(key, nextProfile);
        return nextProfile;
      }),
    };

    jest.spyOn(mongoose.connection, 'collection').mockReturnValue(collection);

    delete process.env.REVENUECAT_SECRET_API_KEY;
    delete process.env.REVENUECAT_ENTITLEMENT_ID;
    delete process.env.REVENUECAT_FREE_MESSAGES_PER_MONTH;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('counts only normal new prompts', () => {
    expect(isCountableChatRequest({ text: 'hello' })).toBe(true);
    expect(isCountableChatRequest({ text: '   ' })).toBe(false);
    expect(isCountableChatRequest({ text: 'hello', isRegenerate: true })).toBe(false);
    expect(isCountableChatRequest({ text: 'hello', isContinued: true })).toBe(false);
    expect(isCountableChatRequest({ text: 'hello', editedContent: {} })).toBe(false);
  });

  test('no-ops when subscription enforcement is disabled', async () => {
    const result = await evaluateSubscriptionQuota({
      user: { id: new mongoose.Types.ObjectId().toString() },
      body: { text: 'hello' },
    });

    expect(result.enabled).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('disabled');
  });

  test('allows the first three countable prompts and blocks the fourth', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'secret';
    const userId = new mongoose.Types.ObjectId().toString();
    const req = { user: { id: userId }, body: { text: 'hello world' } };

    const first = await evaluateSubscriptionQuota(req);
    const second = await evaluateSubscriptionQuota(req);
    const third = await evaluateSubscriptionQuota(req);
    const fourth = await evaluateSubscriptionQuota(req);

    expect(first.allowed).toBe(true);
    expect(first.state.usedMessages).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.state.usedMessages).toBe(2);
    expect(third.allowed).toBe(true);
    expect(third.state.usedMessages).toBe(3);
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe('quota_exceeded');
    expect(fourth.state.remainingMessages).toBe(0);
  });

  test('keeps blocking subsequent requests once over the limit', async () => {
    // Regression: an earlier implementation issued findOneAndUpdate with
    // upsert: true for the consume step. Once the user was at the limit
    // the conditional filter no longer matched, Mongo tried to insert a
    // duplicate against the unique userId index and threw E11000, which
    // the outer try/catch swallowed as `reason: 'error', allowed: true` —
    // a fail-open. Verify the 4th, 5th and 6th calls are all denied and
    // the stored quota stays pinned at the limit (no extra increments).
    process.env.REVENUECAT_SECRET_API_KEY = 'secret';
    const userId = new mongoose.Types.ObjectId().toString();
    const req = { user: { id: userId }, body: { text: 'hello world' } };

    await evaluateSubscriptionQuota(req);
    await evaluateSubscriptionQuota(req);
    await evaluateSubscriptionQuota(req);

    for (let i = 0; i < 3; i += 1) {
      const result = await evaluateSubscriptionQuota(req);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('quota_exceeded');
      expect(result.state.usedMessages).toBe(3);
      expect(result.state.remainingMessages).toBe(0);
    }

    expect(profiles.get(userId).quota.usedMessages).toBe(3);
  });

  test('resets free usage when the stored period is stale', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'secret';
    const userId = new mongoose.Types.ObjectId();

    profiles.set(userId.toString(), {
      userId,
      appUserId: userId.toString(),
      entitlementId: 'codecan_ai_pro',
      isPro: false,
      quota: {
        period: '2026-02',
        usedMessages: 3,
        limit: 3,
      },
    });

    const result = await evaluateSubscriptionQuota({
      user: { id: userId.toString() },
      body: { text: 'new month prompt' },
    });

    expect(result.allowed).toBe(true);
    expect(result.state.period).toBe(getCurrentPeriod());
    expect(result.state.usedMessages).toBe(1);
    expect(profiles.get(userId.toString()).quota.usedMessages).toBe(1);
  });

  test('bypasses quota for active pro users without incrementing usage', async () => {
    process.env.REVENUECAT_SECRET_API_KEY = 'secret';
    const userId = new mongoose.Types.ObjectId();

    profiles.set(userId.toString(), {
      userId,
      appUserId: userId.toString(),
      entitlementId: 'codecan_ai_pro',
      isPro: true,
      entitlements: {
        codecan_ai_pro: {
          isActive: true,
        },
      },
      quota: {
        period: getCurrentPeriod(),
        usedMessages: 3,
        limit: 3,
      },
    });

    const result = await evaluateSubscriptionQuota({
      user: { id: userId.toString() },
      body: { text: 'pro prompt' },
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('pro');
    expect(result.state.isPro).toBe(true);
    expect(result.state.usedMessages).toBe(3);
    expect(profiles.get(userId.toString()).quota.usedMessages).toBe(3);
  });
});
