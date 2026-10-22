import { createHash } from 'node:crypto';
import type { mongo } from 'mongoose';

import type {
  BrowserSetupStore,
  BrowserSetupSession,
  BrowserSetupStatus,
  BrowserSetupProgress,
  BrowserSetupStartResult,
  BrowserSetupNonceResult,
} from '~/types/browserSetup';

type SessionDocument = BrowserSetupSession & {
  _id: string;
  nonces: Array<{ nonce: string; expiresAt: number }>;
  operations: number;
  deleteAfter?: Date;
  allocationReleased?: boolean;
  reconciledAt?: number;
};

type Allocation = {
  attemptId: string;
  ipHash: string;
  expiresAt: number;
  session: BrowserSetupSession;
};

type AllocationBudget = { _id: string; allocations: Allocation[] };
type RequestBudget = {
  _id: string;
  expiresAt: number;
  count: number;
  peers: Array<{ ipHash: string; count: number }>;
};

function duplicate(error: unknown): boolean {
  return typeof error === 'object' && error != null && 'code' in error && error.code === 11000;
}

function boundedInteger(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= max;
}

function publicSession(document: SessionDocument): BrowserSetupSession {
  const {
    _id,
    nonces: _nonces,
    operations: _operations,
    deleteAfter: _deleteAfter,
    allocationReleased: _allocationReleased,
    reconciledAt: _reconciledAt,
    ...session
  } = document;
  return session;
}

function terminal(status: BrowserSetupStatus): boolean {
  return ['completed', 'denied', 'cancelled', 'expired', 'failed'].includes(status);
}

