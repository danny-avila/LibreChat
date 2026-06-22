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

let mongoServer: MongoMemoryServer;
let Subscription: mongoose.Model<ISubscription>;
let Quota: mongoose.Model<IQuota>;
let UsageLog: mongoose.Model<IUsageLog>;
let AuditLog: mongoose.Model<IAuditLog>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  Subscription =
    mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', subscriptionSchema);
  Quota = mongoose.models.Quota || mongoose.model<IQuota>('Quota', quotaSchema);
  UsageLog = mongoose.models.UsageLog || mongoose.model<IUsageLog>('UsageLog', usageLogSchema);
  AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
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
