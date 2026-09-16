import { createHash } from 'node:crypto';
import type { Model, FilterQuery, UpdateQuery } from 'mongoose';
import type {
  AcquireMediaHoldInput,
  MediaAccountingHooks,
  MediaAccountingMethods,
  MediaAccountingPolicy,
  MediaAppliedSettlement,
  MediaHoldResult,
  MediaSettlementEffect,
  MediaSettlementRecord,
  MediaSettlementResult,
  SettleMediaJobInput,
  RecordMediaUsageInput,
} from '~/types/mediaAccounting';
import type { MediaOwnerScope, MediaStoredJob, MediaPage } from '~/types/media';
import type { IBalance } from '~/types/balance';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';

export class MediaAccountingError extends Error {
  constructor(
    public readonly code:
      | 'conflict'
      | 'missing_balance'
      | 'invalid_job'
      | 'invalid_amount'
      | 'invariant',
    message: string,
  ) {
    super(message);
    this.name = 'MediaAccountingError';
  }
}

const balanceSelection =
  '+mediaHolds +mediaDebtCredits +mediaSettlementSequence +mediaPendingSettlement +reservedCredits';
const durable = { w: 'majority' as const, j: true };
const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
const identity = (scope: MediaOwnerScope, jobId: string): string =>
  digest(JSON.stringify([scope.tenantId, scope.ownerId, jobId]));
const finiteCredits = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