/** The singleton bounds anonymous allocation state, including distinct attacker-controlled IPs. */
export function createBrowserSetupStore(mongoose: typeof import('mongoose')): BrowserSetupStore {
  const db = mongoose.connection.db;
  if (db == null) throw new Error('MongoDB is not connected');
  const sessions = db.collection<SessionDocument>('browser_setup_sessions');
  const budgets = db.collection<AllocationBudget>('browser_setup_budget');
  const requests = db.collection<RequestBudget>('browser_setup_requests');
  const ready = Promise.all([
    sessions.createIndex({ deleteAfter: 1 }, { expireAfterSeconds: 0 }),
    sessions.createIndex({ reconciledAt: 1, expiresAt: 1, _id: 1 }),
    requests
      .updateOne(
        { _id: 'global' },
        { $setOnInsert: { expiresAt: 0, count: 0, peers: [] } },
        { upsert: true },
      )
      .catch((error: unknown) => {
        if (!duplicate(error)) throw error;
      }),
    budgets
      .updateOne({ _id: 'global' }, { $setOnInsert: { allocations: [] } }, { upsert: true })
      .catch((error: unknown) => {
        if (!duplicate(error)) throw error;
      }),
  ]);

  async function get(attemptId: string): Promise<BrowserSetupSession | null> {
    await ready;
    const found = await sessions.findOne({ _id: attemptId });
    if (found == null) return null;
    await releaseResolved([found]);
    return publicSession(found);
  }

  async function start({
    session,
    ipHash,
    now,
    limits,
  }: Parameters<BrowserSetupStore['start']>[0]): Promise<BrowserSetupStartResult> {
    if (
      !boundedInteger(limits.global, 512) ||
      !boundedInteger(limits.perIp, 100_000) ||
      !boundedInteger(limits.windowMs, 86_400_000) ||
      !Number.isSafeInteger(now) ||
      !/^[a-f0-9]{64}$/.test(ipHash) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(session.attemptId) ||
      !/^[a-f0-9]{64}$/.test(session.requestHash) ||
      Buffer.byteLength(session.requestCanonical) > 8192 ||
      createHash('sha256').update(session.requestCanonical).digest('hex') !== session.requestHash ||
      !Number.isFinite(Date.parse(session.createdAt)) ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      session.verificationCode.length > 128 ||
      session.workerId.length > 128 ||
      session.status !== 'pending' ||
      session.revision !== 0 ||
      Object.keys(session).some(
        (key) =>
          ![
            'attemptId',
            'requestCanonical',
            'requestHash',
            'createdAt',
            'expiresAt',
            'verificationCode',
            'workerId',
            'status',
            'revision',
          ].includes(key),
      )
    )
      throw new Error('Invalid browser setup allocation');
    await ready;
    const existing = await get(session.attemptId);
    if (existing != null)
      return existing.requestCanonical === session.requestCanonical &&
        existing.requestHash === session.requestHash
        ? { status: 'replay', session: existing }
        : { status: 'conflict' };

    const active = '$allocations';
    const claimed = await budgets.findOneAndUpdate(
      {
        _id: 'global',
        'allocations.session.attemptId': { $ne: session.attemptId },
        $expr: {
          $and: [
            { $lt: [{ $size: active }, limits.global] },
            {
              $lt: [
                {
                  $size: {
                    $filter: {
                      input: active,
                      as: 'entry',
                      cond: { $eq: ['$$entry.ipHash', { $literal: ipHash }] },
                    },
                  },
                },
                limits.perIp,
              ],
            },
          ],
        },
      },
      [
        {
          $set: {
            allocations: {
              $concatArrays: [
                active,
                {
                  $literal: [
                    {
                      attemptId: session.attemptId,
                      ipHash,
                      expiresAt: now + limits.windowMs,
                      session,
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      {
        returnDocument: 'after',
        projection: { allocations: { $elemMatch: { 'session.attemptId': session.attemptId } } },
      },
    );
    // A crash after reserving the budget must preserve the first session's random code and expiry.
    const reservation =
      claimed ??
      (await budgets.findOne(
        { _id: 'global', 'allocations.session.attemptId': session.attemptId },
        { projection: { allocations: { $elemMatch: { 'session.attemptId': session.attemptId } } } },
      ));
    const original = reservation?.allocations[0]?.session;
    if (original == null) return { status: 'limited' };
    if (
      original.requestCanonical !== session.requestCanonical ||
      original.requestHash !== session.requestHash
    )
      return { status: 'conflict' };
    let inserted = false;
    try {
      const result = await sessions.updateOne(
        { _id: session.attemptId },
        { $setOnInsert: { ...original, nonces: [], operations: 0 } },
        { upsert: true },
      );
      inserted = result.upsertedCount === 1;
    } catch (error) {
      if (!duplicate(error)) throw error;
    }
    const persisted = await get(session.attemptId);
    if (persisted == null) throw new Error('Browser setup allocation disappeared');
    if (
      persisted.requestCanonical !== session.requestCanonical ||
      persisted.requestHash !== session.requestHash
    )
      return { status: 'conflict' };
    return { status: inserted ? 'created' : 'replay', session: persisted };
  }

  async function update({
    attemptId,
    requestHash,
    revision,
    patch,
    leaseId,
  }: Parameters<BrowserSetupStore['update']>[0]): Promise<BrowserSetupSession | null> {
    await ready;
    const existing = await get(attemptId);
    if (
      existing == null ||
      existing.requestHash !== requestHash ||
      existing.revision !== revision ||
      existing.leaseId !== leaseId
    )
      return null;
    const frozen = ['ownerId', 'tenantId', 'planeId', 'baseURL', 'tokenEnv', 'approval'] as const;
    for (const key of frozen) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] == null)
        throw new Error('Invalid frozen browser setup field');
      if (
        patch[key] != null &&
        existing[key] != null &&
        JSON.stringify(patch[key]) !== JSON.stringify(existing[key])
      )
        return null;
    }
    if (
      Object.keys(patch).some(
        (key) =>
          !['status', ...frozen, 'progress', 'failureCode', 'purgeAt', 'stopReason'].includes(key),
      )
    )
      throw new Error('Invalid browser setup update');
    if (
      patch.stopReason != null &&
      existing.stopReason != null &&
      patch.stopReason !== existing.stopReason &&
      patch.stopReason !== 'withdrawn'
    )
      return null;
    for (const key of ['ownerId', 'tenantId', 'planeId', 'baseURL', 'tokenEnv'] as const) {
      const value = patch[key];
      if (
        value != null &&
        (typeof value !== 'string' ||
          (value.length === 0 && key !== 'tenantId') ||
          value.length > (key === 'baseURL' ? 2048 : 256))
      )
        throw new Error('Invalid frozen browser setup field');
    }
    if (patch.tokenEnv != null && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(patch.tokenEnv))
      throw new Error('Invalid browser setup token environment reference');
    if (
      patch.approval != null &&
      (patch.approval.attemptId !== attemptId ||
        patch.approval.requestHash !== requestHash ||
        patch.approval.workerId !== existing.workerId ||
        patch.approval.expiresAt !== existing.expiresAt ||
        Buffer.byteLength(JSON.stringify(patch.approval)) > 8192)
    )
      throw new Error('Invalid browser setup approval binding');
    const statuses = [
      'pending',
      'provisioning',
      'approved',
      'completing',
      'completed',
      'denied',
      'cancelled',
      'expired',
      'failed',
    ];
    if (patch.status != null && !statuses.includes(patch.status))
      throw new Error('Invalid browser setup status');
    if (
      patch.stopReason != null &&
      !['denied', 'cancelled', 'expired', 'withdrawn'].includes(patch.stopReason)
    )
      throw new Error('Invalid browser setup stop reason');
    if (
      patch.progress != null &&
      Object.entries(patch.progress).some(
        ([key, value]) =>
          !['registryReserved', 'registryCompleted', 'issued', 'redemption', 'cleanup'].includes(
            key,
          ) || typeof value !== 'boolean',
      )
    )
      throw new Error('Invalid browser setup progress');
    const status = patch.status ?? existing.status;
    const withdrawn = (patch.stopReason ?? existing.stopReason) === 'withdrawn';
    if (
      terminal(existing.status) &&
      status !== existing.status &&
      !(existing.status === 'completed' && status === 'failed' && withdrawn)
    )
      return null;
    const withdrawing = patch.stopReason === 'withdrawn' && existing.stopReason !== 'withdrawn';
    const progress = {
      ...existing.progress,
      ...(withdrawing ? { cleanup: false } : {}),
      ...patch.progress,
    };
    if (
      Object.entries(existing.progress ?? {}).some(
        ([key, value]) =>
          value === true &&
          patch.progress?.[key as keyof BrowserSetupProgress] === false &&
          !(key === 'cleanup' && withdrawing),
      )
    )
      return null;
    if (patch.failureCode != null && !/^[A-Z][A-Z0-9_]{0,79}$/.test(patch.failureCode))
      throw new Error('Invalid browser setup failure code');
    if (
      patch.purgeAt != null &&
      (!terminal(status) ||
        progress.cleanup !== true ||
        !Number.isFinite(Date.parse(patch.purgeAt)))
    )
      throw new Error('Unresolved browser setup cannot expire from storage');
    const updated = await sessions.findOneAndUpdate(
      {
        _id: attemptId,
        requestHash,
        revision,
        ...(leaseId == null
          ? { leaseId: { $exists: false } }
          : { leaseId, leaseExpiresAt: { $gt: Date.now() } }),
      },
      {
        $set: { ...patch, progress },
        ...(withdrawing ? { $unset: { deleteAfter: '' } } : {}),
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (updated == null) return null;
    await releaseResolved([updated]);
    return publicSession(updated);
  }

  async function claimNonce({
    attemptId,
    requestHash,
    nonce,
    now,
    expiresAt,
    maxNonces,
    maxOperations,
  }: Parameters<BrowserSetupStore['claimNonce']>[0]): Promise<BrowserSetupNonceResult> {
    if (
      !boundedInteger(maxNonces, 10_000) ||
      !boundedInteger(maxOperations, 100_000) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(nonce) ||
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now
    )
      throw new Error('Invalid browser setup nonce');
    await ready;
    const active = {
      $filter: { input: '$nonces', as: 'entry', cond: { $gt: ['$$entry.expiresAt', now] } },
    };
    const result = await sessions.updateOne(
      {
        _id: attemptId,
        requestHash,
        operations: { $lt: maxOperations },
        nonces: { $not: { $elemMatch: { nonce, expiresAt: { $gt: now } } } },
        $expr: { $lt: [{ $size: active }, maxNonces] },
      },
      [
        {
          $set: {
            nonces: { $concatArrays: [active, { $literal: [{ nonce, expiresAt }] }] },
            operations: { $add: ['$operations', 1] },
          },
        },
      ],
    );
    if (result.matchedCount === 1) return 'claimed';
    const found = await sessions.findOne({ _id: attemptId, requestHash });
    if (found == null) return 'missing';
    return found.nonces.some((entry) => entry.nonce === nonce && entry.expiresAt > now)
      ? 'replay'
      : 'limited';
  }

  async function consumeRequest({
    ipHash,
    now,
    limits,
  }: Parameters<BrowserSetupStore['consumeRequest']>[0]): Promise<boolean> {
    if (
      !/^[a-f0-9]{64}$/.test(ipHash) ||
      !Number.isSafeInteger(now) ||
      !boundedInteger(limits.global, 100_000) ||
      !boundedInteger(limits.perIp, 100_000) ||
      !boundedInteger(limits.windowMs, 86_400_000)
    )
      throw new Error('Invalid browser setup request budget');
    await ready;
    const expired = { $lte: ['$expiresAt', now] };
    const peer = { $literal: [{ ipHash, count: 1 }] };
    const result = await requests.updateOne(
      {
        _id: 'global',
        $or: [
          { expiresAt: { $lte: now } },
          {
            count: { $lt: limits.global },
            peers: { $not: { $elemMatch: { ipHash, count: { $gte: limits.perIp } } } },
          },
        ],
      },
      [
        {
          $set: {
            expiresAt: { $cond: [expired, now + limits.windowMs, '$expiresAt'] },
            count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
            peers: {
              $cond: [
                expired,
                peer,
                {
                  $cond: [
                    { $in: [{ $literal: ipHash }, '$peers.ipHash'] },
                    {
                      $map: {
                        input: '$peers',
                        as: 'peer',
                        in: {
                          $cond: [
                            { $eq: ['$$peer.ipHash', { $literal: ipHash }] },
                            { ipHash: { $literal: ipHash }, count: { $add: ['$$peer.count', 1] } },
                            '$$peer',
                          ],
                        },
                      },
                    },
                    { $concatArrays: ['$peers', peer] },
                  ],
                },
              ],
            },
          },
        },
      ],
    );
    return result.matchedCount === 1;
  }

  async function claim({
    attemptId,
    requestHash,
    revision,
    leaseId,
    now,
    leaseMs,
  }: Parameters<BrowserSetupStore['claim']>[0]): Promise<BrowserSetupSession | null> {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(leaseId) ||
      !Number.isSafeInteger(now) ||
      !boundedInteger(leaseMs, 300_000)
    )
      throw new Error('Invalid browser setup lease');
    await ready;
    const found = await sessions.findOneAndUpdate(
      {
        _id: attemptId,
        requestHash,
        revision,
        $or: [{ leaseId: { $exists: false } }, { leaseExpiresAt: { $lte: now } }],
      },
      {
        $set: { leaseId, leaseExpiresAt: now + leaseMs, reconciledAt: now },
        $unset: { deleteAfter: '' },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    return found == null ? null : publicSession(found);
  }

  async function release({
    attemptId,
    requestHash,
    revision,
    leaseId,
  }: Parameters<BrowserSetupStore['release']>[0]): Promise<BrowserSetupSession | null> {
    await ready;
    const found = await sessions.findOneAndUpdate(
      { _id: attemptId, requestHash, revision, leaseId },
      { $unset: { leaseId: '', leaseExpiresAt: '' }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );
    if (found == null) return null;
    await releaseResolved([found]);
    return publicSession(found);
  }

  async function writeSessions(
    operations: mongo.AnyBulkWriteOperation<SessionDocument>[],
  ): Promise<void> {
    // Attempt IDs are deployment-global; raw batches use exact IDs and CAS/lease predicates.
    // eslint-disable-next-line no-restricted-syntax
    await sessions.bulkWrite(operations);
  }

  async function restoreAllocations(limit: number): Promise<void> {
    const missing = await budgets
      .aggregate<Allocation>([
        { $match: { _id: 'global' } },
        { $unwind: '$allocations' },
        {
          $lookup: {
            from: sessions.collectionName,
            localField: 'allocations.attemptId',
            foreignField: '_id',
            as: 'persisted',
          },
        },
        { $match: { persisted: { $size: 0 } } },
        { $replaceWith: '$allocations' },
        { $limit: limit },
      ])
      .toArray();
    if (missing.length === 0) return;
    await writeSessions(
      missing.map(({ session }) => ({
        updateOne: {
          filter: { _id: session.attemptId },
          update: { $setOnInsert: { ...session, nonces: [], operations: 0 } },
          upsert: true,
        },
      })),
    );
  }

  async function releaseResolved(documents: SessionDocument[]): Promise<void> {
    const resolved = documents.filter(
      (entry) =>
        terminal(entry.status) &&
        entry.leaseId == null &&
        entry.progress?.cleanup === true &&
        (!entry.allocationReleased || (entry.purgeAt != null && entry.deleteAfter == null)),
    );
    if (resolved.length === 0) return;
    await budgets.updateOne(
      { _id: 'global' },
      {
        $pull: {
          allocations: { attemptId: { $in: resolved.map((entry) => entry.attemptId) } },
        },
      },
    );
    // TTL is armed only after occupancy release. A crash before this write remains reconcilable.
    await writeSessions(
      resolved.map((entry) => ({
        updateOne: {
          filter: {
            _id: entry.attemptId,
            revision: entry.revision,
            leaseId: { $exists: false },
            'progress.cleanup': true,
          },
          update: {
            $set: {
              allocationReleased: true,
              ...(entry.purgeAt == null ? {} : { deleteAfter: new Date(entry.purgeAt) }),
            },
          },
        },
      })),
    );
  }

  async function listReconcile(
    limit: number,
    now: number = Date.now(),
  ): Promise<BrowserSetupSession[]> {
    if (!boundedInteger(limit, 512) || !Number.isSafeInteger(now))
      throw new Error('Invalid browser setup reconciliation limit');
    await ready;
    await restoreAllocations(limit);
    const found = await sessions
      .find({
        $and: [
          {
            $or: [
              { status: { $ne: 'pending' } },
              { expiresAt: { $lte: new Date(now).toISOString() } },
            ],
          },
          {
            $or: [
              { 'progress.cleanup': { $ne: true } },
              { allocationReleased: { $ne: true } },
              { purgeAt: { $exists: true }, deleteAfter: { $exists: false } },
            ],
          },
          { $or: [{ leaseId: { $exists: false } }, { leaseExpiresAt: { $lte: now } }] },
        ],
      })
      .sort({ reconciledAt: 1, expiresAt: 1, _id: 1 })
      .limit(limit)
      .toArray();
    await releaseResolved(found);
    return found.map(publicSession);
  }

  return { start, get, update, claimNonce, consumeRequest, claim, release, listReconcile };
}
