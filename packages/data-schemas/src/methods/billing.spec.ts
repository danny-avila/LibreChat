import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import subscriptionSchema from '~/schema/subscription';
import quotaSchema from '~/schema/quota';
import usageLogSchema from '~/schema/usageLog';
import auditLogSchema from '~/schema/auditLog';
import type { ISubscription } from '~/types/subscription';
import type { IQuota } from '~/types/quota';
import type { IUsageLog } from '~/types/usageLog';
import type { IAuditLog } from '~/types/auditLog';
import { createSubscriptionMethods } from './subscription';
import { createQuotaMethods } from './quota';
import { createUsageLogMethods } from './usageLog';
import { createAuditLogMethods } from './auditLog';

let mongoServer: MongoMemoryServer;
let Subscription: mongoose.Model<ISubscription>;
let Quota: mongoose.Model<IQuota>;
let UsageLog: mongoose.Model<IUsageLog>;
let AuditLog: mongoose.Model<IAuditLog>;

let subscriptionMethods: ReturnType<typeof createSubscriptionMethods>;
let quotaMethods: ReturnType<typeof createQuotaMethods>;
let usageLogMethods: ReturnType<typeof createUsageLogMethods>;
let auditLogMethods: ReturnType<typeof createAuditLogMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  Subscription =
    mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', subscriptionSchema);
  Quota = mongoose.models.Quota || mongoose.model<IQuota>('Quota', quotaSchema);
  UsageLog = mongoose.models.UsageLog || mongoose.model<IUsageLog>('UsageLog', usageLogSchema);
  AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

  subscriptionMethods = createSubscriptionMethods(mongoose);
  quotaMethods = createQuotaMethods(mongoose);
  usageLogMethods = createUsageLogMethods(mongoose);
  auditLogMethods = createAuditLogMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Subscription.ensureIndexes();
  await Quota.ensureIndexes();
  await UsageLog.ensureIndexes();
  await AuditLog.ensureIndexes();
});