export function createMediaAccountingMethods(
  mongoose: typeof import('mongoose'),
  hooks: MediaAccountingHooks = {},
): MediaAccountingMethods {
  const settlements = (): Model<MediaSettlementRecord> =>
    mongoose.models.MediaSettlement as Model<MediaSettlementRecord>;
  const balances = (): Model<IBalance> => mongoose.models.Balance as Model<IBalance>;
  const writeBalance = (filter: FilterQuery<IBalance>, update: UpdateQuery<IBalance>) =>
    balances().updateOne(filter, update, { writeConcern: durable });
  const jobs = (): Model<MediaStoredJob> => mongoose.models.MediaJob as Model<MediaStoredJob>;
  const scopeFilter = (scope: MediaOwnerScope): MediaOwnerScope => {
    const context = tenantStorage.getStore()?.tenantId;
    if (
      !scope.ownerId ||
      scope.tenantId === SYSTEM_TENANT_ID ||
      (context && context !== SYSTEM_TENANT_ID && context !== scope.tenantId)
    ) {
      throw new MediaAccountingError(
        'invalid_job',
        'Media accounting scope does not match tenant context',
      );
    }
    return { tenantId: scope.tenantId ?? null, ownerId: scope.ownerId };
  };
  const balanceFilter = (scope: MediaOwnerScope) => {
    const checked = scopeFilter(scope);
    return { tenantId: checked.tenantId, user: checked.ownerId };
  };
  const getRecord = (scope: MediaOwnerScope, settlementId: string) =>
    settlements()
      .findOne({ ...scopeFilter(scope), settlementId })
      .lean<MediaSettlementRecord>();
  const getBalance = (scope: MediaOwnerScope, balanceId: string) =>
    balances()
      .findOne({ ...balanceFilter(scope), _id: balanceId })
      .select(balanceSelection)
      .lean<IBalance>();

  function validatePolicy(policy: MediaAccountingPolicy): void {
    if (
      !Number.isSafeInteger(policy.maxAttempts) ||
      policy.maxAttempts < 1 ||
      !Number.isSafeInteger(policy.maxHoldsPerUser) ||
      policy.maxHoldsPerUser < 1
    ) {
      throw new MediaAccountingError('invariant', 'Invalid accounting policy');
    }
  }

  async function ensureMediaAccountingIndexes(): Promise<void> {
    await settlements().createIndexes();
    const indexes = await settlements().listIndexes();
    for (const keys of [
      ['tenantId', 'ownerId', 'jobId'],
      ['settlementId'],
      ['balanceId', 'sequence'],
    ]) {
      if (
        !indexes.some(
          (index) => index.unique && Object.keys(index.key).join(',') === keys.join(','),
        )
      ) {
        throw new MediaAccountingError('invariant', 'Required media settlement index is missing');
      }
    }
  }

  async function hasMediaAccountingObligations(scope: MediaOwnerScope): Promise<boolean> {
    const [balance, unsettled] = await Promise.all([
      balances().exists({
        ...balanceFilter(scope),
        $or: [
          { 'mediaHolds.0': { $exists: true } },
          { mediaDebtCredits: { $gt: 0 } },
          { mediaPendingSettlement: { $ne: null } },
        ],
      }),
      settlements().exists({ ...scopeFilter(scope), balanceAcknowledged: false }),
    ]);
    return !!balance || !!unsettled;
  }

  async function deleteMediaAccountingHistory(scope: MediaOwnerScope): Promise<void> {
    if (await hasMediaAccountingObligations(scope)) {
      throw new MediaAccountingError(
        'invariant',
        'Outstanding media accounting prevents history deletion',
      );
    }
    await settlements().deleteMany(
      { ...scopeFilter(scope), balanceAcknowledged: true },
      { writeConcern: durable },
    );
  }

  async function listMediaAccountingScopes({
    limit,
    cursor,
  }: {
    limit: number;
    cursor?: string;
  }): Promise<MediaPage<MediaOwnerScope>> {
    if (
      tenantStorage.getStore()?.tenantId !== SYSTEM_TENANT_ID ||
      !Number.isSafeInteger(limit) ||
      limit < 1
    ) {
      throw new MediaAccountingError(
        'invalid_job',
        'System context and a positive limit are required',
      );
    }
    let after: string[] | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (
          !Array.isArray(decoded) ||
          decoded.length !== 2 ||
          !decoded.every((item) => typeof item === 'string') ||
          !mongoose.Types.ObjectId.isValid(decoded[0])
        ) {
          throw new Error('Invalid cursor');
        }
        after = decoded;
      } catch {
        throw new MediaAccountingError('invalid_job', 'Invalid accounting cursor');
      }
    }
    const tenantAfter = after ? { $expr: { $gt: [{ $ifNull: ['$tenantId', ''] }, after[1]] } } : {};
    const settlementAfter = after
      ? { $or: [{ ownerId: { $gt: after[0] } }, { ownerId: after[0], ...tenantAfter }] }
      : {};
    const balanceAfter = after
      ? {
          $or: [
            { user: { $gt: new mongoose.Types.ObjectId(after[0]) } },
            { user: after[0], ...tenantAfter },
          ],
        }
      : {};
    const [pending, debt] = await Promise.all([
      settlements()
        .find({ balanceAcknowledged: false, ...settlementAfter })
        .select('ownerId tenantId')
        .sort({ ownerId: 1, tenantId: 1 })
        .limit(limit + 1)
        .lean<MediaOwnerScope[]>(),
      balances()
        .find({
          $and: [
            balanceAfter,
            {
              $or: [
                { mediaDebtCredits: { $gt: 0 } },
                { mediaPendingSettlement: { $ne: null } },
                { 'mediaHolds.0': { $exists: true } },
              ],
            },
          ],
        })
        .select('user tenantId')
        .sort({ user: 1, tenantId: 1 })
        .limit(limit + 1)
        .lean<IBalance[]>(),
    ]);
    const combined = [
      ...pending,
      ...debt.map((row) => ({ ownerId: String(row.user), tenantId: row.tenantId ?? null })),
    ];
    const rows = [
      ...new Map(
        combined.map((scope) => [JSON.stringify([scope.ownerId, scope.tenantId ?? null]), scope]),
      ).values(),
    ].sort(
      (a, b) =>
        a.ownerId.localeCompare(b.ownerId) || (a.tenantId ?? '').localeCompare(b.tenantId ?? ''),
    );
    const items = rows
      .slice(0, limit)
      .map((scope) => ({ ownerId: scope.ownerId, tenantId: scope.tenantId ?? null }));
    const last = items[items.length - 1];
    const hasMore = rows.length > limit || pending.length > limit || debt.length > limit;
    return {
      items,
      ...(hasMore && last
        ? {
            nextCursor: Buffer.from(JSON.stringify([last.ownerId, last.tenantId ?? ''])).toString(
              'base64url',
            ),
          }
        : {}),
    };
  }

  async function acquireMediaHold(input: AcquireMediaHoldInput): Promise<MediaHoldResult> {
    const { scope, jobId, policy, now, reviewAt } = input;
    validatePolicy(policy);
    if (
      !finiteCredits(input.estimatedCredits) ||
      !finiteCredits(input.maxCredits) ||
      input.maxCredits < input.estimatedCredits ||
      input.maxCredits <= 0 ||
      !Number.isFinite(Date.parse(now)) ||
      !Number.isFinite(Date.parse(reviewAt))
    ) {
      throw new MediaAccountingError('invalid_amount', 'Invalid media hold amount or review time');
    }
    const job = await jobs()
      .findOne({ ...scopeFilter(scope), jobId, executionOwner: 'media' })
      .lean<MediaStoredJob>();
    if (!job || job.receipt.phase !== 'accepted') {
      throw new MediaAccountingError(
        'invalid_job',
        'Only accepted media-owned jobs may reserve credits',
      );
    }
    const settlementId = identity(scope, jobId);
    const estimatedCredits = Math.ceil(input.estimatedCredits);
    const maxCredits = Math.ceil(input.maxCredits);
    const fingerprint = digest(JSON.stringify([estimatedCredits, maxCredits]));
    let record = await getRecord(scope, settlementId);
    if (!record) {
      if (job.provider.certainty !== 'unsubmitted') {
        throw new MediaAccountingError(
          'invalid_job',
          'A credit hold must precede provider submission',
        );
      }
      const balance = await balances()
        .findOne(balanceFilter(scope))
        .sort({ _id: 1 })
        .lean<IBalance>();
      if (!balance) return { status: 'unavailable', settlementId };
      try {
        await settlements().updateOne(
          { ...scopeFilter(scope), settlementId },
          {
            $setOnInsert: {
              ...scopeFilter(scope),
              settlementId,
              jobId,
              balanceId: String(balance._id),
              estimatedCredits,
              maxCredits,
              holdFingerprint: fingerprint,
              createdAt: now,
              reviewAt,
              state: 'holding',
              balanceAcknowledged: false,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
      }
      await hooks.afterStep?.('pinned');
      record = await getRecord(scope, settlementId);
    }
    if (!record || record.holdFingerprint !== fingerprint) {
      throw new MediaAccountingError('conflict', 'This job already has a different credit hold');
    }
    for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
      const balance = await getBalance(scope, record.balanceId);
      if (!balance)
        throw new MediaAccountingError('missing_balance', 'The pinned media balance is missing');
      const latest = await getRecord(scope, settlementId);
      if (!latest) throw new MediaAccountingError('invariant', 'Media hold receipt is missing');
      if (latest.effect) return { status: 'settled', settlementId };
      const existing = balance.mediaHolds?.find((hold) => hold.settlementId === settlementId);
      if (existing) {
        if (existing.amount !== maxCredits)
          throw new MediaAccountingError('conflict', 'Credit hold amount changed');
        return { status: 'held', settlementId };
      }
      if (balance.mediaPendingSettlement) {
        await reconcileSettlement(scope, balance.mediaPendingSettlement.settlementId, policy);
        continue;
      }
      const availableCredits =
        (balance.tokenCredits ?? 0) -
        (balance.reservedCredits ?? 0) -
        (balance.mediaDebtCredits ?? 0);
      if (
        availableCredits < maxCredits ||
        (balance.mediaHolds?.length ?? 0) >= policy.maxHoldsPerUser
      ) {
        return { status: 'insufficient', settlementId, availableCredits };
      }
      const result = await writeBalance(
        {
          ...balanceFilter(scope),
          _id: record.balanceId,
          tokenCredits: balance.tokenCredits ?? null,
          reservedCredits: balance.reservedCredits ?? null,
          mediaDebtCredits: balance.mediaDebtCredits ?? null,
          mediaSettlementSequence: balance.mediaSettlementSequence ?? null,
          mediaPendingSettlement: null,
          'mediaHolds.settlementId': { $ne: settlementId },
          $expr: { $lt: [{ $size: { $ifNull: ['$mediaHolds', []] } }, policy.maxHoldsPerUser] },
        },
        {
          $push: { mediaHolds: { settlementId, jobId, amount: maxCredits, reviewAt } },
          $inc: { reservedCredits: maxCredits },
        },
      );
      if (result.modifiedCount !== 1) continue;
      await hooks.afterStep?.('held');
      await settlements().updateOne(
        { ...scopeFilter(scope), settlementId, state: 'holding' },
        { $set: { state: 'held' } },
      );
      await jobs().updateOne(
        { ...scopeFilter(scope), jobId },
        { $set: { accounting: { settlementId, phase: 'held' } } },
        { writeConcern: durable },
      );
      return { status: 'held', settlementId, availableCredits: availableCredits - maxCredits };
    }
    return { status: 'busy', settlementId };
  }

  async function reconcileSettlement(
    scope: MediaOwnerScope,
    settlementId: string,
    policy: MediaAccountingPolicy,
  ): Promise<MediaSettlementResult> {
    for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
      const requested = await getRecord(scope, settlementId);
      if (!requested?.effect)
        throw new MediaAccountingError('invariant', 'Settlement effect has not been recorded');
      const balance = await getBalance(scope, requested.balanceId);
      if (!balance)
        throw new MediaAccountingError('missing_balance', 'The pinned media balance is missing');
      if (requested.balanceAcknowledged)
        return { status: 'settled', settlementId, result: requested.result };
      const pending = balance.mediaPendingSettlement;
      if (!pending) {
        if (requested.state === 'published') {
          await settlements().updateOne(
            { ...scopeFilter(scope), settlementId, state: 'published' },
            { $set: { balanceAcknowledged: true } },
          );
          return { status: 'settled', settlementId, result: requested.result };
        }
        const sequence = (balance.mediaSettlementSequence ?? 0) + 1;
        const result = await writeBalance(
          {
            ...balanceFilter(scope),
            _id: requested.balanceId,
            mediaPendingSettlement: null,
            mediaSettlementSequence: balance.mediaSettlementSequence ?? null,
          },
          {
            $set: {
              mediaPendingSettlement: { settlementId, sequence, phase: 'allocated' },
              mediaSettlementSequence: sequence,
            },
          },
        );
        if (result.modifiedCount === 1) await hooks.afterStep?.('allocated');
        continue;
      }
      const active = await getRecord(scope, pending.settlementId);
      if (!active?.effect || active.balanceId !== requested.balanceId) {
        throw new MediaAccountingError(
          'invariant',
          'Pending balance settlement has no matching receipt',
        );
      }
      if (active.sequence === undefined) {
        await settlements().updateOne(
          {
            ...scopeFilter(scope),
            settlementId: active.settlementId,
            sequence: { $exists: false },
          },
          { $set: { sequence: pending.sequence } },
        );
        await hooks.afterStep?.('assigned');
        continue;
      }
      if (active.sequence !== pending.sequence) {
        if (pending.phase !== 'allocated' || active.state !== 'published') {
          throw new MediaAccountingError(
            'invariant',
            'Settlement sequence does not match its balance slot',
          );
        }
        await writeBalance(
          {
            ...balanceFilter(scope),
            _id: active.balanceId,
            'mediaPendingSettlement.settlementId': active.settlementId,
            'mediaPendingSettlement.sequence': pending.sequence,
            'mediaPendingSettlement.phase': 'allocated',
          },
          { $unset: { mediaPendingSettlement: 1 } },
        );
        continue;
      }
      if (pending.phase === 'allocated') {
        const hold = balance.mediaHolds?.find(
          (entry) => entry.settlementId === active.settlementId,
        );
        if (!hold && active.effect.kind === 'charge')
          throw new MediaAccountingError(
            'invariant',
            'A charged media settlement requires its durable hold',
          );
        const credits = Math.max(0, balance.tokenCredits ?? 0);
        const collectingDebt = active.effect.kind === 'debt_collection';
        const debitedCredits = collectingDebt
          ? Math.min(
              active.effect.credits,
              balance.mediaDebtCredits ?? 0,
              Math.max(0, credits - (balance.reservedCredits ?? 0)),
            )
          : Math.min(credits, active.effect.credits);
        const result: MediaAppliedSettlement = {
          debitedCredits,
          debtCredits: collectingDebt ? -debitedCredits : active.effect.credits - debitedCredits,
          releasedCredits: hold?.amount ?? 0,
          remainingCredits: credits - debitedCredits,
        };
        const reservedCredits = (balance.reservedCredits ?? 0) - result.releasedCredits;
        if (reservedCredits < 0)
          throw new MediaAccountingError(
            'invariant',
            'Reserved credits are smaller than the media hold',
          );
        const applied = await writeBalance(
          {
            ...balanceFilter(scope),
            _id: active.balanceId,
            'mediaPendingSettlement.settlementId': active.settlementId,
            'mediaPendingSettlement.sequence': pending.sequence,
            'mediaPendingSettlement.phase': 'allocated',
            tokenCredits: balance.tokenCredits ?? null,
            reservedCredits: balance.reservedCredits ?? null,
            mediaDebtCredits: balance.mediaDebtCredits ?? null,
          },
          {
            $set: {
              tokenCredits: result.remainingCredits,
              reservedCredits,
              mediaDebtCredits: (balance.mediaDebtCredits ?? 0) + result.debtCredits,
              mediaPendingSettlement: { ...pending, phase: 'applied', result },
            },
            $pull: { mediaHolds: { settlementId: active.settlementId } },
          },
        );
        if (applied.modifiedCount === 1) await hooks.afterStep?.('applied');
        continue;
      }
      if (!pending.result)
        throw new MediaAccountingError('invariant', 'Applied settlement result is missing');
      await settlements().updateOne(
        { ...scopeFilter(scope), settlementId: active.settlementId, sequence: pending.sequence },
        {
          $set: { result: pending.result, state: 'applied' },
        },
      );
      await hooks.afterStep?.('projected');
      const transactionId = new mongoose.Types.ObjectId(
        digest(`media:${active.settlementId}`).slice(0, 24),
      );
      await mongoose.models.Transaction.updateOne(
        { _id: transactionId, tenantId: scope.tenantId },
        {
          $setOnInsert: {
            user: scope.ownerId,
            tenantId: scope.tenantId,
            tokenType: 'credits',
            context: active.effect.kind === 'debt_collection' ? 'media_debt' : 'media',
            model: active.effect.model,
            rawAmount:
              active.effect.kind === 'debt_collection'
                ? -pending.result.debitedCredits
                : -active.effect.credits,
            tokenValue: -pending.result.debitedCredits,
            rate: 1,
            mediaSettlementId: active.settlementId,
            mediaJobId: active.effect.kind === 'debt_collection' ? undefined : active.jobId,
            mediaDebtCredits: pending.result.debtCredits,
            mediaCostUSD: active.effect.costUSD,
            mediaFingerprint: active.effectFingerprint,
            mediaAccountingMode: 'balance',
          },
        },
        { upsert: true, writeConcern: durable },
      );
      await hooks.afterStep?.('ledger');
      await jobs().updateOne(
        { ...scopeFilter(scope), jobId: active.jobId },
        {
          $set: {
            accounting: {
              settlementId: active.settlementId,
              phase: 'settled',
              credits: active.effect.credits,
              debtCredits: pending.result.debtCredits,
            },
          },
        },
        { writeConcern: durable },
      );
      await settlements().updateOne(
        { ...scopeFilter(scope), settlementId: active.settlementId, sequence: pending.sequence },
        { $set: { state: 'published' } },
      );
      await hooks.afterStep?.('published');
      await writeBalance(
        {
          ...balanceFilter(scope),
          _id: active.balanceId,
          'mediaPendingSettlement.settlementId': active.settlementId,
          'mediaPendingSettlement.sequence': pending.sequence,
          'mediaPendingSettlement.phase': 'applied',
        },
        { $unset: { mediaPendingSettlement: 1 } },
      );
      await hooks.afterStep?.('cleared');
      await settlements().updateOne(
        { ...scopeFilter(scope), settlementId: active.settlementId, state: 'published' },
        { $set: { balanceAcknowledged: true } },
      );
    }
    const record = await getRecord(scope, settlementId);
    return {
      status: record?.balanceAcknowledged ? 'settled' : 'pending',
      settlementId,
      result: record?.result,
    };
  }

  async function settleMediaJob({
    scope,
    jobId,
    effect,
    policy,
  }: SettleMediaJobInput): Promise<MediaSettlementResult> {
    validatePolicy(policy);
    if (
      !['charge', 'release'].includes(effect.kind) ||
      !finiteCredits(effect.credits) ||
      (effect.kind === 'release' && effect.credits !== 0) ||
      (effect.costUSD !== undefined && !finiteCredits(effect.costUSD)) ||
      (effect.creditsPerUSD !== undefined &&
        (!Number.isFinite(effect.creditsPerUSD) || effect.creditsPerUSD <= 0)) ||
      [effect.inputTokens, effect.outputTokens].some(
        (value) => value !== undefined && !finiteCredits(value),
      )
    ) {
      throw new MediaAccountingError('invalid_amount', 'Invalid media settlement amount');
    }
    const settlementId = identity(scope, jobId);
    const record = await getRecord(scope, settlementId);
    if (!record)
      throw new MediaAccountingError(
        'invariant',
        'Media accounting must pin its balance before submission',
      );
    const normalized: MediaSettlementEffect = {
      kind: effect.kind,
      credits: Math.ceil(effect.credits),
      ...(effect.costUSD !== undefined ? { costUSD: effect.costUSD } : {}),
      ...(effect.creditsPerUSD !== undefined ? { creditsPerUSD: effect.creditsPerUSD } : {}),
      ...(effect.inputTokens !== undefined ? { inputTokens: effect.inputTokens } : {}),
      ...(effect.outputTokens !== undefined ? { outputTokens: effect.outputTokens } : {}),
      ...(effect.model !== undefined ? { model: effect.model } : {}),
    };
    const fingerprint = digest(JSON.stringify(normalized));
    await settlements().updateOne(
      { ...scopeFilter(scope), settlementId, effect: { $exists: false } },
      {
        $set: { effect: normalized, effectFingerprint: fingerprint, state: 'ready' },
      },
    );
    await hooks.afterStep?.('effect');
    const frozen = await getRecord(scope, settlementId);
    if (frozen?.effectFingerprint !== fingerprint)
      throw new MediaAccountingError(
        'conflict',
        'A different media settlement effect is already recorded',
      );
    return reconcileSettlement(scope, settlementId, policy);
  }

  async function releaseMediaHold(
    input: Omit<SettleMediaJobInput, 'effect'> & { certainNoCharge: true },
  ): Promise<MediaSettlementResult> {
    if (input.certainNoCharge !== true)
      throw new MediaAccountingError(
        'invariant',
        'A hold cannot be released for an uncertain charge',
      );
    const settlementId = identity(input.scope, input.jobId);
    if (!(await getRecord(input.scope, settlementId))) return { status: 'settled', settlementId };
    return settleMediaJob({ ...input, effect: { kind: 'release', credits: 0 } });
  }

  async function recordMediaUsage(input: RecordMediaUsageInput): Promise<void> {
    const { scope, jobId } = input;
    const job = await jobs()
      .findOne({ ...scopeFilter(scope), jobId, executionOwner: 'media' })
      .lean<MediaStoredJob>();
    if (!job)
      throw new MediaAccountingError(
        'invalid_job',
        'Only media-owned calls have a media usage ledger',
      );
    for (const value of [input.credits, input.costUSD, input.inputTokens, input.outputTokens]) {
      if (value !== undefined && !finiteCredits(value))
        throw new MediaAccountingError('invalid_amount', 'Invalid media usage value');
    }
    const settlementId = identity(scope, jobId);
    const transactionId = new mongoose.Types.ObjectId(digest(`media:${settlementId}`).slice(0, 24));
    const fields = {
      user: scope.ownerId,
      tenantId: scope.tenantId,
      tokenType: 'credits',
      context: 'media',
      model: input.model,
      rawAmount: input.credits === undefined ? undefined : -input.credits,
      tokenValue: input.credits === undefined ? undefined : -input.credits,
      rate: input.credits === undefined ? undefined : 1,
      inputTokens: input.inputTokens,
      mediaOutputTokens: input.outputTokens,
      mediaSettlementId: settlementId,
      mediaJobId: jobId,
      mediaCostUSD: input.costUSD,
      mediaAccountingMode: 'transactions',
    };
    const fingerprint = digest(JSON.stringify(fields));
    await mongoose.models.Transaction.updateOne(
      { _id: transactionId, tenantId: scope.tenantId },
      {
        $setOnInsert: { ...fields, mediaFingerprint: fingerprint },
      },
      { upsert: true, writeConcern: durable },
    );
    const stored = await mongoose.models.Transaction.findOne({
      _id: transactionId,
      tenantId: scope.tenantId,
    })
      .select('mediaFingerprint')
      .lean<{ mediaFingerprint?: string }>();
    if (stored?.mediaFingerprint !== fingerprint)
      throw new MediaAccountingError(
        'conflict',
        'Media usage was already recorded with different accounting',
      );
    await jobs().updateOne(
      { ...scopeFilter(scope), jobId },
      {
        $set: {
          accounting: {
            settlementId,
            phase: 'settled',
            credits: input.credits,
          },
        },
      },
      { writeConcern: durable },
    );
  }

  async function reconcileMediaAccounting({
    scope,
    limit,
    policy,
  }: {
    scope: MediaOwnerScope;
    limit: number;
    policy: MediaAccountingPolicy;
  }): Promise<number> {
    validatePolicy(policy);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new MediaAccountingError('invariant', 'Invalid reconciliation limit');
    }
    const safeReleases = await settlements().aggregate<{ jobId: string }>([
      { $match: { ...scopeFilter(scope), balanceAcknowledged: false, effect: { $exists: false } } },
      {
        $lookup: {
          // eslint-disable-next-line no-restricted-syntax -- Metadata only; lookup filters owner and tenant.
          from: jobs().collection.name,
          let: { jobId: '$jobId' },
          pipeline: [
            {
              $match: {
                ...scopeFilter(scope),
                executionOwner: 'media',
                phase: { $in: ['failed', 'cancelled'] },
                'provider.certainty': 'unsubmitted',
                $expr: { $eq: ['$jobId', '$$jobId'] },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: 'safeJob',
        },
      },
      { $match: { 'safeJob.0': { $exists: true } } },
      { $sort: { settlementId: 1 } },
      { $limit: limit },
      { $project: { jobId: 1 } },
    ]);
    for (const record of safeReleases) {
      await releaseMediaHold({ scope, jobId: record.jobId, policy, certainNoCharge: true });
    }
    const records = await settlements()
      .find({ ...scopeFilter(scope), balanceAcknowledged: false, effect: { $exists: true } })
      .sort({ settlementId: 1 })
      .limit(limit)
      .lean<MediaSettlementRecord[]>();
    for (const record of records) await reconcileSettlement(scope, record.settlementId, policy);
    const debtBalances = await balances()
      .find({
        ...balanceFilter(scope),
        mediaDebtCredits: { $gt: 0 },
        mediaPendingSettlement: null,
        $expr: {
          $gt: [
            {
              $subtract: [{ $ifNull: ['$tokenCredits', 0] }, { $ifNull: ['$reservedCredits', 0] }],
            },
            0,
          ],
        },
      })
      .sort({ _id: 1 })
      .select(balanceSelection)
      .limit(limit)
      .lean<IBalance[]>();
    for (const balance of debtBalances) {
      const credits = Math.min(
        balance.mediaDebtCredits ?? 0,
        Math.max(0, (balance.tokenCredits ?? 0) - (balance.reservedCredits ?? 0)),
      );
      if (credits <= 0 || balance.mediaPendingSettlement) {
        continue;
      }
      const jobId = `debt:${String(balance._id)}:${balance.mediaSettlementSequence ?? 0}`;
      const settlementId = identity(scope, jobId);
      const effect: MediaSettlementEffect = { kind: 'debt_collection', credits };
      const createdAt = new Date().toISOString();
      await settlements().updateOne(
        { ...scopeFilter(scope), settlementId },
        {
          $setOnInsert: {
            ...scopeFilter(scope),
            settlementId,
            jobId,
            balanceId: String(balance._id),
            estimatedCredits: 0,
            maxCredits: 0,
            holdFingerprint: digest(jobId),
            createdAt,
            reviewAt: createdAt,
            state: 'ready',
            effect,
            effectFingerprint: digest(JSON.stringify(effect)),
            balanceAcknowledged: false,
          },
        },
        { upsert: true },
      );
      await reconcileSettlement(scope, settlementId, policy);
    }
    return records.length + safeReleases.length + debtBalances.length;
  }

  return {
    ensureMediaAccountingIndexes,
    listMediaAccountingScopes,
    hasMediaAccountingObligations,
    deleteMediaAccountingHistory,
    acquireMediaHold,
    settleMediaJob,
    releaseMediaHold,
    reconcileMediaAccounting,
    recordMediaUsage,
  };
}

export type { MediaAccountingMethods } from '~/types/mediaAccounting';
