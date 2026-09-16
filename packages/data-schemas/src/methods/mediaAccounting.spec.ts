import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mediaSubmissionRequestSchema } from 'librechat-data-provider';
import type { MediaAccountingStep, MediaAccountingMethods } from '~/types/mediaAccounting';
import type { MediaOwnerScope, MediaMethods } from '~/types/media';
import type { IBalance } from '~/types/balance';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createMediaSettlementModel } from '~/models/mediaSettlement';
import { createMediaAccountingMethods } from './mediaAccounting';
import { createTransactionModel } from '~/models/transaction';
import { createTransactionMethods } from './transaction';
import { createBalanceModel } from '~/models/balance';
import { createMediaMethods } from './media';

describe('media accounting on standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let scope: MediaOwnerScope;
  let media: MediaMethods;
  let accounting: MediaAccountingMethods;
  let ordinary: ReturnType<typeof createTransactionMethods>;
  const policy = { maxHoldsPerUser: 4, maxAttempts: 30 };
  const now = '2026-09-16T00:00:00.000Z';
  const reviewAt = '2026-09-17T00:00:00.000Z';

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    media = createMediaMethods(mongoose);
    createBalanceModel(mongoose);
    createTransactionModel(mongoose);
    createMediaSettlementModel(mongoose);
    accounting = createMediaAccountingMethods(mongoose);
    await media.ensureMediaIndexes();
    await accounting.ensureMediaAccountingIndexes();
    ordinary = createTransactionMethods(mongoose, {
      getMultiplier: () => 1,
      getCacheMultiplier: () => 1,
    });
  }, 60_000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
    accounting = createMediaAccountingMethods(mongoose);
    await mongoose.models.Balance.create({ user: scope.ownerId, tokenCredits: 1_000 });
  });

  async function job(
    key = 'request-1',
    executionOwner: 'media' | 'chat' = 'media',
  ): Promise<string> {
    const request = mediaSubmissionRequestSchema.parse({
      clientRequestId: key,
      operation: 'image.generate',
      prompt: 'An observatory',
      selection: { connectionId: 'images', modelId: 'model-a', catalogVersion: 'v1' },
    });
    const receipt = await media.stageMediaSubmission({
      scope,
      request,
      maxActiveJobs: 20,
      maxPendingTotal: 100,
      executionOwner,
      execution: { ...request.selection, api: 'openrouter.images', bindingRevision: 'binding' },
    });
    await media.publishMediaSubmission(scope, receipt.jobId, {
      maxRetainers: 4,
      maxTitleChars: 20,
    });
    return receipt.jobId;
  }
  const hold = (jobId: string, maxCredits = 400) => ({
    scope,
    jobId,
    estimatedCredits: maxCredits,
    maxCredits,
    policy,
    now,
    reviewAt,
  });
  const settle = (jobId: string, credits = 250) => ({
    scope,
    jobId,
    policy,
    effect: { kind: 'charge' as const, credits, costUSD: 0.25 },
  });
  const balance = () =>
    mongoose.models.Balance.findOne({ user: scope.ownerId })
      .select(
        '+reservedCredits +mediaHolds +mediaDebtCredits +mediaPendingSettlement +mediaSettlementSequence',
      )
      .lean<IBalance>();

  it.each<MediaAccountingStep>(['pinned', 'held'])(
    'recovers an unacknowledged hold after %s',
    async (step) => {
      const jobId = await job();
      let failed = false;
      const crashing = createMediaAccountingMethods(mongoose, {
        afterStep: async (current) => {
          if (current === step && !failed) {
            failed = true;
            throw new Error('crash');
          }
        },
      });
      await expect(crashing.acquireMediaHold(hold(jobId))).rejects.toThrow('crash');
      expect((await accounting.acquireMediaHold(hold(jobId))).status).toBe('held');
      expect((await balance())?.reservedCredits).toBe(400);
      expect((await balance())?.mediaHolds).toHaveLength(1);
    },
  );

  it.each<MediaAccountingStep>([
    'effect',
    'allocated',
    'assigned',
    'applied',
    'projected',
    'ledger',
    'published',
    'cleared',
  ])('settles once across a crash after %s', async (step) => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    let failed = false;
    const crashing = createMediaAccountingMethods(mongoose, {
      afterStep: async (current) => {
        if (current === step && !failed) {
          failed = true;
          throw new Error('crash');
        }
      },
    });
    await expect(crashing.settleMediaJob(settle(jobId))).rejects.toThrow('crash');
    expect((await accounting.settleMediaJob(settle(jobId))).status).toBe('settled');
    await accounting.settleMediaJob(settle(jobId));
    const stored = await balance();
    expect(stored?.tokenCredits).toBe(750);
    expect(stored?.reservedCredits).toBe(0);
    expect(stored?.mediaHolds).toEqual([]);
    expect(stored?.mediaPendingSettlement).toBeUndefined();
    expect(await mongoose.models.Transaction.countDocuments({ mediaJobId: jobId })).toBe(1);
    expect((await accounting.acquireMediaHold(hold(jobId))).status).toBe('settled');
    expect((await balance())?.reservedCredits).toBe(0);
  });

  it('serializes concurrent settlements and rejects a changed effect', async () => {
    const first = await job('first');
    const second = await job('second');
    await Promise.all([
      accounting.acquireMediaHold(hold(first)),
      accounting.acquireMediaHold(hold(second)),
    ]);
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createMediaAccountingMethods(mongoose).settleMediaJob(settle(index % 2 ? first : second)),
      ),
    );
    await accounting.reconcileMediaAccounting({ scope, limit: 10, policy });
    expect((await balance())?.tokenCredits).toBe(500);
    expect(await mongoose.models.Transaction.countDocuments()).toBe(2);
    await expect(accounting.settleMediaJob(settle(first, 251))).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('bounds media capacity and preserves holds past ordinary reservation expiry', async () => {
    const first = await job('first');
    const second = await job('second');
    await accounting.acquireMediaHold(hold(first, 800));
    expect((await accounting.acquireMediaHold(hold(second, 300))).status).toBe('insufficient');
    await mongoose.models.Balance.updateOne(
      { user: scope.ownerId },
      {
        $push: {
          reservations: {
            id: 'expired',
            amount: 100,
            expiresAt: new Date(0),
          },
        },
        $inc: { reservedCredits: 100 },
      },
    );
    const ordinaryResult = await ordinary.reserveBalance({
      user: scope.ownerId,
      reservationId: 'chat',
      amount: 201,
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(ordinaryResult).toEqual({ reserved: false, balance: 200 });
    expect(
      (await ordinary.findBalanceByUser(scope.ownerId, { includeReservedCredits: true }))
        ?.reservedCredits,
    ).toBe(800);
    expect((await balance())?.mediaHolds).toHaveLength(1);
  });

  it('records excess paid cost as debt and keeps refill/admission honest', async () => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    await accounting.settleMediaJob(settle(jobId, 1_050));
    expect(await balance()).toMatchObject({ tokenCredits: 0, mediaDebtCredits: 50 });
    await ordinary.updateBalance({ user: scope.ownerId, incrementValue: 60 });
    expect(
      await ordinary.reserveBalance({
        user: scope.ownerId,
        reservationId: 'chat',
        amount: 11,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).toEqual({ reserved: false, balance: 10 });
    expect((await ordinary.deleteBalances({ user: scope.ownerId })).deletedCount).toBe(0);
  });

  it('releases only a certain no-charge result and never charges native chat again', async () => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    await accounting.releaseMediaHold({ scope, jobId, policy, certainNoCharge: true });
    expect(await balance()).toMatchObject({ tokenCredits: 1_000, reservedCredits: 0 });
    const chatJob = await job('chat', 'chat');
    await expect(accounting.acquireMediaHold(hold(chatJob))).rejects.toMatchObject({
      code: 'invalid_job',
    });
    await expect(
      accounting.acquireMediaHold({
        ...hold(jobId),
        scope: { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
      }),
    ).rejects.toMatchObject({ code: 'invalid_job' });
  });

  it('collects debt from refilled credits through the recoverable settlement slot', async () => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    await accounting.settleMediaJob(settle(jobId, 1_050));
    await ordinary.updateBalance({ user: scope.ownerId, incrementValue: 60 });
    let failed = false;
    const crashing = createMediaAccountingMethods(mongoose, {
      afterStep: async (step) => {
        if (step === 'applied' && !failed) {
          failed = true;
          throw new Error('crash');
        }
      },
    });
    await expect(crashing.reconcileMediaAccounting({ scope, limit: 10, policy })).rejects.toThrow(
      'crash',
    );
    await accounting.reconcileMediaAccounting({ scope, limit: 10, policy });
    await accounting.reconcileMediaAccounting({ scope, limit: 10, policy });
    expect(await balance()).toMatchObject({
      tokenCredits: 10,
      mediaDebtCredits: 0,
      reservedCredits: 0,
    });
    expect(await mongoose.models.Transaction.countDocuments({ context: 'media_debt' })).toBe(1);
  });

  it('pins the original balance and protects pending liabilities from deletion', async () => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    expect((await ordinary.deleteBalances({ user: scope.ownerId })).deletedCount).toBe(0);
    const pinned = await balance();
    await mongoose.models.Balance.create({
      _id: new mongoose.Types.ObjectId('000000000000000000000001'),
      user: scope.ownerId,
      tokenCredits: 5_000,
    });
    await accounting.settleMediaJob(settle(jobId));
    expect(
      (await mongoose.models.Balance.findById(pinned?._id).lean<IBalance>())?.tokenCredits,
    ).toBe(750);
    expect(
      (await mongoose.models.Balance.findById('000000000000000000000001').lean<IBalance>())
        ?.tokenCredits,
    ).toBe(5_000);
  });

  it('records transaction-only usage once without debiting or inventing a cost', async () => {
    const jobId = await job();
    await accounting.recordMediaUsage({ scope, jobId, inputTokens: 20, outputTokens: 30 });
    await accounting.recordMediaUsage({ scope, jobId, inputTokens: 20, outputTokens: 30 });
    expect((await balance())?.tokenCredits).toBe(1_000);
    expect(await mongoose.models.MediaSettlement.countDocuments()).toBe(0);
    expect(await mongoose.models.Transaction.countDocuments()).toBe(1);
    const transaction = await mongoose.models.Transaction.findOne({ mediaJobId: jobId }).lean<{
      tokenValue?: number;
      mediaCostUSD?: number;
    }>();
    expect(transaction?.tokenValue).toBeUndefined();
    expect(transaction?.mediaCostUSD).toBeUndefined();
    await expect(accounting.recordMediaUsage({ scope, jobId, costUSD: 1 })).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('rejects a scope that differs from the active tenant context', async () => {
    const jobId = await job();
    await expect(
      tenantStorage.run({ tenantId: 'other-tenant' }, () =>
        accounting.acquireMediaHold(hold(jobId)),
      ),
    ).rejects.toMatchObject({ code: 'invalid_job' });
  });

  it('discovers debt and unacknowledged holds without retired threads or expiring assets', async () => {
    const heldJob = await job();
    await accounting.acquireMediaHold(hold(heldJob));
    expect(await accounting.hasMediaAccountingObligations(scope)).toBe(true);
    const later = { ownerId: 'fffffffffffffffffffffffe', tenantId: 'tenant-b' };
    await mongoose.models.Balance.create({
      user: later.ownerId,
      tenantId: later.tenantId,
      tokenCredits: 100,
      mediaDebtCredits: 10,
    });
    await expect(accounting.listMediaAccountingScopes({ limit: 1 })).rejects.toMatchObject({
      code: 'invalid_job',
    });
    const first = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, () =>
      accounting.listMediaAccountingScopes({ limit: 1 }),
    );
    expect(first.items).toEqual([scope]);
    expect(first.nextCursor).toBeDefined();
    const next = await tenantStorage.run({ tenantId: SYSTEM_TENANT_ID }, () =>
      accounting.listMediaAccountingScopes({ limit: 1, cursor: first.nextCursor }),
    );
    expect(next.items).toEqual([later]);
    expect(next.nextCursor).toBeUndefined();
  });

  it('releases a durable hold when a queued job is cancelled before dispatch', async () => {
    const jobId = await job();
    await accounting.acquireMediaHold(hold(jobId));
    await media.cancelMediaJob(scope, jobId);
    await accounting.reconcileMediaAccounting({ scope, limit: 20, policy });
    expect((await balance())?.tokenCredits).toBe(1_000);
    expect((await balance())?.reservedCredits).toBe(0);
    expect(await accounting.hasMediaAccountingObligations(scope)).toBe(false);
  });

  it('collects debt from its pinned legacy balance and refuses premature accounting erasure', async () => {
    const jobId = await job();
    const pinned = await balance();
    await accounting.acquireMediaHold(hold(jobId));
    await accounting.settleMediaJob(settle(jobId, 1_200));
    await expect(accounting.deleteMediaAccountingHistory(scope)).rejects.toMatchObject({
      code: 'invariant',
    });
    await mongoose.models.Balance.create({
      _id: '000000000000000000000001',
      user: scope.ownerId,
      tokenCredits: 5_000,
    });
    await mongoose.models.Balance.updateOne({ _id: pinned?._id }, { $set: { tokenCredits: 200 } });
    await accounting.reconcileMediaAccounting({ scope, limit: 20, policy });
    const debtBalance = await mongoose.models.Balance.findById(pinned?._id)
      .select('+mediaDebtCredits')
      .lean<IBalance>();
    expect(debtBalance?.tokenCredits).toBe(0);
    expect(debtBalance?.mediaDebtCredits).toBe(0);
    expect(
      (await mongoose.models.Balance.findById('000000000000000000000001').lean<IBalance>())
        ?.tokenCredits,
    ).toBe(5_000);
    await accounting.deleteMediaAccountingHistory(scope);
    expect(await mongoose.models.MediaSettlement.countDocuments()).toBe(0);
  });
});