describe('billing schemas', () => {
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();

  describe('Subscription', () => {
    test('creates a valid subscription document', async () => {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const sub = await Subscription.create({
        user_id: userId,
        plan_code: 'pro_m',
        status: 'active',
        source: 'admin',
        current_period_start: now,
        current_period_end: end,
        external_ref: null,
        granted_by: adminId,
        metadata: {},
      });
      expect(sub._id).toBeDefined();
      expect(sub.plan_code).toBe('pro_m');
      expect(sub.status).toBe('active');
      expect(sub.source).toBe('admin');
    });

    test('rejects missing user_id', async () => {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await expect(
        Subscription.create({
          plan_code: 'free',
          status: 'active',
          source: 'system_default',
          current_period_start: now,
          current_period_end: end,
        }),
      ).rejects.toThrow();
    });

    test('rejects invalid plan_code', async () => {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await expect(
        Subscription.create({
          user_id: userId,
          plan_code: 'invalid_plan',
          status: 'active',
          source: 'admin',
          current_period_start: now,
          current_period_end: end,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Quota', () => {
    test('creates a valid quota document', async () => {
      const periodStart = new Date('2026-06-01T00:00:00Z');
      const quota = await Quota.create({
        user_id: userId,
        period_start: periodStart,
        messages_used: 0,
      });
      expect(quota._id).toBeDefined();
      expect(quota.messages_used).toBe(0);
      expect(quota.period_start.toISOString()).toBe(periodStart.toISOString());
    });

    test('rejects missing user_id', async () => {
      await expect(
        Quota.create({
          period_start: new Date(),
          messages_used: 0,
        }),
      ).rejects.toThrow();
    });

    test('rejects duplicate {user_id, period_start} (unique index)', async () => {
      const periodStart = new Date('2026-06-01T00:00:00Z');
      await Quota.create({ user_id: userId, period_start: periodStart, messages_used: 0 });
      await expect(
        Quota.create({ user_id: userId, period_start: periodStart, messages_used: 5 }),
      ).rejects.toThrow();
    });
  });

  describe('UsageLog', () => {
    test('creates a valid usage log document', async () => {
      const day = new Date('2026-06-22T00:00:00Z');
      const log = await UsageLog.create({
        user_id: userId,
        model_id: 'gpt-4o',
        day,
        prompt_tokens: 100,
        completion_tokens: 50,
        call_count: 1,
        estimated_cost_cents: 2,
      });
      expect(log._id).toBeDefined();
      expect(log.model_id).toBe('gpt-4o');
      expect(log.call_count).toBe(1);
    });

    test('rejects missing user_id', async () => {
      await expect(
        UsageLog.create({
          model_id: 'gpt-4o',
          day: new Date(),
          prompt_tokens: 100,
          completion_tokens: 50,
          call_count: 1,
          estimated_cost_cents: 2,
        }),
      ).rejects.toThrow();
    });

    test('rejects duplicate {user_id, model_id, day} (unique index)', async () => {
      const day = new Date('2026-06-22T00:00:00Z');
      await UsageLog.create({
        user_id: userId,
        model_id: 'gpt-4o',
        day,
        prompt_tokens: 100,
        completion_tokens: 50,
        call_count: 1,
        estimated_cost_cents: 2,
      });
      await expect(
        UsageLog.create({
          user_id: userId,
          model_id: 'gpt-4o',
          day,
          prompt_tokens: 200,
          completion_tokens: 100,
          call_count: 2,
          estimated_cost_cents: 4,
        }),
      ).rejects.toThrow();
    });
  });

  describe('AuditLog', () => {
    test('creates a valid audit log document', async () => {
      const log = await AuditLog.create({
        actor_id: adminId,
        action: 'plan.grant',
        target_user_id: targetUserId,
        payload: { plan_code: 'pro_m', days: 30 },
      });
      expect(log._id).toBeDefined();
      expect(log.action).toBe('plan.grant');
      expect(log.actor_id.toString()).toBe(adminId.toString());
    });

    test('rejects missing actor_id', async () => {
      await expect(
        AuditLog.create({
          action: 'plan.grant',
          target_user_id: targetUserId,
          payload: {},
        }),
      ).rejects.toThrow();
    });

    test('rejects missing action', async () => {
      await expect(
        AuditLog.create({
          actor_id: adminId,
          target_user_id: targetUserId,
          payload: {},
        }),
      ).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Methods tests
// ---------------------------------------------------------------------------

describe('billing methods', () => {
  const userId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const targetUserId = new mongoose.Types.ObjectId();

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  describe('SubscriptionMethods', () => {
    test('getActiveSubscriptionRecord returns newest non-expired active sub', async () => {
      const older = new Date(now.getTime() - 1000);
      const newer = new Date(now.getTime() + 1000);

      await Subscription.create({
        user_id: userId,
        plan_code: 'pro_m',
        status: 'active',
        source: 'admin',
        current_period_start: periodStart,
        current_period_end: older, // already expired
        external_ref: null,
        granted_by: adminId,
        metadata: {},
      });
      const activeSub = await Subscription.create({
        user_id: userId,
        plan_code: 'trial',
        status: 'admin_granted',
        source: 'admin',
        current_period_start: periodStart,
        current_period_end: newer,
        external_ref: null,
        granted_by: adminId,
        metadata: {},
      });

      const result = await subscriptionMethods.getActiveSubscriptionRecord(userId);
      expect(result).not.toBeNull();
      expect(result!._id.toString()).toBe(activeSub._id.toString());
      expect(result!.plan_code).toBe('trial');
    });

    test('getActiveSubscriptionRecord returns null when no active sub exists', async () => {
      const otherId = new mongoose.Types.ObjectId();
      const result = await subscriptionMethods.getActiveSubscriptionRecord(otherId);
      expect(result).toBeNull();
    });

    test('expireActiveSubscriptions flips active→expired', async () => {
      const uid = new mongoose.Types.ObjectId();
      await Subscription.create({
        user_id: uid,
        plan_code: 'pro_m',
        status: 'active',
        source: 'admin',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        external_ref: null,
        granted_by: null,
        metadata: {},
      });
      await Subscription.create({
        user_id: uid,
        plan_code: 'trial',
        status: 'trialing',
        source: 'admin',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        external_ref: null,
        granted_by: null,
        metadata: {},
      });

      const modified = await subscriptionMethods.expireActiveSubscriptions(uid);
      expect(modified).toBe(2);

      const remaining = await Subscription.find({ user_id: uid, status: { $in: ['active', 'trialing', 'admin_granted'] } });
      expect(remaining).toHaveLength(0);
    });

    test('createSubscription persists a new record', async () => {
      const uid = new mongoose.Types.ObjectId();
      const result = await subscriptionMethods.createSubscription({
        userId: uid,
        planCode: 'pro_m',
        status: 'active',
        source: 'admin',
        periodStart,
        periodEnd,
        grantedBy: adminId,
        metadata: { note: 'test' },
      });

      expect(result._id).toBeDefined();
      expect(result.plan_code).toBe('pro_m');
      expect(result.status).toBe('active');

      const inDb = await Subscription.findById(result._id).lean();
      expect(inDb).not.toBeNull();
    });
  });

  describe('QuotaMethods', () => {
    test('incrementQuota allows up to limit, then returns null', async () => {
      const uid = new mongoose.Types.ObjectId();
      const limit = 3;
      const ps = new Date('2026-06-01T00:00:00Z');

      for (let i = 0; i < limit; i++) {
        const doc = await quotaMethods.incrementQuota({ userId: uid, periodStart: ps, limit });
        expect(doc).not.toBeNull();
        expect(doc!.messages_used).toBe(i + 1);
      }

      const over = await quotaMethods.incrementQuota({ userId: uid, periodStart: ps, limit });
      expect(over).toBeNull();
    });

    test('resetQuota sets messages_used to 0', async () => {
      const uid = new mongoose.Types.ObjectId();
      const ps = new Date('2026-06-01T00:00:00Z');
      await quotaMethods.createQuota({ userId: uid, periodStart: ps });

      await Quota.updateOne({ user_id: uid, period_start: ps }, { $set: { messages_used: 5 } });
      const reset = await quotaMethods.resetQuota({ userId: uid, periodStart: ps });
      expect(reset).not.toBeNull();
      expect(reset!.messages_used).toBe(0);
    });

    /**
     * Concurrency / race test (spec §10.2):
     * Fire 20 parallel incrementQuota calls with limit=10.
     * Exactly 10 should succeed (non-null); 10 should return null.
     * This proves the atomic filter prevents quota overrun.
     */
    test('concurrent incrementQuota: exactly limit succeed (race test)', async () => {
      const TOTAL = 20;
      const LIMIT = 10;
      const uid = new mongoose.Types.ObjectId();
      const ps = new Date('2026-07-01T00:00:00Z');

      const results = await Promise.all(
        Array.from({ length: TOTAL }, () =>
          quotaMethods.incrementQuota({ userId: uid, periodStart: ps, limit: LIMIT }),
        ),
      );

      const successes = results.filter((r) => r !== null).length;
      const failures = results.filter((r) => r === null).length;

      expect(successes).toBe(LIMIT);
      expect(failures).toBe(TOTAL - LIMIT);
    }, 15000);
  });

  describe('UsageLogMethods', () => {
    test('recordUsage upserts and accumulates tokens/cost', async () => {
      const uid = new mongoose.Types.ObjectId();

      await usageLogMethods.recordUsage({
        userId: uid,
        modelId: 'gpt-4o',
        promptTokens: 100,
        completionTokens: 50,
        costCents: 2,
      });
      await usageLogMethods.recordUsage({
        userId: uid,
        modelId: 'gpt-4o',
        promptTokens: 200,
        completionTokens: 100,
        costCents: 4,
      });

      // Should be a single doc with accumulated values
      const docs = await UsageLog.find({ user_id: uid, model_id: 'gpt-4o' }).lean();
      expect(docs).toHaveLength(1);
      expect(docs[0].prompt_tokens).toBe(300);
      expect(docs[0].completion_tokens).toBe(150);
      expect(docs[0].estimated_cost_cents).toBe(6);
      expect(docs[0].call_count).toBe(2);
    });

    test('recordUsage creates separate docs for different models', async () => {
      const uid = new mongoose.Types.ObjectId();

      await usageLogMethods.recordUsage({ userId: uid, modelId: 'gpt-4o', promptTokens: 10, completionTokens: 5, costCents: 1 });
      await usageLogMethods.recordUsage({ userId: uid, modelId: 'claude-3-5-sonnet', promptTokens: 20, completionTokens: 10, costCents: 2 });

      const docs = await UsageLog.find({ user_id: uid }).lean();
      expect(docs).toHaveLength(2);
    });
  });

  describe('AuditLogMethods', () => {
    test('writeAuditLog persists a record', async () => {
      const result = await auditLogMethods.writeAuditLog({
        actorId: adminId,
        action: 'plan.grant',
        targetUserId,
        payload: { plan_code: 'pro_m', days: 30 },
      });

      expect(result._id).toBeDefined();
      expect(result.action).toBe('plan.grant');

      const inDb = await AuditLog.findById(result._id).lean();
      expect(inDb).not.toBeNull();
      expect(inDb!.action).toBe('plan.grant');
    });

    test('writeAuditLog stores payload correctly', async () => {
      const payload = { plan_code: 'trial', days: 7, reason: 'onboarding' };
      const result = await auditLogMethods.writeAuditLog({
        actorId: adminId,
        action: 'plan.trial',
        targetUserId,
        payload,
      });

      const inDb = await AuditLog.findById(result._id).lean();
      expect(inDb!.payload).toMatchObject(payload);
    });
  });
});
