import { createHash, randomUUID } from 'crypto';
import type {
  MediaAsset,
  MediaImportReceipt,
  MediaJob,
  MediaOutput,
  MediaSubmissionReceipt,
  MediaThread,
  MediaTurn,
} from 'librechat-data-provider';
import type { FilterQuery, PipelineStage } from 'mongoose';
import type {
  MediaAssetContent,
  MediaJobFence,
  MediaMethods,
  MediaOwnerScope,
  MediaStoredJob,
  MediaStoredThread,
  MediaStoredTurn,
  StageMediaSubmissionInput,
} from '~/types/media';
import {
  createMediaOwnerModel,
  createMediaActivationModel,
  createMediaPermitModel,
  createMediaAssetWriteModel,
  createMediaJobModel,
  createMediaThreadModel,
  createMediaTurnModel,
  createMediaPresetModel,
} from '~/models/media';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createMediaNativePartModel } from '~/models/mediaNativePart';
import { createMediaSettlementModel } from '~/models/mediaSettlement';
import { createMediaAccountingMethods } from './mediaAccounting';
import { createTransactionModel } from '~/models/transaction';
import { createIndexesWithRetry } from '~/utils/retry';
import { createBalanceModel } from '~/models/balance';
import { MEDIA_FILE_ID_PREFIX } from '~/types/media';
import { createFileModel } from '~/models/file';
import { toMediaAsset } from '~/utils/media';

export class MediaPersistenceError extends Error {
  readonly code:
    | 'conflict'
    | 'version_conflict'
    | 'capacity'
    | 'not_found'
    | 'retired'
    | 'invalid_input'
    | 'unsafe_retry';
  constructor(code: MediaPersistenceError['code'], message: string) {
    super(message);
    this.name = 'MediaPersistenceError';
    this.code = code;
  }
}

const terminal = ['succeeded', 'failed', 'cancelled'];
const claimable = ['queued', 'submitting', 'running', 'ingesting', 'reconciling'];
/** Journalled acknowledgement works on standalone Mongo as well as replica sets. */
const durable = { w: 'majority' as const, j: true };

function scopeFilter(scope: MediaOwnerScope): MediaOwnerScope {
  const context = tenantStorage.getStore()?.tenantId;
  if (
    !scope.ownerId ||
    scope.tenantId === '' ||
    scope.tenantId === SYSTEM_TENANT_ID ||
    (context && context !== SYSTEM_TENANT_ID && context !== scope.tenantId)
  ) {
    throw new MediaPersistenceError('not_found', 'Media owner scope is unavailable');
  }
  return { ownerId: scope.ownerId, tenantId: scope.tenantId ?? null };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
function duplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
}
function iso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new MediaPersistenceError('invalid_input', 'Invalid media timestamp');
  }
  return date.toISOString();
}
function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MediaPersistenceError('invalid_input', 'A positive media limit is required');
  }
  return value;
}

/** Bounds a title to `maxTitleChars` UTF-16 units without splitting a surrogate pair. */
export function deriveMediaThreadTitle(prompt: string, maxTitleChars: number): string {
  return prompt.slice(0, positive(maxTitleChars)).replace(/[\uD800-\uDBFF]$/, '');
}
function cursorOf(time: string, id: string): string {
  return Buffer.from(JSON.stringify([time, id])).toString('base64url');
}
function cursorParts(cursor?: string): [string, string] | undefined {
  if (!cursor) {
    return;
  }
  try {
    const result: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      Array.isArray(result) &&
      result.length === 2 &&
      result.every((v) => typeof v === 'string')
    ) {
      return result as [string, string];
    }
  } catch {
    /* The same validation error applies to malformed encodings. */
  }
  throw new MediaPersistenceError('invalid_input', 'Invalid media cursor');
}
const readyAssetOutput = {
  kind: { $in: ['image', 'video'] },
  state: 'ready',
  'asset.file_id': { $exists: true },
};
/** The lowest-ordinal ready image or video output; the cover a thread shows before it is chosen. */
function firstReadyAsset(outputs: MediaOutput[] = []): MediaAsset | undefined {
  let cover: Extract<MediaOutput, { kind: 'image' | 'video' }> | undefined;
  for (const output of outputs) {
    if (output.kind === 'text' || output.state !== 'ready' || !output.asset?.file_id) {
      continue;
    }
    if (!cover || output.ordinal < cover.ordinal) {
      cover = output;
    }
  }
  return cover?.asset;
}
function jobView(job: MediaStoredJob): MediaJob {
  const remoteCancellation =
    !!job.execution.cancellation &&
    !!job.provider.operationId &&
    ['running', 'reconciling'].includes(job.phase) &&
    job.provider.certainty === 'submitted';
  const canRetry =
    job.receipt.phase === 'accepted' &&
    job.executionOwner === 'media' &&
    ((job.phase === 'failed' && ['unsubmitted', 'terminal'].includes(job.provider.certainty)) ||
      (job.phase === 'cancelled' && job.provider.certainty === 'unsubmitted'));
  let cancellation: MediaJob['cancellation'];
  if (job.cancelRequestedAt && job.execution.cancellation) {
    if (job.provider.recovery?.terminalStatus === 'cancelled') cancellation = 'confirmed';
    else if (!terminal.includes(job.phase)) cancellation = 'requested';
  }
  return {
    schemaVersion: 1,
    jobId: job.jobId,
    threadId: job.threadId,
    turnId: job.turnId,
    version: job.version,
    phase: job.phase,
    executionOwner: job.executionOwner,
    operation: job.operation,
    selection: job.selection,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    outputs: job.outputs.map((output) =>
      output.kind !== 'text' && output.asset
        ? { ...output, asset: toMediaAsset(output.asset) }
        : output,
    ),
    ...(job.error ? { error: job.error } : {}),
    ...(job.retryOfJobId ? { retryOfJobId: job.retryOfJobId } : {}),
    ...(cancellation ? { cancellation } : {}),
    allowedActions: {
      cancel:
        job.executionOwner === 'media' &&
        ((job.phase === 'queued' && job.provider.certainty === 'unsubmitted') ||
          remoteCancellation) &&
        !job.cancelRequestedAt,
      retry: canRetry,
    },
  };
}
function threadView(thread: MediaStoredThread): MediaThread {
  return {
    schemaVersion: 1,
    threadId: thread.threadId,
    version: thread.version,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    pendingJobCount: thread.pendingJobCount,
    turnCount: thread.turnCount,
    ...(thread.cover ? { cover: toMediaAsset(thread.cover) } : {}),
    ...(thread.retiredAt ? { retiredAt: thread.retiredAt } : {}),
    ...(thread.expiresAt ? { expiresAt: thread.expiresAt } : {}),
  };
}
/** A temporary creation expires a fixed interval after the thread's own creation time. */
function temporaryExpiry(
  turn: MediaStoredTurn,
  temporary: boolean | undefined,
  retentionMs: number | undefined,
): string | undefined {
  if (!turn.newThread || temporary !== true || retentionMs === undefined) {
    return undefined;
  }
  return new Date(new Date(turn.createdAt).getTime() + positive(retentionMs)).toISOString();
}

/** Storage-native protocol; no transactions, in-process locks, or provider calls. */
export function createMediaMethods(mongoose: typeof import('mongoose')): MediaMethods {
  const File = createFileModel(mongoose);
  const Thread = createMediaThreadModel(mongoose);
  const Turn = createMediaTurnModel(mongoose);
  const Job = createMediaJobModel(mongoose);
  const AssetWrite = createMediaAssetWriteModel(mongoose);
  const Permit = createMediaPermitModel(mongoose);
  const Activation = createMediaActivationModel(mongoose);
  const Owner = createMediaOwnerModel(mongoose);
  const Preset = createMediaPresetModel(mongoose);
  const accounting = createMediaAccountingMethods(mongoose);
  let indexPromise: Promise<void> | undefined;

  const getJob: MediaMethods['getMediaJob'] = async (scope, jobId) =>
    Job.findOne({ ...scopeFilter(scope), jobId }).lean<MediaStoredJob | null>();

  async function ensureMediaIndexes(): Promise<void> {
    indexPromise ??= Promise.all(
      [Thread, Turn, Job, AssetWrite, File, Permit, Activation, Owner, Preset].map((model) =>
        createIndexesWithRetry(model),
      ),
    )
      .then(() => undefined)
      .catch((error: unknown) => {
        indexPromise = undefined;
        throw error;
      });
    await indexPromise;
  }

  async function ensureOwner(scope: MediaOwnerScope): Promise<void> {
    await Owner.updateOne(
      scopeFilter(scope),
      {
        $setOnInsert: {
          ...scopeFilter(scope),
          status: 'active',
          workIds: [],
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true, writeConcern: durable },
    );
  }

  async function assertOwnerActive(scope: MediaOwnerScope): Promise<void> {
    await ensureOwner(scope);
    if (!(await Owner.exists({ ...scopeFilter(scope), status: 'active' }))) {
      throw new MediaPersistenceError('retired', 'Media account deletion is in progress');
    }
  }

  async function admitOwnerWork(scope: MediaOwnerScope, workId: string): Promise<boolean> {
    await ensureOwner(scope);
    // Publication grants and account deletion share this CAS. A grant survives process death.
    const result = await Owner.updateOne(
      { ...scopeFilter(scope), status: 'active' },
      { $addToSet: { workIds: workId } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  }

  async function releaseOwnerWork(scope: MediaOwnerScope, workId: string): Promise<void> {
    await Owner.updateOne(
      scopeFilter(scope),
      { $pull: { workIds: workId } },
      { writeConcern: durable },
    );
  }

  async function currentThread(
    scope: MediaOwnerScope,
    threadId?: string,
  ): Promise<MediaStoredThread | null> {
    if (!threadId) {
      return null;
    }
    const thread = await Thread.findOne({ ...scopeFilter(scope), threadId }).lean();
    if (!thread) {
      throw new MediaPersistenceError('not_found', 'Media thread not found');
    }
    if (thread.status !== 'active') {
      throw new MediaPersistenceError('retired', 'Media thread is retired');
    }
    return thread;
  }

  async function stage(
    input: StageMediaSubmissionInput,
    retry?: MediaStoredJob,
  ): Promise<MediaSubmissionReceipt> {
    await ensureMediaIndexes();
    await activateMedia();
    const scope = scopeFilter(input.scope);
    const request = structuredClone(input.request);
    const fingerprint = digest({ request, retryOfJobId: retry?.jobId });
    const replay = await Job.findOne({ ...scope, clientRequestId: request.clientRequestId }).lean();
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new MediaPersistenceError(
          'conflict',
          'Media request key was used for different content',
        );
      }
      return replay.receipt;
    }
    await assertOwnerActive(scope);
    const thread = await currentThread(scope, retry?.threadId ?? request.threadId);
    if (
      request.parentTurnId &&
      !(await Turn.exists({
        ...scope,
        turnId: request.parentTurnId,
        threadId: thread?.threadId,
        publicationPhase: 'accepted',
      }))
    ) {
      throw new MediaPersistenceError('not_found', 'Media parent turn not found');
    }
    const now = new Date().toISOString();
    const threadId = thread?.threadId ?? randomUUID();
    const turnId = retry?.turnId ?? randomUUID();
    const jobId = randomUUID();
    const receipt: MediaSubmissionReceipt = {
      schemaVersion: 1,
      clientRequestId: request.clientRequestId,
      threadId,
      turnId,
      jobId,
      phase: 'preparing',
    };
    const record: MediaStoredJob = {
      ...scope,
      schemaVersion: 1,
      jobId,
      threadId,
      turnId,
      clientRequestId: request.clientRequestId,
      fingerprint,
      request,
      execution: structuredClone(input.execution),
      receipt,
      queueCapacity: positive(input.maxPendingTotal),
      newThread: !thread,
      threadEpoch: thread?.epoch ?? 1,
      phase: 'queued',
      executionOwner: input.executionOwner ?? 'media',
      provider: { certainty: 'unsubmitted' },
      operation: request.operation,
      selection: request.selection,
      outputs: [],
      allowedActions: { cancel: true, retry: false },
      version: 1,
      createdAt: now,
      updatedAt: now,
      dueAt: now,
      ...(input.publicationExpiresAt !== undefined
        ? {
            publicationExpiresAt:
              input.publicationExpiresAt === null ? null : iso(input.publicationExpiresAt),
          }
        : {}),
      ...(retry ? { retryOfJobId: retry.jobId } : {}),
    };
    const capacity = positive(input.maxActiveJobs);
    if (record.executionOwner === 'chat') {
      try {
        await new Job(record).save(durable);
        return receipt;
      } catch (error) {
        if (!duplicate(error)) {
          throw error;
        }
        const winner = await Job.findOne({
          ...scope,
          clientRequestId: request.clientRequestId,
        }).lean();
        if (!winner || winner.fingerprint !== fingerprint || winner.executionOwner !== 'chat') {
          throw new MediaPersistenceError('conflict', 'Native media recording identity changed');
        }
        return winner.receipt;
      }
    }
    const start = parseInt(fingerprint.slice(0, 8), 16) % capacity;
    for (let offset = 0; offset < capacity; offset++) {
      try {
        await new Job({ ...record, activeSlot: (start + offset) % capacity }).save(durable);
        return await admitQueue(record);
      } catch (error) {
        if (!duplicate(error)) {
          throw error;
        }
        const winner = await Job.findOne({
          ...scope,
          clientRequestId: request.clientRequestId,
        }).lean();
        if (winner) {
          if (winner.fingerprint !== fingerprint) {
            throw new MediaPersistenceError(
              'conflict',
              'Media request key was used for different content',
            );
          }
          return winner.receipt;
        }
      }
    }
    throw new MediaPersistenceError('capacity', 'Media queue capacity reached');
  }

  async function admitQueue(job: MediaStoredJob): Promise<MediaSubmissionReceipt> {
    if (job.executionOwner === 'chat') {
      return job.receipt;
    }
    if (
      await acquireMediaPermit({
        scope: job,
        jobId: job.jobId,
        kind: 'queue',
        capacity: job.queueCapacity,
      })
    ) {
      return job.receipt;
    }
    await Job.updateOne(
      { ...scopeFilter(job), jobId: job.jobId, 'receipt.phase': 'preparing' },
      {
        $set: {
          'receipt.phase': 'rejected',
          'receipt.error': { code: 'quota_exceeded' },
          phase: 'failed',
        },
        $unset: { activeSlot: 1 },
        $inc: { version: 1 },
      },
      { writeConcern: durable },
    );
    return (await getJob(job, job.jobId))!.receipt;
  }

  async function ensureThread(
    turn: MediaStoredTurn,
    title: string,
    expiresAt?: string,
  ): Promise<MediaStoredThread> {
    const scope = scopeFilter(turn);
    if (turn.newThread) {
      await Thread.updateOne(
        { ...scope, threadId: turn.threadId },
        {
          $setOnInsert: {
            ...scope,
            schemaVersion: 1,
            threadId: turn.threadId,
            version: 1,
            title,
            status: 'active',
            epoch: turn.threadEpoch,
            originRequestId: turn.sourceJobId ?? turn.clientRequestId,
            createdAt: turn.createdAt,
            updatedAt: turn.createdAt,
            nextTurnSequence: 0,
            dispatchJobIds: [],
            ...(expiresAt ? { expiresAt } : {}),
          },
        },
        { upsert: true, writeConcern: durable },
      );
    }
    const thread = await currentThread(scope, turn.threadId);
    if (!thread || thread.epoch !== turn.threadEpoch) {
      throw new MediaPersistenceError('retired', 'Media thread epoch changed');
    }
    return thread;
  }

  /** A pending slot names the turn owning the increment. Every caller can repair it. */
  async function assignSequence(scope: MediaOwnerScope, turnId: string): Promise<void> {
    scope = scopeFilter(scope);
    for (;;) {
      const turn = await Turn.findOne({ ...scopeFilter(scope), turnId }).lean();
      if (!turn || turn.sequence !== undefined) {
        return;
      }
      let thread = await Thread.findOne({ ...scope, threadId: turn.threadId }).lean();
      if (!thread || thread.status !== 'active' || thread.epoch !== turn.threadEpoch) {
        throw new MediaPersistenceError('retired', 'Media thread is retired');
      }
      if (!thread.pendingTurnId) {
        thread = await Thread.findOneAndUpdate(
          {
            ...scope,
            threadId: turn.threadId,
            epoch: turn.threadEpoch,
            status: 'active',
            pendingTurnId: { $exists: false },
          },
          { $set: { pendingTurnId: turnId }, $inc: { nextTurnSequence: 1 } },
          { new: true, writeConcern: durable },
        ).lean();
        if (!thread) {
          continue;
        }
      }
      const pendingId = thread.pendingTurnId;
      const assigned = await Turn.updateOne(
        { ...scope, threadId: turn.threadId, turnId: pendingId, sequence: { $exists: false } },
        { $set: { sequence: thread.nextTurnSequence } },
        { writeConcern: durable },
      );
      // Another publisher may have completed this same turn before we acquired the slot.
      // Its immutable sequence wins; unused counter values are harmless.
      if (
        !assigned.matchedCount &&
        !(await Turn.exists({ ...scope, turnId: pendingId, sequence: { $exists: true } }))
      ) {
        throw new MediaPersistenceError('conflict', 'Media sequence owner is missing');
      }
      await Thread.updateOne(
        {
          ...scope,
          threadId: turn.threadId,
          pendingTurnId: pendingId,
          nextTurnSequence: thread.nextTurnSequence,
        },
        { $unset: { pendingTurnId: 1 } },
        { writeConcern: durable },
      );
    }
  }

  async function pinInputs(turn: MediaStoredTurn, maxRetainers: number): Promise<void> {
    for (const fileId of new Set(turn.inputs.map((item) => item.file_id))) {
      const file = await File.findOne({
        user: turn.ownerId,
        tenantId: turn.tenantId,
        file_id: fileId,
        mediaLifecycle: 'live',
        mediaOutputKey: { $exists: true },
      }).lean();
      if (!file) {
        throw new MediaPersistenceError(
          'invalid_input',
          'Media input requires an owned immutable original',
        );
      }
      // One pin per thread, independent of turn count. Publication and deletion race on this File.
      const retained = await retainMediaThreadAsset({
        scope: scopeFilter(turn),
        fileId,
        threadId: turn.threadId,
        maxRetainers,
      });
      if (!retained) {
        throw new MediaPersistenceError('invalid_input', 'Media input was retired');
      }
    }
  }

  async function publishTurn(
    turn: MediaStoredTurn,
    maxRetainers: number,
    maxTitleChars: number,
    expiresAt?: string,
  ): Promise<void> {
    const title = deriveMediaThreadTitle(turn.importRequest?.title ?? turn.prompt, maxTitleChars);
    await ensureThread(turn, title, expiresAt);
    await Turn.updateOne(
      { ...scopeFilter(turn), turnId: turn.turnId },
      { $setOnInsert: turn },
      { upsert: true, writeConcern: durable },
    );
    await assignSequence(turn, turn.turnId);
    await pinInputs(turn, maxRetainers);
    // A retirement after this check is still fenced by dispatch admission and hidden from reads.
    await currentThread(turn, turn.threadId);
  }

  async function refreshThread(scope: MediaOwnerScope, threadId: string): Promise<void> {
    const [turnCount, pendingJobCount] = await Promise.all([
      Turn.countDocuments({ ...scopeFilter(scope), threadId, publicationPhase: 'accepted' }),
      Job.countDocuments({
        ...scopeFilter(scope),
        threadId,
        'receipt.phase': 'accepted',
        phase: { $nin: terminal },
      }),
    ]);
    await Thread.updateOne(
      { ...scope, threadId },
      { $set: { turnCount, pendingJobCount }, $inc: { version: 1 } },
    );
  }

  const publishMediaSubmission: MediaMethods['publishMediaSubmission'] = async (
    scope,
    jobId,
    options,
  ) => {
    const job = await getJob(scope, jobId);
    if (!job || job.receipt.phase !== 'preparing') {
      return job?.receipt ?? null;
    }
    if (terminal.includes(job.phase)) {
      await Job.updateOne(
        { ...scopeFilter(scope), jobId, 'receipt.phase': 'preparing' },
        {
          $set: { 'receipt.phase': 'rejected', 'receipt.error': { code: 'not_ready' } },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
      return (await getJob(scope, jobId))!.receipt;
    }
    const queued = await admitQueue(job);
    if (queued.phase !== 'preparing') {
      return queued;
    }
    const turn: MediaStoredTurn = {
      ...scopeFilter(scope),
      schemaVersion: 1,
      version: 1,
      threadId: job.threadId,
      turnId: job.turnId,
      threadEpoch: job.threadEpoch,
      kind: 'generation',
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
      prompt: job.request.prompt,
      inputs: job.request.inputs,
      selection: job.selection,
      operation: job.operation,
      parentTurnId: job.request.parentTurnId,
      ...(job.request.comparisonId ? { comparisonId: job.request.comparisonId } : {}),
      sourceJobId: job.jobId,
      newThread: job.newThread,
      publicationPhase: 'preparing',
    };
    try {
      if (!(await admitOwnerWork(scope, `job:${jobId}`))) {
        throw new MediaPersistenceError('retired', 'Media account is being deleted');
      }
      await publishTurn(
        turn,
        options.maxRetainers,
        options.maxTitleChars,
        job.publicationExpiresAt === undefined
          ? temporaryExpiry(turn, job.request.temporary, options.temporaryRetentionMs)
          : (job.publicationExpiresAt ?? undefined),
      );
      await Turn.updateOne(
        { ...scope, turnId: job.turnId },
        { $set: { publicationPhase: 'accepted' } },
        { writeConcern: durable },
      );
      await Job.updateOne(
        {
          ...scope,
          jobId,
          'receipt.phase': 'preparing',
          phase: 'queued',
          cancelRequestedAt: { $exists: false },
        },
        {
          $set: { 'receipt.phase': 'accepted', updatedAt: new Date().toISOString() },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
      await refreshThread(scope, job.threadId);
    } catch (error) {
      if (
        !(error instanceof MediaPersistenceError) ||
        !['retired', 'invalid_input', 'not_found'].includes(error.code)
      ) {
        throw error;
      }
      await Job.updateOne(
        { ...scope, jobId, 'receipt.phase': 'preparing', phase: 'queued' },
        {
          $set: {
            'receipt.phase': 'rejected',
            'receipt.error': {
              code: error.code === 'invalid_input' ? 'invalid_request' : 'not_found',
            },
            phase: 'failed',
            error: { code: error.code === 'invalid_input' ? 'invalid_request' : 'not_found' },
            updatedAt: new Date().toISOString(),
          },
          $unset: { activeSlot: 1 },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
      await releaseOwnerWork(scope, `job:${jobId}`);
    }
    return (await getJob(scope, jobId))?.receipt ?? null;
  };

  const stageMediaImport: MediaMethods['stageMediaImport'] = async ({
    scope: inputScope,
    request,
    identityRequest,
    publicationExpiresAt,
  }) => {
    await ensureMediaIndexes();
    await activateMedia();
    const scope = scopeFilter(inputScope);
    const fingerprint = digest(identityRequest ?? request);
    const key = { ...scope, kind: 'import', clientRequestId: request.clientRequestId };
    const existing = await Turn.findOne(key).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new MediaPersistenceError(
          'conflict',
          'Media import key was used for different content',
        );
      }
      return existing.importReceipt!;
    }
    await assertOwnerActive(scope);
    const thread = await currentThread(scope, request.threadId);
    const now = new Date().toISOString();
    const receipt: MediaImportReceipt = {
      schemaVersion: 1,
      phase: 'preparing',
      clientRequestId: request.clientRequestId,
      threadId: thread?.threadId ?? randomUUID(),
      turnId: randomUUID(),
    };
    try {
      await new Turn({
        ...scope,
        schemaVersion: 1,
        version: 1,
        turnId: receipt.turnId,
        threadId: receipt.threadId,
        threadEpoch: thread?.epoch ?? 1,
        kind: 'import',
        newThread: !thread,
        clientRequestId: request.clientRequestId,
        fingerprint,
        importRequest: structuredClone(request),
        importIdentityRequest: structuredClone(identityRequest ?? request),
        importReceipt: receipt,
        createdAt: now,
        updatedAt: now,
        prompt: '',
        inputs: request.inputs,
        publicationPhase: 'preparing',
        ...(publicationExpiresAt !== undefined
          ? {
              publicationExpiresAt:
                publicationExpiresAt === null ? null : iso(publicationExpiresAt),
            }
          : {}),
      }).save(durable);
      return receipt;
    } catch (error) {
      if (!duplicate(error)) {
        throw error;
      }
      const winner = await Turn.findOne(key).lean();
      if (!winner || winner.fingerprint !== fingerprint) {
        throw new MediaPersistenceError(
          'conflict',
          'Media import key was used for different content',
        );
      }
      return winner.importReceipt!;
    }
  };

  const publishMediaImport: MediaMethods['publishMediaImport'] = async (scope, turnId, options) => {
    const turn = await Turn.findOne({
      ...scopeFilter(scope),
      turnId,
      kind: 'import',
    }).lean<MediaStoredTurn | null>();
    if (!turn?.importReceipt || turn.importReceipt.phase !== 'preparing') {
      return turn?.importReceipt ?? null;
    }
    try {
      if (!(await admitOwnerWork(scope, `import:${turnId}`))) {
        throw new MediaPersistenceError('retired', 'Media account is being deleted');
      }
      await publishTurn(
        turn,
        options.maxRetainers,
        options.maxTitleChars,
        turn.publicationExpiresAt === undefined
          ? temporaryExpiry(turn, turn.importRequest?.temporary, options.temporaryRetentionMs)
          : (turn.publicationExpiresAt ?? undefined),
      );
      await Turn.updateOne(
        { ...scope, turnId, 'importReceipt.phase': 'preparing' },
        {
          $set: {
            publicationPhase: 'accepted',
            'importReceipt.phase': 'accepted',
            updatedAt: new Date().toISOString(),
          },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
      await refreshThread(scope, turn.threadId);
    } catch (error) {
      if (
        !(error instanceof MediaPersistenceError) ||
        !['retired', 'invalid_input', 'not_found'].includes(error.code)
      ) {
        throw error;
      }
      await Turn.updateOne(
        { ...scope, turnId, 'importReceipt.phase': 'preparing' },
        {
          $set: {
            publicationPhase: 'rejected',
            'importReceipt.phase': 'rejected',
            'importReceipt.error': {
              code: error.code === 'invalid_input' ? 'invalid_request' : 'not_found',
            },
            updatedAt: new Date().toISOString(),
          },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
    }
    await releaseOwnerWork(scope, `import:${turnId}`);
    return (await Turn.findOne({ ...scope, turnId }).lean())?.importReceipt ?? null;
  };

  const getMediaThread: MediaMethods['getMediaThread'] = async (scope, threadId) => {
    const owner = scopeFilter(scope);
    const acceptedJobs = { ...owner, threadId, 'receipt.phase': 'accepted' };
    const [thread, pendingJobCount, turnCount, coverJob] = await Promise.all([
      Thread.findOne({ ...owner, threadId, status: 'active' }).lean(),
      Job.countDocuments({ ...acceptedJobs, phase: { $nin: terminal } }),
      Turn.countDocuments({ ...owner, threadId, publicationPhase: 'accepted' }),
      Job.findOne({ ...acceptedJobs, outputs: { $elemMatch: readyAssetOutput } })
        .sort({ createdAt: 1, jobId: 1 })
        .select({ outputs: 1 })
        .lean<Pick<MediaStoredJob, 'outputs'> | null>(),
    ]);
    if (!thread) {
      return null;
    }
    const cover =
      !thread.cover && !thread.coverExplicit ? firstReadyAsset(coverJob?.outputs) : undefined;
    if (pendingJobCount === thread.pendingJobCount && turnCount === thread.turnCount && !cover) {
      return threadView(thread);
    }
    // Job completion and its advisory projection are separate writes on standalone Mongo.
    // Opening a restored thread repairs an interrupted projection; repeated reads do not
    // change its version. The CAS protects title and cover edits made during this read.
    const repaired = await Thread.findOneAndUpdate(
      { ...owner, threadId, status: 'active', epoch: thread.epoch, version: thread.version },
      { $set: { pendingJobCount, turnCount, ...(cover ? { cover } : {}) }, $inc: { version: 1 } },
      { new: true, writeConcern: durable },
    ).lean();
    if (repaired) {
      return threadView(repaired);
    }
    const current = await Thread.findOne({ ...owner, threadId, status: 'active' }).lean();
    return current ? threadView(current) : null;
  };

  const listMediaThreads: MediaMethods['listMediaThreads'] = async ({
    scope,
    limit,
    cursor,
    filter,
    include,
  }) => {
    positive(limit);
    const after = cursorParts(cursor);
    // Temporary creations stay reachable by id but never appear in the library.
    const query: FilterQuery<MediaStoredThread> = {
      ...scopeFilter(scope),
      status: 'active',
      expiresAt: { $exists: false },
    };
    if (after) {
      query.$or = [
        { createdAt: { $lt: after[0] } },
        { createdAt: after[0], threadId: { $lt: after[1] } },
      ];
    }
    if (include === 'activity') {
      type GalleryThread = MediaStoredThread & {
        jobs: Array<{ pending: number } & NonNullable<MediaThread['activity']>>;
        covers: Array<Pick<MediaStoredJob, 'outputs'>>;
      };
      const filtered = filter === 'pending' || filter === 'completed';
      const correlated = {
        ...scopeFilter(scope),
        'receipt.phase': 'accepted',
        $expr: { $eq: ['$threadId', '$$threadId'] },
      };
      const rows = await Thread.aggregate<GalleryThread>([
        { $match: query },
        { $sort: { createdAt: -1, threadId: -1 } },
        ...(!filtered ? [{ $limit: limit + 1 }] : []),
        {
          $lookup: {
            // eslint-disable-next-line no-restricted-syntax -- Owner and tenant are explicit in this correlated lookup.
            from: Job.collection.name,
            let: { threadId: '$threadId' },
            pipeline: [
              { $match: correlated },
              { $sort: { createdAt: -1, jobId: -1 } },
              {
                $group: {
                  _id: null,
                  pending: { $sum: { $cond: [{ $in: ['$phase', terminal] }, 0, 1] } },
                  latestJob: {
                    $first: {
                      phase: '$phase',
                      operation: '$operation',
                      selection: '$selection',
                    },
                  },
                  readyOutputs: {
                    $sum: {
                      $size: {
                        $filter: {
                          input: '$outputs',
                          as: 'output',
                          cond: {
                            $and: [
                              { $in: ['$$output.kind', ['image', 'video']] },
                              { $eq: ['$$output.state', 'ready'] },
                              { $ne: [{ $ifNull: ['$$output.asset.file_id', null] }, null] },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
              { $project: { _id: 0, pending: 1, latestJob: 1, readyOutputs: 1 } },
            ],
            as: 'jobs',
          },
        },
        {
          $lookup: {
            // eslint-disable-next-line no-restricted-syntax -- Owner and tenant are explicit in this correlated lookup.
            from: Job.collection.name,
            let: { threadId: '$threadId' },
            pipeline: [
              { $match: { ...correlated, outputs: { $elemMatch: readyAssetOutput } } },
              { $sort: { createdAt: 1, jobId: 1 } },
              { $limit: 1 },
              { $project: { _id: 0, outputs: 1 } },
            ],
            as: 'covers',
          },
        },
        ...(filtered
          ? [
              {
                $match:
                  filter === 'pending'
                    ? { 'jobs.pending': { $gt: 0 } }
                    : { 'jobs.readyOutputs': { $gt: 0 } },
              },
              { $limit: limit + 1 },
            ]
          : []),
      ]);
      const last = rows[limit - 1];
      return {
        items: rows.slice(0, limit).map((thread) => {
          const [projected] = thread.jobs;
          const cover =
            thread.cover ??
            (!thread.coverExplicit ? firstReadyAsset(thread.covers[0]?.outputs) : undefined);
          return {
            ...threadView({ ...thread, cover }),
            pendingJobCount: projected?.pending ?? 0,
            activity: projected
              ? { latestJob: projected.latestJob, readyOutputs: projected.readyOutputs }
              : { readyOutputs: 0 },
          };
        }),
        ...(rows.length > limit && last
          ? { nextCursor: cursorOf(last.createdAt, last.threadId) }
          : {}),
      };
    }
    if (filter === 'pending') {
      query.pendingJobCount = { $gt: 0 };
    }
    if (filter === 'completed') {
      query.pendingJobCount = 0;
      query.turnCount = { $gt: 0 };
    }
    const rows = await Thread.find(query)
      .sort({ createdAt: -1, threadId: -1 })
      .limit(limit + 1)
      .lean();
    const last = rows[limit - 1];
    return {
      items: rows.slice(0, limit).map(threadView),
      ...(rows.length > limit && last
        ? { nextCursor: cursorOf(last.createdAt, last.threadId) }
        : {}),
    };
  };

  const pageTurnJobs: MediaMethods['listMediaTurnJobs'] = async ({
    scope,
    turnId,
    limit,
    cursor,
  }) => {
    positive(limit);
    const after = cursorParts(cursor);
    const query: FilterQuery<MediaStoredJob> = {
      ...scopeFilter(scope),
      turnId,
      'receipt.phase': 'accepted',
    };
    if (after) {
      query.$or = [
        { createdAt: { $gt: after[0] } },
        { createdAt: after[0], jobId: { $gt: after[1] } },
      ];
    }
    const rows = await Job.find(query)
      .sort({ createdAt: 1, jobId: 1 })
      .limit(limit + 1)
      .lean<MediaStoredJob[]>();
    const last = rows[limit - 1];
    return {
      items: rows.slice(0, limit).map(jobView),
      ...(rows.length > limit && last ? { nextCursor: cursorOf(last.createdAt, last.jobId) } : {}),
    };
  };
  const listMediaTurnJobs: MediaMethods['listMediaTurnJobs'] = async (input) => {
    const turn = await Turn.findOne({
      ...scopeFilter(input.scope),
      turnId: input.turnId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    })
      .select({ threadId: 1 })
      .lean();
    if (
      !turn ||
      !(await Thread.exists({
        ...scopeFilter(input.scope),
        threadId: turn.threadId,
        status: 'active',
      }))
    ) {
      return { items: [] };
    }
    return pageTurnJobs(input);
  };

  const getMediaAsset: MediaMethods['getMediaAsset'] = async (scope, fileId) => {
    scopeFilter(scope);
    const file = await File.findOne({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      file_id: fileId,
      mediaLifecycle: 'live',
      $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
    }).lean();
    return file ? toMediaAsset(file as unknown as MediaAssetContent) : null;
  };

  const listMediaTurns: MediaMethods['listMediaTurns'] = async ({
    scope,
    threadId,
    limit,
    cursor,
    jobsPerTurn,
  }) => {
    positive(limit);
    positive(jobsPerTurn);
    if (!(await Thread.exists({ ...scopeFilter(scope), threadId, status: 'active' }))) {
      return { items: [] };
    }
    const after = cursorParts(cursor);
    const query: FilterQuery<MediaStoredTurn> = {
      ...scopeFilter(scope),
      threadId,
      publicationPhase: 'accepted',
    };
    if (after) {
      const sequence = Number(after[0]);
      if (!Number.isSafeInteger(sequence) || sequence <= 0) {
        throw new MediaPersistenceError('invalid_input', 'Invalid media turn cursor');
      }
      query.sequence = { $lt: sequence };
    }
    const rows = await Turn.find(query)
      .sort({ sequence: -1 })
      .limit(limit + 1)
      .lean<MediaStoredTurn[]>();
    const page = rows.slice(0, limit);
    if (!page.length) {
      return { items: [] };
    }
    const importIds = [
      ...new Set(
        page
          .filter((turn) => turn.kind === 'import')
          .flatMap((turn) => turn.inputs.map((input) => input.file_id)),
      ),
    ];
    const [jobRowsByTurn, importFiles] = await Promise.all([
      Job.find({
        ...scopeFilter(scope),
        turnId: { $in: page.map((turn) => turn.turnId) },
        'receipt.phase': 'accepted',
      })
        .sort({ createdAt: 1, jobId: 1 })
        .lean<MediaStoredJob[]>()
        .then((jobs) =>
          jobs.reduce((groups, job) => {
            const group = groups.get(job.turnId);
            if (!group) {
              groups.set(job.turnId, [job]);
            } else if (group.length <= jobsPerTurn) {
              group.push(job);
            }
            return groups;
          }, new Map<string, MediaStoredJob[]>()),
        ),
      importIds.length
        ? File.find({
            user: scope.ownerId,
            tenantId: scope.tenantId,
            file_id: { $in: importIds },
            mediaLifecycle: 'live',
          }).lean()
        : Promise.resolve([]),
    ]);
    const assetsById = new Map(
      importFiles.map((file) => [file.file_id, toMediaAsset(file as unknown as MediaAssetContent)]),
    );
    const items = page.map((turn): MediaTurn => {
      const jobRows = jobRowsByTurn.get(turn.turnId) ?? [];
      const lastJob = jobRows[jobsPerTurn - 1];
      const jobs = {
        items: jobRows.slice(0, jobsPerTurn).map(jobView),
        nextCursor:
          jobRows.length > jobsPerTurn && lastJob
            ? cursorOf(lastJob.createdAt, lastJob.jobId)
            : undefined,
      };
      const assets =
        turn.kind === 'import'
          ? turn.inputs
              .map((file) => assetsById.get(file.file_id))
              .filter((asset): asset is MediaAsset => asset !== undefined)
          : [];
      return {
        schemaVersion: 1,
        threadId,
        turnId: turn.turnId,
        version: turn.version,
        kind: turn.kind,
        sequence: turn.sequence,
        createdAt: turn.createdAt,
        prompt: turn.prompt,
        parentTurnId: turn.parentTurnId,
        ...(turn.comparisonId ? { comparisonId: turn.comparisonId } : {}),
        inputs: turn.inputs,
        selection: turn.selection,
        operation: turn.operation,
        ...(jobRows[0] ? { parameters: jobRows[0].request.parameters } : {}),
        jobs: jobs.items,
        jobsNextCursor: jobs.nextCursor,
        assets,
      };
    });
    const last = rows[limit - 1];
    return {
      items,
      ...(rows.length > limit && last
        ? { nextCursor: cursorOf(String(last.sequence), last.turnId) }
        : {}),
    };
  };

  function fenceQuery(input: MediaJobFence, now: string): FilterQuery<MediaStoredJob> {
    return {
      ...scopeFilter(input.scope),
      jobId: input.jobId,
      leaseToken: input.leaseToken,
      version: input.expectedVersion,
      leaseUntil: { $gt: iso(now) },
      'receipt.phase': 'accepted',
    };
  }

  const getMediaLatestImageContext: MediaMethods['getMediaLatestImageContext'] = async ({
    scope: inputScope,
    threadId,
  }) => {
    const scope = scopeFilter(inputScope);
    const liveFile = {
      user: new mongoose.Types.ObjectId(scope.ownerId),
      tenantId: scope.tenantId,
      mediaLifecycle: 'live',
      type: /^image\//,
      $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
    };
    const [context] = await Thread.aggregate<{ turnId: string; file: MediaAssetContent }>([
      { $match: { ...scope, threadId, status: 'active' } },
      {
        $lookup: {
          // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
          from: Turn.collection.name,
          let: { threadId: '$threadId' },
          pipeline: [
            {
              $match: {
                ...scope,
                publicationPhase: 'accepted',
                $expr: { $eq: ['$threadId', '$$threadId'] },
              },
            },
            { $sort: { sequence: -1 } },
            {
              $lookup: {
                // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                from: Job.collection.name,
                let: { turnId: '$turnId' },
                pipeline: [
                  {
                    $match: {
                      ...scope,
                      phase: 'succeeded',
                      'receipt.phase': 'accepted',
                      $expr: { $eq: ['$turnId', '$$turnId'] },
                    },
                  },
                  { $unwind: '$outputs' },
                  {
                    $match: {
                      'outputs.kind': 'image',
                      'outputs.state': 'ready',
                      'outputs.asset.file_id': { $exists: true },
                    },
                  },
                  { $sort: { createdAt: -1, jobId: -1, 'outputs.ordinal': 1 } },
                  {
                    $lookup: {
                      // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                      from: File.collection.name,
                      let: { fileId: '$outputs.asset.file_id' },
                      pipeline: [
                        { $match: { ...liveFile, $expr: { $eq: ['$file_id', '$$fileId'] } } },
                        { $limit: 1 },
                      ],
                      as: 'file',
                    },
                  },
                  { $unwind: '$file' },
                  { $limit: 1 },
                  { $project: { _id: 0, file: 1 } },
                ],
                as: 'images',
              },
            },
            {
              $lookup: {
                // eslint-disable-next-line no-restricted-syntax -- Collection metadata only; the lookup explicitly scopes owner and tenant.
                from: File.collection.name,
                let: { fileIds: '$inputs.file_id', kind: '$kind' },
                pipeline: [
                  {
                    $match: {
                      ...liveFile,
                      $expr: {
                        $and: [{ $eq: ['$$kind', 'import'] }, { $in: ['$file_id', '$$fileIds'] }],
                      },
                    },
                  },
                  { $addFields: { inputOrder: { $indexOfArray: ['$$fileIds', '$file_id'] } } },
                  { $sort: { inputOrder: 1 } },
                  { $limit: 1 },
                ],
                as: 'imports',
              },
            },
            {
              $set: {
                file: {
                  $ifNull: [
                    { $arrayElemAt: ['$images.file', 0] },
                    { $arrayElemAt: ['$imports', 0] },
                  ],
                },
              },
            },
            { $match: { file: { $ne: null } } },
            { $limit: 1 },
            { $project: { _id: 0, turnId: 1, file: 1 } },
          ],
          as: 'context',
        },
      },
      { $unwind: '$context' },
      { $replaceRoot: { newRoot: '$context' } },
    ]);
    return context ? { turnId: context.turnId, asset: toMediaAsset(context.file) } : null;
  };

  const claimMediaJob: MediaMethods['claimMediaJob'] = async ({
    scope,
    workerId,
    now,
    leaseMs,
  }) => {
    const timestamp = iso(now);
    const job = await Job.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        executionOwner: 'media',
        'receipt.phase': 'accepted',
        phase: { $in: claimable },
        dueAt: { $lte: timestamp },
        $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: timestamp } }],
      },
      {
        $set: {
          leaseToken: randomUUID(),
          leaseOwner: workerId,
          leaseUntil: new Date(new Date(timestamp).getTime() + positive(leaseMs)).toISOString(),
          updatedAt: timestamp,
        },
        $inc: { version: 1 },
      },
      { new: true, sort: { dueAt: 1, createdAt: 1, jobId: 1 }, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
    if (job?.phase === 'submitting') {
      // A lease loss is not evidence that the previous process missed the remote call.
      return Job.findOneAndUpdate(
        { ...scope, jobId: job.jobId, leaseToken: job.leaseToken, version: job.version },
        {
          $set: {
            phase: 'reconciling',
            'provider.certainty': job.provider.operationId ? 'submitted' : 'unknown',
          },
          $inc: { version: 1 },
        },
        { new: true, writeConcern: durable },
      ).lean<MediaStoredJob | null>();
    }
    return job;
  };

  const renewMediaJob: MediaMethods['renewMediaJob'] = async (input) =>
    Job.findOneAndUpdate(
      fenceQuery(input, input.now),
      {
        $set: {
          leaseUntil: new Date(
            new Date(input.now).getTime() + positive(input.leaseMs),
          ).toISOString(),
        },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();

  const beginMediaSubmission: MediaMethods['beginMediaSubmission'] = async (input) => {
    const job = await Job.findOne({
      ...fenceQuery(input, input.now),
      phase: 'queued',
      executionOwner: 'media',
      cancelRequestedAt: { $exists: false },
      'provider.certainty': 'unsubmitted',
    }).lean();
    if (!job) {
      return null;
    }
    if (!(await admitOwnerWork(input.scope, `job:${job.jobId}`))) {
      return null;
    }
    // The thread CAS is the linearization point shared with retirement.
    const grant = await Thread.updateOne(
      {
        ...scopeFilter(input.scope),
        threadId: job.threadId,
        status: 'active',
        epoch: job.threadEpoch,
      },
      { $addToSet: { dispatchJobIds: job.jobId } },
      { writeConcern: durable },
    );
    if (!grant.matchedCount) {
      return null;
    }
    return Job.findOneAndUpdate(
      {
        ...fenceQuery(input, input.now),
        phase: 'queued',
        cancelRequestedAt: { $exists: false },
        'provider.certainty': 'unsubmitted',
      },
      {
        $set: {
          phase: 'submitting',
          'provider.certainty': 'unknown',
          dispatchGrantedAt: iso(input.now),
          updatedAt: iso(input.now),
        },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
  };

  const recordMediaJobObservation: MediaMethods['recordMediaJobObservation'] = async (input) => {
    const before = await Job.findOne(fenceQuery(input, input.now)).lean();
    if (!before || terminal.includes(before.phase)) {
      return null;
    }
    const observation = input.observation;
    const transitions: Record<string, string[]> = {
      queued: ['queued', 'failed', 'cancelled', 'requires_attention'],
      submitting: [
        'running',
        'ingesting',
        'reconciling',
        'requires_attention',
        'failed',
        'cancelled',
      ],
      running: ['running', 'ingesting', 'reconciling', 'requires_attention', 'failed', 'cancelled'],
      ingesting: ['ingesting', 'reconciling', 'requires_attention', 'succeeded', 'failed'],
      reconciling: [
        'running',
        'ingesting',
        'reconciling',
        'requires_attention',
        'succeeded',
        'failed',
        'cancelled',
      ],
    };
    if (!transitions[before.phase]?.includes(observation.phase)) {
      throw new MediaPersistenceError('unsafe_retry', 'Invalid media job phase transition');
    }
    if (observation.phase === 'queued' && before.phase !== 'queued') {
      throw new MediaPersistenceError(
        'unsafe_retry',
        'A provider attempt cannot be submitted again',
      );
    }
    const certainty = observation.provider?.certainty ?? before.provider.certainty;
    const certaintyRank = { unsubmitted: 0, unknown: 1, submitted: 2, terminal: 3 };
    if (certaintyRank[certainty] < certaintyRank[before.provider.certainty]) {
      throw new MediaPersistenceError(
        'unsafe_retry',
        'Provider submission certainty cannot be reversed',
      );
    }
    if (before.provider.certainty !== 'unsubmitted' && certainty === 'unsubmitted') {
      throw new MediaPersistenceError(
        'unsafe_retry',
        'Provider submission certainty cannot be reversed',
      );
    }
    if (terminal.includes(observation.phase) && !['unsubmitted', 'terminal'].includes(certainty)) {
      throw new MediaPersistenceError(
        'unsafe_retry',
        'Unknown provider outcome cannot become safely terminal',
      );
    }
    const isTerminal = terminal.includes(observation.phase);
    const update: Record<string, unknown> = {
      phase: observation.phase,
      updatedAt: iso(input.now),
      ...(observation.provider ? { provider: observation.provider } : {}),
      ...(observation.outputs ? { outputs: observation.outputs } : {}),
      ...(observation.error ? { error: observation.error } : {}),
      ...(observation.dueAt ? { dueAt: iso(observation.dueAt) } : {}),
    };
    const unset = {
      ...(isTerminal ? { activeSlot: 1 } : {}),
      ...(isTerminal || observation.releaseLease
        ? { leaseToken: 1, leaseOwner: 1, leaseUntil: 1 }
        : {}),
    };
    const job = await Job.findOneAndUpdate(
      fenceQuery(input, input.now),
      {
        $set: update,
        $inc: { version: 1 },
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
    if (job && isTerminal) {
      await releaseOwnerWork(input.scope, `job:${job.jobId}`);
      await releaseMediaPermits({ scope: input.scope, jobId: job.jobId });
      await Thread.updateOne(
        { ...scopeFilter(input.scope), threadId: job.threadId },
        { $pull: { dispatchJobIds: job.jobId } },
      );
      await refreshThread(input.scope, job.threadId);
    }
    return job;
  };

  const cancelMediaJob: MediaMethods['cancelMediaJob'] = async (
    scope,
    jobId,
    providerApis = [],
  ) => {
    scopeFilter(scope);
    const now = new Date().toISOString();
    const cancelled = await Job.findOneAndUpdate(
      {
        ...scope,
        jobId,
        executionOwner: 'media',
        phase: 'queued',
        'provider.certainty': 'unsubmitted',
      },
      {
        $set: { phase: 'cancelled', cancelRequestedAt: now, updatedAt: now },
        $unset: { activeSlot: 1, leaseToken: 1, leaseOwner: 1, leaseUntil: 1 },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
    if (cancelled) {
      await releaseOwnerWork(scope, `job:${jobId}`);
      if (cancelled.receipt.phase === 'preparing') {
        await Job.updateOne(
          { ...scope, jobId, 'receipt.phase': 'preparing' },
          {
            $set: { 'receipt.phase': 'rejected', 'receipt.error': { code: 'not_ready' } },
            $inc: { version: 1 },
          },
          { writeConcern: durable },
        );
      }
      await releaseMediaPermits({ scope, jobId });
      await Thread.updateOne(
        { ...scope, threadId: cancelled.threadId },
        { $pull: { dispatchJobIds: jobId } },
      );
      await refreshThread(scope, cancelled.threadId);
      return jobView(cancelled);
    }
    if (providerApis.length) {
      await Job.updateOne(
        {
          ...scope,
          jobId,
          executionOwner: 'media',
          phase: { $in: ['running', 'reconciling'] },
          'provider.certainty': 'submitted',
          'provider.operationId': { $exists: true },
          'execution.api': { $in: providerApis },
          'execution.cancellation': { $in: ['best-effort', 'confirmed'] },
          cancelRequestedAt: { $exists: false },
        },
        {
          $set: { cancelRequestedAt: now, dueAt: now, updatedAt: now },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
    }
    const job = await getJob(scope, jobId);
    return job ? jobView(job) : null;
  };

  const retryMediaJob: MediaMethods['retryMediaJob'] = async ({
    scope,
    jobId,
    clientRequestId,
    maxActiveJobs,
    maxPendingTotal,
    execution,
  }) => {
    const job = await getJob(scope, jobId);
    if (!job) {
      throw new MediaPersistenceError('not_found', 'Media job not found');
    }
    if (
      clientRequestId === job.clientRequestId ||
      !jobView(job).allowedActions.retry ||
      job.executionOwner !== 'media'
    ) {
      throw new MediaPersistenceError('unsafe_retry', 'Media job cannot be safely retried');
    }
    return stage(
      {
        scope,
        request: { ...job.request, clientRequestId },
        execution: execution ?? job.execution,
        maxActiveJobs,
        maxPendingTotal,
        executionOwner: 'media',
      },
      job,
    );
  };

  const retireMediaThread: MediaMethods['retireMediaThread'] = async (scope, threadId) => {
    scopeFilter(scope);
    const thread = await Thread.findOneAndUpdate(
      { ...scope, threadId, status: 'active' },
      {
        $set: { status: 'retiring', retiredAt: new Date().toISOString() },
        $inc: { epoch: 1, version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean();
    if (!thread) {
      return !!(await Thread.exists({ ...scope, threadId }));
    }
    const now = new Date().toISOString();
    await Job.updateMany(
      { ...scope, threadId, phase: 'queued', 'provider.certainty': 'unsubmitted' },
      {
        $set: { phase: 'cancelled', cancelRequestedAt: now, updatedAt: now },
        $unset: { activeSlot: 1, leaseToken: 1, leaseOwner: 1, leaseUntil: 1 },
        $inc: { version: 1 },
      },
      { writeConcern: durable },
    );
    await Job.updateMany(
      { ...scope, threadId, phase: { $nin: terminal } },
      { $set: { cancelRequestedAt: now, updatedAt: now }, $inc: { version: 1 } },
      { writeConcern: durable },
    );
    return true;
  };

  const retireExpiredMediaThreads: MediaMethods['retireExpiredMediaThreads'] = async ({
    scope: inputScope,
    now,
    limit,
  }) => {
    const scope = scopeFilter(inputScope);
    const due = await Thread.find({ ...scope, status: 'active', expiresAt: { $lte: iso(now) } })
      .sort({ expiresAt: 1, threadId: 1 })
      .limit(positive(limit))
      .select({ threadId: 1 })
      .lean();
    for (const thread of due) {
      await retireMediaThread(scope, thread.threadId);
    }
    return due.length;
  };

  async function globalScopes(
    kind: 'job' | 'turn' | 'thread' | 'file' | 'owner' | 'write',
    query: PipelineStage.Match['$match'],
    limit: number,
  ): Promise<MediaOwnerScope[]> {
    const model = {
      job: Job,
      turn: Turn,
      thread: Thread,
      file: File,
      owner: Owner,
      write: AssetWrite,
    }[kind];
    return model.aggregate<MediaOwnerScope>([
      { $match: query },
      {
        $group: {
          _id: {
            ownerId: kind === 'file' ? { $toString: '$user' } : '$ownerId',
            tenantId: { $ifNull: ['$tenantId', null] },
          },
        },
      },
      { $project: { _id: 0, ownerId: '$_id.ownerId', tenantId: '$_id.tenantId' } },
      { $sort: { ownerId: 1, tenantId: 1 } },
      { $limit: limit + 1 },
    ]);
  }

  const listDueMediaScopes: MediaMethods['listDueMediaScopes'] = async ({ now, limit, cursor }) => {
    if (tenantStorage.getStore()?.tenantId !== SYSTEM_TENANT_ID) {
      throw new MediaPersistenceError(
        'not_found',
        'System context required for media recovery scan',
      );
    }
    positive(limit);
    const after = cursorParts(cursor);
    const query: FilterQuery<MediaStoredJob> = {
      $or: [
        { 'receipt.phase': 'preparing' },
        {
          executionOwner: 'media',
          'receipt.phase': 'accepted',
          phase: { $in: claimable },
          dueAt: { $lte: iso(now) },
        },
      ],
    };
    if (after) {
      query.$and = [
        {
          $or: [{ ownerId: { $gt: after[1] } }, { ownerId: after[1], tenantId: { $gt: after[0] } }],
        },
      ];
    }
    const [jobs, imports] = await Promise.all([
      globalScopes('job', query, limit),
      globalScopes(
        'turn',
        {
          kind: 'import',
          publicationPhase: 'preparing',
          ...(query.$and ? { $and: query.$and } : {}),
        },
        limit,
      ),
    ]);
    const unique = new Map(
      [...jobs, ...imports].map((row) => [
        canonical([row.ownerId, row.tenantId]),
        { ownerId: row.ownerId, tenantId: row.tenantId ?? null },
      ]),
    );
    const rows = [...unique.values()].sort(
      (a, b) =>
        a.ownerId.localeCompare(b.ownerId) || (a.tenantId ?? '').localeCompare(b.tenantId ?? ''),
    );
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      ...(last && (rows.length > limit || jobs.length > limit || imports.length > limit)
        ? { nextCursor: cursorOf(last.tenantId ?? '', last.ownerId) }
        : {}),
    };
  };

  const recoverMediaPublications: MediaMethods['recoverMediaPublications'] = async ({
    scope,
    limit,
    maxRetainers,
    maxTitleChars,
    temporaryRetentionMs,
  }) => {
    positive(limit);
    const [jobs, imports] = await Promise.all([
      Job.find({ ...scopeFilter(scope), 'receipt.phase': 'preparing' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean(),
      Turn.find({ ...scopeFilter(scope), kind: 'import', publicationPhase: 'preparing' })
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean(),
    ]);
    await Promise.all(
      jobs.map((job) =>
        publishMediaSubmission(scope, job.jobId, {
          maxRetainers,
          maxTitleChars,
          temporaryRetentionMs,
        }),
      ),
    );
    await Promise.all(
      imports.map((turn) =>
        publishMediaImport(scope, turn.turnId, {
          maxRetainers,
          maxTitleChars,
          temporaryRetentionMs,
        }),
      ),
    );
    return jobs.length + imports.length;
  };

  const getStoredMediaCredential: MediaMethods['getStoredMediaCredential'] = async ({
    scope,
    name,
  }) => {
    scopeFilter(scope);
    const key = (await mongoose.models.Key.findOne({
      userId: scope.ownerId,
      tenantId: scope.tenantId,
      name,
    })
      .select({ value: 1, expiresAt: 1, mediaBindingRevision: 1 })
      .lean()) as {
      value: string;
      expiresAt?: Date;
      mediaBindingRevision?: string;
      _id: unknown;
    } | null;
    return key
      ? {
          value: key.value,
          expiresAt: key.expiresAt?.toISOString() ?? null,
          id: String(key._id),
          legacyBindingRevision: key.mediaBindingRevision,
          bindingRevision: digest({
            id: String(key._id),
            value: key.value,
            expiresAt: key.expiresAt?.toISOString(),
          }),
        }
      : null;
  };

  const replaceMediaThreadTitle: MediaMethods['replaceMediaThreadTitle'] = async (input) => {
    const result = await Thread.updateOne(
      {
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        title: input.expectedTitle,
      },
      { $set: { title: input.title, updatedAt: new Date().toISOString() }, $inc: { version: 1 } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };

  const updateMediaThread: MediaMethods['updateMediaThread'] = async (input) => {
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (input.title !== undefined) {
      set.title = input.title;
    }
    if (input.coverFileId) {
      const thread = await Thread.findOne({
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        version: input.expectedVersion,
      })
        .select({ epoch: 1 })
        .lean();
      if (!thread) {
        return null;
      }
      const cover = await File.findOne({
        user: input.scope.ownerId,
        tenantId: input.scope.tenantId,
        file_id: input.coverFileId,
        mediaLifecycle: 'live',
        mediaRetainers: `thread:${input.threadId}:${thread.epoch}`,
        $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
      }).lean();
      if (!cover) {
        throw new MediaPersistenceError(
          'not_found',
          'A cover must be retained by this media thread',
        );
      }
      set.cover = toMediaAsset(cover as unknown as MediaAssetContent);
    }
    if (input.coverFileId !== undefined) {
      set.coverExplicit = true;
    }
    const row = await Thread.findOneAndUpdate(
      {
        ...scopeFilter(input.scope),
        threadId: input.threadId,
        status: 'active',
        version: input.expectedVersion,
      },
      {
        $set: set,
        $inc: { version: 1 },
        ...(input.coverFileId === null ? { $unset: { cover: 1 } } : {}),
      },
      { new: true, writeConcern: durable },
    ).lean();
    return row ? threadView(row) : null;
  };

  const reserveMediaAssetWrite: MediaMethods['reserveMediaAssetWrite'] = async (input) => {
    await ensureMediaIndexes();
    await activateMedia();
    const scope = scopeFilter(input.scope);
    const key = {
      ...scope,
      outputKey: input.outputKey,
      rendition: input.rendition,
      ingestToken: input.ingestToken,
    };
    let row = await AssetWrite.findOne(key).lean();
    if (!row) {
      await assertOwnerActive(scope);
      const now = new Date().toISOString();
      try {
        row = (
          await new AssetWrite({
            ...key,
            writeId: randomUUID(),
            fileId: `${MEDIA_FILE_ID_PREFIX}${randomUUID().slice(9)}`,
            storageKey: input.storageKey,
            source: input.source,
            storageRegion: input.storageRegion,
            filepath: input.filepath,
            renditionLocations: input.renditionLocations,
            fingerprint: input.fingerprint,
            state: 'reserved',
            createdAt: now,
            updatedAt: now,
          }).save(durable)
        ).toObject();
      } catch (error) {
        if (!duplicate(error)) {
          throw error;
        }
        row = await AssetWrite.findOne(key).lean();
      }
    }
    if (
      !row ||
      row.fingerprint !== input.fingerprint ||
      row.storageKey !== input.storageKey ||
      (row.source ?? 'local') !== (input.source ?? 'local') ||
      row.storageRegion !== input.storageRegion ||
      canonical(
        (row.renditionLocations ?? []).map(({ filepath: _path, ...location }) => location),
      ) !==
        canonical(
          (input.renditionLocations ?? []).map(({ filepath: _path, ...location }) => location),
        )
    ) {
      throw new MediaPersistenceError('conflict', 'Media asset write identity changed');
    }
    return row;
  };

  const commitMediaAssetWrite: MediaMethods['commitMediaAssetWrite'] = async ({
    scope: inputScope,
    writeId,
    content: inputContent,
  }) => {
    const scope = scopeFilter(inputScope);
    let write = await AssetWrite.findOne({ ...scope, writeId }).lean();
    if (!write || write.state === 'deleted' || (write.state === 'abandoned' && !write.asset)) {
      throw new MediaPersistenceError('not_found', 'Media asset write not found');
    }
    if (
      inputContent.file_id !== write.fileId ||
      inputContent.storageKey !== write.storageKey ||
      inputContent.source !== (write.source ?? 'local') ||
      inputContent.storageRegion !== write.storageRegion
    ) {
      throw new MediaPersistenceError('conflict', 'Media asset staging identity changed');
    }
    for (const [kind, rendition] of Object.entries(inputContent.mediaRenditions ?? {})) {
      const location = write.renditionLocations?.find((item) => item.kind === kind);
      if (
        !location ||
        location.source !== rendition.source ||
        location.storageKey !== rendition.storageKey ||
        location.storageRegion !== rendition.storageRegion
      ) {
        throw new MediaPersistenceError('conflict', 'Media rendition staging identity changed');
      }
    }
    if (write.state === 'published' || write.state === 'abandoned') {
      const asset = write.asset && (await getMediaAssetContent(scope, write.asset.file_id));
      if (!asset) {
        throw new MediaPersistenceError('retired', 'Media output identity is retired');
      }
      if (asset.contentDigest !== inputContent.contentDigest) {
        throw new MediaPersistenceError(
          'conflict',
          'Media output bytes changed for a stable identity',
        );
      }
      await releaseOwnerWork(scope, `write:${writeId}`);
      return toMediaAsset(asset);
    }
    if (write.state === 'reserved') {
      if (!(await admitOwnerWork(scope, `write:${writeId}`))) {
        throw new MediaPersistenceError('retired', 'Media account is being deleted');
      }
      // Cleanup may only claim reserved receipts. Once this CAS wins, metadata is sufficient
      // for a replacement process to finish publication without repeating the upload.
      write = await AssetWrite.findOneAndUpdate(
        { ...scope, writeId, state: 'reserved' },
        {
          $set: {
            state: 'committing',
            publicationContent: structuredClone(inputContent),
            updatedAt: new Date().toISOString(),
          },
        },
        { new: true, writeConcern: durable },
      ).lean();
      if (!write) {
        const current = await AssetWrite.findOne({ ...scope, writeId }).lean();
        if (current && ['committing', 'published'].includes(current.state)) {
          return commitMediaAssetWrite({ scope, writeId, content: inputContent });
        }
        await releaseOwnerWork(scope, `write:${writeId}`);
        throw new MediaPersistenceError('retired', 'Media upload was retired before publication');
      }
    }
    const content = write.publicationContent;
    if (!content || content.contentDigest !== inputContent.contentDigest) {
      throw new MediaPersistenceError('conflict', 'Media publication content changed');
    }
    const identity = {
      user: scope.ownerId,
      tenantId: scope.tenantId,
      mediaOutputKey: write.outputKey,
      mediaRendition: write.rendition,
    };
    try {
      try {
        await File.updateOne(
          identity,
          {
            $setOnInsert: {
              ...identity,
              ...content,
              mediaRenditionLocations: write.renditionLocations,
              file_id: write.fileId,
              mediaLifecycle: 'live',
              mediaEpoch: 1,
              mediaRetainers: [],
              mediaContentDigest: content.contentDigest,
              ...(content.hardExpiresAt
                ? { mediaHardExpiresAt: new Date(iso(content.hardExpiresAt)) }
                : {}),
            },
          },
          { upsert: true, writeConcern: durable },
        );
      } catch (error) {
        if (!duplicate(error)) {
          throw error;
        }
      }
      const file = await File.findOne(identity).lean();
      if (
        !file ||
        file.mediaLifecycle !== 'live' ||
        (file.mediaHardExpiresAt && file.mediaHardExpiresAt <= new Date())
      ) {
        throw new MediaPersistenceError('retired', 'Media output identity is retired');
      }
      if (file.mediaContentDigest !== content.contentDigest) {
        throw new MediaPersistenceError(
          'conflict',
          'Media output bytes changed for a stable identity',
        );
      }
      const asset = toMediaAsset(file as unknown as MediaAssetContent);
      await AssetWrite.updateOne(
        { ...scope, writeId, state: 'committing' },
        {
          $set: {
            state: file.file_id === write.fileId ? 'published' : 'abandoned',
            asset,
            updatedAt: new Date().toISOString(),
          },
          $unset: { publicationContent: 1 },
        },
        { writeConcern: durable },
      );
      await releaseOwnerWork(scope, `write:${writeId}`);
      return asset;
    } catch (error) {
      if (error instanceof MediaPersistenceError) {
        await AssetWrite.updateOne(
          { ...scope, writeId, state: 'committing' },
          {
            $set: { state: 'abandoned', updatedAt: new Date().toISOString() },
            $unset: { publicationContent: 1 },
          },
          { writeConcern: durable },
        );
        await releaseOwnerWork(scope, `write:${writeId}`);
      }
      throw error;
    }
  };

  const recoverMediaAssetWrites: MediaMethods['recoverMediaAssetWrites'] = async ({
    scope,
    limit,
  }) => {
    const writes = await AssetWrite.find({
      ...scopeFilter(scope),
      state: 'committing',
      publicationContent: { $exists: true },
    })
      .sort({ writeId: 1 })
      .limit(positive(limit))
      .lean();
    for (const write of writes) {
      try {
        await commitMediaAssetWrite({
          scope,
          writeId: write.writeId,
          content: write.publicationContent!,
        });
      } catch (error) {
        if (!(error instanceof MediaPersistenceError)) {
          throw error;
        }
      }
    }
    return writes.length;
  };

  const listMediaAssetWritesForCleanup: MediaMethods['listMediaAssetWritesForCleanup'] = async ({
    scope,
    limit,
    staleBefore,
    now = new Date().toISOString(),
  }) =>
    AssetWrite.find({
      ...scopeFilter(scope),
      $and: [{ $or: [{ deletionRetryAt: null }, { deletionRetryAt: { $lte: iso(now) } }] }],
      $or: [{ state: 'abandoned' }, { state: 'reserved', updatedAt: { $lte: iso(staleBefore) } }],
    })
      .sort({ updatedAt: 1, writeId: 1 })
      .limit(positive(limit))
      .lean();

  const incrementMediaAssetWriteDeletionAttempts: MediaMethods['incrementMediaAssetWriteDeletionAttempts'] =
    async ({ scope, writeId }) => {
      const write = await AssetWrite.findOneAndUpdate(
        { ...scopeFilter(scope), writeId, state: { $in: ['reserved', 'abandoned'] } },
        { $inc: { deletionAttempts: 1 } },
        { new: true, writeConcern: durable },
      )
        .select({ deletionAttempts: 1 })
        .lean();
      return write?.deletionAttempts ?? 0;
    };
  const deferMediaAssetWriteCleanup: MediaMethods['deferMediaAssetWriteCleanup'] = async ({
    scope,
    writeId,
    retryAt,
  }) => {
    await AssetWrite.updateOne(
      { ...scopeFilter(scope), writeId, state: { $in: ['reserved', 'abandoned'] } },
      { $max: { deletionRetryAt: iso(retryAt) } },
      { writeConcern: durable },
    );
  };

  const claimMediaAssetWriteDeletion: MediaMethods['claimMediaAssetWriteDeletion'] = async ({
    scope,
    writeId,
    token,
    staleBefore,
  }) => {
    const write = await AssetWrite.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        writeId,
        $or: [
          { state: { $in: ['abandoned', 'deleted'] } },
          { state: 'reserved', updatedAt: { $lte: iso(staleBefore) } },
        ],
      },
      {
        $set: { state: 'abandoned', deletionToken: token, updatedAt: new Date().toISOString() },
        $unset: { publicationContent: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean();
    if (!write) {
      return null;
    }
    await releaseOwnerWork(scope, `write:${writeId}`);
    // A receipt associated with any canonical File can never authorize byte cleanup.
    // Unique staging keys and the reserved/committing CAS exclude a late winning insert.
    if (
      await File.exists({
        user: scope.ownerId,
        tenantId: scope.tenantId,
        storageKey: write.storageKey,
        source: write.source ?? 'local',
        mediaOutputKey: { $exists: true },
      })
    ) {
      return null;
    }
    return {
      writeId,
      fileId: write.fileId,
      storageKey: write.storageKey,
      token,
      source: write.source,
      storageRegion: write.storageRegion,
      filepath: write.filepath,
      renditionLocations: write.renditionLocations,
    };
  };

  const completeMediaAssetWriteDeletion: MediaMethods['completeMediaAssetWriteDeletion'] = async ({
    scope,
    writeId,
    token,
  }) => {
    const result = await AssetWrite.updateOne(
      { ...scopeFilter(scope), writeId, state: 'abandoned', deletionToken: token },
      { $set: { state: 'deleted', updatedAt: new Date().toISOString() }, $unset: { asset: 1 } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };

  const retainMediaAsset: MediaMethods['retainMediaAsset'] = async ({
    scope,
    fileId,
    retainer,
    maxRetainers,
  }) => {
    scopeFilter(scope);
    positive(maxRetainers);
    const retainable = {
      user: scope.ownerId,
      tenantId: scope.tenantId,
      file_id: fileId,
      mediaLifecycle: 'live',
      $and: [
        {
          $or: [
            { mediaRetainers: retainer },
            { $expr: { $lt: [{ $size: { $ifNull: ['$mediaRetainers', []] } }, maxRetainers] } },
          ],
        },
        { $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }] },
      ],
    };
    // The hard deadline is immutable, so reading it ahead of the fenced write is safe.
    const file = await File.findOne(retainable).select({ mediaHardExpiresAt: 1 }).lean();
    if (!file) {
      return false;
    }
    const result = await File.updateOne(
      retainable,
      {
        $addToSet: { mediaRetainers: retainer },
        ...(file.mediaHardExpiresAt ? { $set: { expiredAt: file.mediaHardExpiresAt } } : {}),
        $unset: { expiresAt: 1, ...(file.mediaHardExpiresAt ? {} : { expiredAt: 1 }) },
      },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };
  const getMediaAssetContent: MediaMethods['getMediaAssetContent'] = async (scope, fileId) => {
    scopeFilter(scope);
    const file = await File.findOne({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      file_id: fileId,
      mediaLifecycle: 'live',
      $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
    }).lean();
    return file
      ? {
          ...toMediaAsset(file as unknown as MediaAssetContent),
          filepath: file.filepath,
          mediaRenditions: file.mediaRenditions,
          mediaRenditionLocations: file.mediaRenditionLocations,
          source: file.source,
          storageKey: file.storageKey,
          storageRegion: file.storageRegion,
          contentDigest: file.mediaContentDigest!,
          expiredAt: file.expiredAt?.toISOString() ?? null,
          hardExpiresAt: file.mediaHardExpiresAt?.toISOString() ?? null,
        }
      : null;
  };
  const releaseMediaAsset: MediaMethods['releaseMediaAsset'] = async ({
    scope,
    fileId,
    retainer,
  }) => {
    scopeFilter(scope);
    const result = await File.updateOne(
      { user: scope.ownerId, tenantId: scope.tenantId, file_id: fileId, mediaLifecycle: 'live' },
      { $pull: { mediaRetainers: retainer } },
      { writeConcern: durable },
    );
    await File.updateOne(
      {
        user: scope.ownerId,
        tenantId: scope.tenantId,
        file_id: fileId,
        mediaLifecycle: 'live',
        mediaRetainers: { $size: 0 },
      },
      { $set: { expiredAt: new Date() } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };
  const claimMediaAssetDeletion: MediaMethods['claimMediaAssetDeletion'] = async ({
    scope,
    fileId,
    token,
  }) => {
    scopeFilter(scope);
    const file = await File.findOneAndUpdate(
      {
        user: scope.ownerId,
        tenantId: scope.tenantId,
        file_id: fileId,
        $or: [
          { mediaLifecycle: 'live', mediaRetainers: { $size: 0 } },
          { mediaLifecycle: 'live', mediaHardExpiresAt: { $ne: null, $lte: new Date() } },
          { mediaLifecycle: 'retiring' },
        ],
      },
      { $set: { mediaLifecycle: 'retiring', mediaDeletionToken: token }, $inc: { mediaEpoch: 1 } },
      { new: true, writeConcern: durable },
    ).lean();
    return file
      ? {
          ...toMediaAsset(file as unknown as MediaAssetContent),
          filepath: file.filepath,
          mediaRenditions: file.mediaRenditions,
          mediaRenditionLocations: file.mediaRenditionLocations,
          source: file.source,
          storageKey: file.storageKey,
          storageRegion: file.storageRegion,
          contentDigest: file.mediaContentDigest!,
          expiredAt: file.expiredAt?.toISOString() ?? null,
          hardExpiresAt: file.mediaHardExpiresAt?.toISOString() ?? null,
        }
      : null;
  };
  const completeMediaAssetDeletion: MediaMethods['completeMediaAssetDeletion'] = async ({
    scope,
    fileId,
    token,
  }) => {
    scopeFilter(scope);
    const result = await File.updateOne(
      {
        user: scope.ownerId,
        tenantId: scope.tenantId,
        file_id: fileId,
        mediaLifecycle: 'retiring',
        mediaDeletionToken: token,
      },
      { $set: { mediaLifecycle: 'retired' } },
      { writeConcern: durable },
    );
    return result.matchedCount > 0;
  };

  const activateMedia: MediaMethods['activateMedia'] = async () => {
    await Activation.updateOne(
      { key: 'media-v1' },
      {
        $setOnInsert: {
          key: 'media-v1',
          activatedAt: new Date().toISOString(),
        },
      },
      { upsert: true, writeConcern: durable },
    );
  };
  const hasMediaActivation: MediaMethods['hasMediaActivation'] = async () =>
    !!(await Activation.exists({ key: 'media-v1' }));

  type PermitRequest = Parameters<MediaMethods['acquireMediaPermit']>[0];
  /** `permitId` is set only when this call inserted the permit, so a rollback never touches an earlier grant. */
  async function acquirePermit(
    input: PermitRequest,
  ): Promise<{ acquired: boolean; permitId?: string }> {
    const scope = scopeFilter(input.scope);
    positive(input.capacity);
    const job = await getJob(scope, input.jobId);
    if (!job || terminal.includes(job.phase) || job.receipt.phase === 'rejected') {
      return { acquired: false };
    }
    if (input.kind !== 'queue' && job.executionOwner !== 'media') {
      return { acquired: false };
    }
    let capacityIdentity: MediaOwnerScope | string = 'deployment';
    if (input.kind === 'owner') {
      capacityIdentity = scope;
    } else if (input.kind === 'integration') {
      if (!input.key) {
        throw new MediaPersistenceError(
          'invalid_input',
          'Integration capacity requires an identity',
        );
      }
      capacityIdentity = input.key;
    }
    const capacityKey = digest([input.kind, capacityIdentity]);
    const jobIdentity = digest([scope, input.jobId]);
    if (await Permit.exists({ capacityKey, jobIdentity })) {
      return { acquired: true };
    }
    const start = parseInt(jobIdentity.slice(0, 8), 16) % input.capacity;
    for (let offset = 0; offset < input.capacity; offset++) {
      const permitId = randomUUID();
      try {
        await new Permit({
          ...scope,
          permitId,
          capacityKey,
          kind: input.kind,
          slot: (start + offset) % input.capacity,
          jobId: input.jobId,
          jobIdentity,
          createdAt: new Date().toISOString(),
        }).save(durable);
        const current = await getJob(scope, input.jobId);
        if (current && !terminal.includes(current.phase)) {
          return { acquired: true, permitId };
        }
        await releaseMediaPermits({ scope, jobId: input.jobId, kind: input.kind });
        return { acquired: false };
      } catch (error) {
        if (!duplicate(error)) {
          throw error;
        }
        if (await Permit.exists({ capacityKey, jobIdentity })) {
          return { acquired: true };
        }
      }
    }
    return { acquired: false };
  }
  const acquireMediaPermit: MediaMethods['acquireMediaPermit'] = async (input) =>
    (await acquirePermit(input)).acquired;

  const acquireMediaPermits: MediaMethods['acquireMediaPermits'] = async ({
    scope: inputScope,
    jobId,
    permits,
  }) => {
    const scope = scopeFilter(inputScope);
    const inserted: string[] = [];
    const rollback = async (): Promise<void> => {
      if (!inserted.length) {
        return;
      }
      await Permit.deleteMany(
        { ...scope, jobId, permitId: { $in: inserted } },
        { writeConcern: durable },
      );
    };
    for (const permit of permits) {
      let result: Awaited<ReturnType<typeof acquirePermit>>;
      try {
        result = await acquirePermit({ scope, jobId, ...permit });
      } catch (error) {
        await rollback();
        throw error;
      }
      if (result.permitId) {
        inserted.push(result.permitId);
      }
      if (!result.acquired) {
        await rollback();
        return false;
      }
    }
    return true;
  };

  const releaseMediaPermits: MediaMethods['releaseMediaPermits'] = async ({
    scope: inputScope,
    jobId,
    kind,
  }) => {
    const scope = scopeFilter(inputScope);
    const job = await getJob(scope, jobId);
    // Worker death, an expired lease, and a cancellation intent never release remote capacity.
    if (
      !job ||
      !terminal.includes(job.phase) ||
      !['unsubmitted', 'terminal'].includes(job.provider.certainty)
    ) {
      return false;
    }
    await Permit.deleteMany(
      { ...scope, jobId, ...(kind ? { kind } : {}) },
      { writeConcern: durable },
    );
    await releaseOwnerWork(scope, `job:${jobId}`);
    return true;
  };

  const reconcileMediaPermits: MediaMethods['reconcileMediaPermits'] = async ({
    limit,
    cursor,
  }) => {
    if (tenantStorage.getStore()?.tenantId !== SYSTEM_TENANT_ID) {
      throw new MediaPersistenceError(
        'not_found',
        'System context required for media permit reconciliation',
      );
    }
    positive(limit);
    const rows = await Permit.find(cursor ? { permitId: { $gt: cursor } } : {})
      .sort({ permitId: 1 })
      .limit(limit + 1)
      .lean();
    await Promise.all(
      rows
        .slice(0, limit)
        .map((permit) => releaseMediaPermits({ scope: permit, jobId: permit.jobId })),
    );
    return {
      inspected: Math.min(rows.length, limit),
      ...(rows.length > limit ? { nextCursor: rows[limit - 1].permitId } : {}),
    };
  };

  const getMediaSourceFile: MediaMethods['getMediaSourceFile'] = async (scope, fileId) => {
    scopeFilter(scope);
    const file = await File.findOne({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      file_id: fileId,
      $and: [
        { $or: [{ mediaLifecycle: { $exists: false } }, { mediaLifecycle: 'live' }] },
        { $or: [{ expiredAt: null }, { expiredAt: { $gt: new Date() } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    }).lean();
    if (!file) {
      return null;
    }
    return {
      ...toMediaAsset(file as unknown as MediaAssetContent),
      filepath: file.filepath,
      mediaRenditions: file.mediaRenditions,
      mediaRenditionLocations: file.mediaRenditionLocations,
      source: file.source,
      storageKey: file.storageKey,
      storageRegion: file.storageRegion,
      expiredAt: file.expiredAt?.toISOString() ?? null,
      hardExpiresAt: file.mediaHardExpiresAt?.toISOString() ?? null,
      sourceRevision: digest([
        String(file._id),
        file.updatedAt?.toISOString(),
        file.storageKey,
        file.filepath,
        file.bytes,
      ]),
    };
  };

  const isMediaFile: MediaMethods['isMediaFile'] = async (scope, fileId) => {
    scopeFilter(scope);
    return !!(await File.exists({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      file_id: fileId,
      mediaOutputKey: { $exists: true },
    }));
  };

  const getPublishedMediaAsset: MediaMethods['getPublishedMediaAsset'] = async ({
    scope,
    outputKey,
    rendition,
  }) => {
    scopeFilter(scope);
    const file = await File.findOne({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      mediaOutputKey: outputKey,
      mediaRendition: rendition,
      mediaLifecycle: 'live',
      $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
    }).lean();
    if (!file) {
      return null;
    }
    const asset = toMediaAsset(file as unknown as MediaAssetContent);
    // The canonical File is the publication fact when acknowledgement of the write receipt was lost.
    const write = await AssetWrite.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        outputKey,
        rendition,
        fileId: file.file_id,
        state: { $in: ['reserved', 'committing'] },
      },
      {
        $set: { state: 'published', asset, updatedAt: new Date().toISOString() },
        $unset: { publicationContent: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean();
    if (write) {
      await releaseOwnerWork(scope, `write:${write.writeId}`);
    }
    return asset;
  };

  const retainMediaThreadAsset: MediaMethods['retainMediaThreadAsset'] = async ({
    scope,
    threadId,
    fileId,
    maxRetainers,
  }) => {
    const thread = await Thread.findOne({
      ...scopeFilter(scope),
      threadId,
      status: 'active',
    }).lean();
    if (!thread) {
      return false;
    }
    const retainer = `thread:${threadId}:${thread.epoch}`;
    if (!(await retainMediaAsset({ scope, fileId, retainer, maxRetainers }))) {
      return false;
    }
    if (
      await Thread.exists({
        ...scopeFilter(scope),
        threadId,
        status: 'active',
        epoch: thread.epoch,
      })
    ) {
      return true;
    }
    // Retirement won after the File CAS. Compensation is repeatable and cannot publish content.
    await releaseMediaAsset({ scope, fileId, retainer });
    return false;
  };

  const reconcileMediaRetirements: MediaMethods['reconcileMediaRetirements'] = async ({
    scope: inputScope,
    limit,
  }) => {
    const scope = scopeFilter(inputScope);
    const threads = await Thread.find({ ...scope, status: 'retiring' })
      .sort({ threadId: 1 })
      .limit(positive(limit))
      .lean();
    for (const thread of threads) {
      // Re-run cancellation: a staged insert may have raced the first retirement sweep.
      await Job.updateMany(
        {
          ...scope,
          threadId: thread.threadId,
          phase: 'queued',
          'provider.certainty': 'unsubmitted',
        },
        {
          $set: { phase: 'cancelled', cancelRequestedAt: new Date().toISOString() },
          $unset: { activeSlot: 1, leaseToken: 1, leaseOwner: 1, leaseUntil: 1 },
          $inc: { version: 1 },
        },
        { writeConcern: durable },
      );
      if (
        await Job.exists({
          ...scope,
          threadId: thread.threadId,
          $or: [
            { phase: { $nin: terminal } },
            { 'accounting.phase': 'held' },
            { 'provider.certainty': { $nin: ['unsubmitted', 'terminal'] } },
          ],
        })
      ) {
        continue;
      }
      if (
        await Job.exists({
          ...scope,
          threadId: thread.threadId,
          executionOwner: 'chat',
          nativeSource: { $exists: true },
          nativeConsumers: { $exists: false },
        })
      ) {
        continue;
      }
      const unlinkStamp = `thread:${thread.threadId}:${thread.epoch - 1}`;
      await File.updateMany(
        {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          mediaLifecycle: 'live',
          mediaRetainers: `thread:${thread.threadId}:${thread.epoch - 1}`,
        },
        {
          $pull: { mediaRetainers: `thread:${thread.threadId}:${thread.epoch - 1}` },
          $set: { mediaUnlinkedAt: unlinkStamp },
        },
        { writeConcern: durable },
      );
      await File.updateMany(
        {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          mediaLifecycle: 'live',
          mediaUnlinkedAt: unlinkStamp,
          mediaRetainers: { $size: 0 },
        },
        { $set: { expiredAt: new Date() } },
        { writeConcern: durable },
      );
      await Thread.updateOne(
        { ...scope, threadId: thread.threadId, status: 'retiring', epoch: thread.epoch },
        { $set: { status: 'retired' }, $inc: { version: 1 } },
        { writeConcern: durable },
      );
      await purgeMediaThreadPayloads({ scope, threadId: thread.threadId });
    }
    const unfinished = await Thread.find({
      ...scope,
      status: 'retired',
      payloadPurgedAt: { $exists: false },
    })
      .select({ threadId: 1 })
      .sort({ threadId: 1 })
      .limit(positive(limit))
      .lean();
    for (const thread of unfinished) {
      await purgeMediaThreadPayloads({ scope, threadId: thread.threadId });
    }
    return threads.length;
  };

  const purgeMediaThreadPayloads: MediaMethods['purgeMediaThreadPayloads'] = async ({
    scope: inputScope,
    threadId,
  }) => {
    const scope = scopeFilter(inputScope);
    if (!(await Thread.exists({ ...scope, threadId, status: 'retired' }))) {
      return false;
    }
    if (
      await Job.exists({
        ...scope,
        threadId,
        $or: [
          { phase: { $nin: terminal } },
          { 'accounting.phase': 'held' },
          { 'provider.certainty': { $nin: ['unsubmitted', 'terminal'] } },
        ],
      })
    ) {
      return false;
    }
    const now = new Date().toISOString();
    await Job.updateMany(
      {
        ...scope,
        threadId,
        executionOwner: 'chat',
        nativeRetentionState: { $ne: 'purged' },
        $or: [{ nativeConsumers: { $size: 0 } }, { 'nativeSource.expiresAt': { $lte: now } }],
      },
      { $set: { nativeRetentionState: 'purging' } },
      { writeConcern: durable },
    );
    const nativeJobs = await Job.find({
      ...scope,
      threadId,
      executionOwner: 'chat',
      nativeRetentionState: 'purging',
    })
      .select({ jobId: 1 })
      .lean();
    for (const job of nativeJobs) {
      await createMediaNativePartModel(mongoose).deleteMany(
        { ...scope, jobId: job.jobId },
        { writeConcern: durable },
      );
      const retainer = `native:${job.jobId}`;
      const files = await File.find({
        user: scope.ownerId,
        tenantId: scope.tenantId,
        mediaLifecycle: 'live',
        mediaRetainers: retainer,
      })
        .select({ file_id: 1 })
        .lean();
      for (const file of files) {
        await releaseMediaAsset({ scope, fileId: file.file_id, retainer });
      }
      await Job.updateOne(
        { ...scope, jobId: job.jobId, nativeRetentionState: 'purging' },
        { $set: { nativeRetentionState: 'purged', nativeConsumers: [] } },
        { writeConcern: durable },
      );
    }
    await Job.updateMany(
      {
        ...scope,
        threadId,
        payloadPurgedAt: { $exists: false },
        $or: [{ executionOwner: 'media' }, { nativeRetentionState: 'purged' }],
      },
      [
        {
          $set: {
            request: {
              clientRequestId: '$clientRequestId',
              operation: '$operation',
              selection: '$selection',
              prompt: '',
              inputs: [],
              parameters: { count: 1 },
            },
            outputs: [],
            payloadPurgedAt: now,
          },
        },
        { $unset: ['provider.recovery', 'nativePartKeys', 'nativePartBytes'] },
      ],
      { writeConcern: durable },
    );
    await Turn.updateMany(
      { ...scope, threadId },
      { $set: { prompt: '', inputs: [] }, $unset: { importRequest: 1, importIdentityRequest: 1 } },
      { writeConcern: durable },
    );
    await Thread.updateOne(
      { ...scope, threadId, status: 'retired' },
      { $set: { title: '', payloadPurgedAt: now }, $unset: { cover: 1 } },
      { writeConcern: durable },
    );
    return true;
  };

  const prepareMediaAccountDeletion: MediaMethods['prepareMediaAccountDeletion'] = async ({
    scope: inputScope,
    token,
  }) => {
    const scope = scopeFilter(inputScope);
    if (!token) {
      throw new MediaPersistenceError('invalid_input', 'Account deletion requires a token');
    }
    await ensureMediaIndexes();
    await ensureOwner(scope);
    const owner = await Owner.findOneAndUpdate(
      { ...scope, $or: [{ status: 'active' }, { status: 'deleting', deletionToken: token }] },
      { $set: { status: 'deleting', deletionToken: token, updatedAt: new Date().toISOString() } },
      { new: true, writeConcern: durable },
    ).lean();
    if (!owner) {
      return false;
    }
    const jobIds = owner.workIds.filter((id) => id.startsWith('job:')).map((id) => id.slice(4));
    const importIds = owner.workIds
      .filter((id) => id.startsWith('import:'))
      .map((id) => id.slice(7));
    const writeIds = owner.workIds.filter((id) => id.startsWith('write:')).map((id) => id.slice(6));
    // A writer that has not won its publication CAS can be cancelled under the owner fence.
    // A committing writer keeps its grant until recovery publishes or rejects its original.
    await AssetWrite.updateMany(
      { ...scope, writeId: { $in: writeIds }, state: 'reserved' },
      { $set: { state: 'abandoned', updatedAt: new Date().toISOString() } },
      { writeConcern: durable },
    );
    const admissionIds = owner.workIds
      .filter((id) => id.startsWith('accounting:'))
      .map((id) => id.slice(11));
    const [settledJobs, publishedImports, terminalWrites, closedAdmissions] = await Promise.all([
      Job.find({
        ...scope,
        jobId: { $in: jobIds },
        phase: { $in: terminal },
        'provider.certainty': { $in: ['unsubmitted', 'terminal'] },
      })
        .select({ jobId: 1 })
        .lean(),
      Turn.find({
        ...scope,
        turnId: { $in: importIds },
        publicationPhase: { $in: ['accepted', 'rejected'] },
      })
        .select({ turnId: 1 })
        .lean(),
      AssetWrite.find({
        ...scope,
        writeId: { $in: writeIds },
        state: { $in: ['published', 'abandoned', 'deleted'] },
      })
        .select({ writeId: 1 })
        .lean(),
      createMediaSettlementModel(mongoose)
        .find({ ...scope, settlementId: { $in: admissionIds }, balanceAcknowledged: true })
        .select({ settlementId: 1 })
        .lean(),
    ]);
    const completed = [
      ...settledJobs.map((job) => `job:${job.jobId}`),
      ...publishedImports.map((turn) => `import:${turn.turnId}`),
      ...terminalWrites.map((write) => `write:${write.writeId}`),
      ...closedAdmissions.map((record) => `accounting:${record.settlementId}`),
    ];
    if (completed.length) {
      await Owner.updateOne(
        { ...scope, status: 'deleting', deletionToken: token },
        { $pull: { workIds: { $in: completed } } },
        { writeConcern: durable },
      );
    }
    // No new grant can appear behind this fence. Staged rows without a grant cannot publish or execute.
    const [pendingGrant, activeJob] = await Promise.all([
      Owner.exists({
        ...scope,
        status: 'deleting',
        deletionToken: token,
        'workIds.0': { $exists: true },
      }),
      Job.exists({ ...scope, phase: { $nin: terminal } }),
    ]);
    if (pendingGrant || activeJob) {
      return false;
    }
    const prepared = await Owner.updateOne(
      { ...scope, status: 'deleting', deletionToken: token, workIds: { $size: 0 } },
      { $set: { deletionPrepared: true } },
      { writeConcern: durable },
    );
    return prepared.matchedCount > 0;
  };

  const cancelMediaAccountDeletion: MediaMethods['cancelMediaAccountDeletion'] = async ({
    scope,
    token,
  }) => {
    await Owner.updateOne(
      { ...scopeFilter(scope), status: 'deleting', deletionToken: token },
      {
        $set: { status: 'active', updatedAt: new Date().toISOString() },
        $unset: { deletionToken: 1, deletionPrepared: 1 },
      },
      { writeConcern: durable },
    );
  };

  const purgeDeletedAccountAccounting = async (scope: MediaOwnerScope) => {
    await accounting.deleteMediaAccountingHistory(scope);
    await Promise.all([
      createBalanceModel(mongoose).deleteMany(
        {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          'mediaHolds.0': { $exists: false },
          mediaPendingSettlement: null,
        },
        { writeConcern: durable },
      ),
      createTransactionModel(mongoose).deleteMany(
        {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          context: { $in: ['media', 'media_debt'] },
        },
        { writeConcern: durable },
      ),
    ]);
  };

  const completeMediaAccountDeletion: MediaMethods['completeMediaAccountDeletion'] = async ({
    scope,
    token,
  }) => {
    const completed = await Owner.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        deletionToken: token,
        deletionPrepared: true,
        status: { $in: ['deleting', 'deleted'] },
        workIds: { $size: 0 },
      },
      { $set: { status: 'deleted', updatedAt: new Date().toISOString() } },
      { new: true, writeConcern: durable },
    ).lean();
    if (!completed) {
      throw new MediaPersistenceError('conflict', 'Media account deletion fence changed');
    }
    await purgeDeletedAccountAccounting(scope);
    // No User lookup: this durable cleanup identity remains valid after the User is removed.
    await Thread.updateMany(
      { ...scopeFilter(scope), status: 'active' },
      {
        $set: { status: 'retiring', retiredAt: new Date().toISOString() },
        $inc: { epoch: 1, version: 1 },
      },
      { writeConcern: durable },
    );
    await Preset.deleteMany(scopeFilter(scope), { writeConcern: durable });
  };

  const reconcileMediaAccountDeletion: MediaMethods['reconcileMediaAccountDeletion'] = async ({
    scope: inputScope,
    limit,
  }) => {
    const scope = scopeFilter(inputScope);
    positive(limit);
    const owner = await Owner.findOne({
      ...scope,
      status: { $in: ['deleting', 'deleted'] },
    }).lean();
    if (!owner) {
      return 0;
    }
    if (owner.status === 'deleting') {
      // Recover a crash after User removal but before the final media acknowledgement.
      if (
        !owner.deletionPrepared ||
        !owner.deletionToken ||
        !mongoose.models.User ||
        (await mongoose.models.User.exists({ _id: scope.ownerId, tenantId: scope.tenantId }))
      ) {
        return 0;
      }
      await completeMediaAccountDeletion({ scope, token: owner.deletionToken });
    } else {
      await purgeDeletedAccountAccounting(scope);
    }
    const now = new Date().toISOString();
    // Repeated sweeps also catch pre-fence request handlers whose staged write acknowledged late.
    await Thread.updateMany(
      { ...scope, status: 'active' },
      { $set: { status: 'retiring', retiredAt: now }, $inc: { epoch: 1, version: 1 } },
      { writeConcern: durable },
    );
    await Job.updateMany(
      { ...scope, phase: 'queued', 'provider.certainty': 'unsubmitted' },
      {
        $set: {
          phase: 'cancelled',
          'receipt.phase': 'rejected',
          'receipt.error': { code: 'not_found' },
          updatedAt: now,
        },
        $unset: { activeSlot: 1, leaseToken: 1, leaseOwner: 1, leaseUntil: 1 },
        $inc: { version: 1 },
      },
      { writeConcern: durable },
    );
    await File.updateMany(
      { user: scope.ownerId, tenantId: scope.tenantId, mediaLifecycle: 'live' },
      { $set: { mediaRetainers: [], expiredAt: new Date(now) } },
      { writeConcern: durable },
    );
    await reconcileMediaRetirements({ scope, limit });
    // Retired File tombstones retain storage identity until byte deletion is acknowledged.
    // Owner tombstones are permanent, so a delayed pre-fence writer is caught by a later sweep.
    const jobs = await Job.find({
      ...scope,
      phase: { $in: terminal },
      'provider.certainty': { $in: ['unsubmitted', 'terminal'] },
      'accounting.phase': { $ne: 'held' },
    })
      .select({ jobId: 1 })
      .sort({ jobId: 1 })
      .limit(limit)
      .lean();
    for (const job of jobs) {
      await releaseMediaPermits({ scope, jobId: job.jobId });
    }
    if (jobs.length) {
      const jobIds = jobs.map((job) => job.jobId);
      await createMediaNativePartModel(mongoose).deleteMany(
        { ...scope, jobId: { $in: jobIds } },
        { writeConcern: durable },
      );
      await Job.deleteMany({ ...scope, jobId: { $in: jobIds } }, { writeConcern: durable });
    }
    const turns = await Turn.find(scope)
      .select({ turnId: 1 })
      .sort({ turnId: 1 })
      .limit(limit)
      .lean();
    await Turn.deleteMany(
      { ...scope, turnId: { $in: turns.map((turn) => turn.turnId) } },
      { writeConcern: durable },
    );
    const threads = await Thread.find({ ...scope, status: 'retired' })
      .select({ threadId: 1 })
      .sort({ threadId: 1 })
      .limit(limit)
      .lean();
    await Thread.deleteMany(
      { ...scope, threadId: { $in: threads.map((thread) => thread.threadId) } },
      { writeConcern: durable },
    );
    // Bypass only the legacy File tombstone-preservation hook after acknowledged byte retirement.
    // The permanent account tombstone prevents reuse of these owner identities.
    const retiredFiles = await File.find({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      mediaLifecycle: 'retired',
    })
      .select({ _id: 1, file_id: 1 })
      .limit(limit)
      .lean();
    if (retiredFiles.length) {
      // eslint-disable-next-line no-restricted-syntax -- Trusted tenant/owner/id-scoped byte-retirement cleanup; legacy delete hooks preserve these tombstones.
      await File.collection.deleteMany(
        {
          _id: { $in: retiredFiles.map((file) => file._id) },
          user: new mongoose.Types.ObjectId(scope.ownerId),
          tenantId: scope.tenantId,
          mediaLifecycle: 'retired',
        },
        { writeConcern: durable },
      );
      await AssetWrite.deleteMany(
        { ...scope, state: 'published', fileId: { $in: retiredFiles.map((file) => file.file_id) } },
        { writeConcern: durable },
      );
    }
    // Keep minimal deleted-write tombstones: a paused uploader can still resume and needs
    // its unique storage key to authorize explicit cleanup after account deletion.
    return jobs.length + turns.length + threads.length;
  };

  const listMediaExpiredAssets: MediaMethods['listMediaExpiredAssets'] = async ({
    scope,
    limit,
    now,
  }) => {
    scopeFilter(scope);
    const files = await File.find({
      user: scope.ownerId,
      tenantId: scope.tenantId,
      $and: [
        { $or: [{ deletionRetryAt: null }, { deletionRetryAt: { $lte: new Date(iso(now)) } }] },
      ],
      $or: [
        {
          mediaLifecycle: 'live',
          mediaRetainers: { $size: 0 },
          expiredAt: { $ne: null, $lte: new Date(iso(now)) },
        },
        { mediaLifecycle: 'live', mediaHardExpiresAt: { $ne: null, $lte: new Date(iso(now)) } },
        { mediaLifecycle: 'retiring' },
      ],
    })
      .sort({ file_id: 1 })
      .limit(positive(limit))
      .lean();
    return files.map((file) => ({
      ...toMediaAsset(file as unknown as MediaAssetContent),
      source: file.source,
      storageKey: file.storageKey,
      storageRegion: file.storageRegion,
      expiredAt: file.expiredAt?.toISOString() ?? null,
      hardExpiresAt: file.mediaHardExpiresAt?.toISOString() ?? null,
      sourceRevision: digest([String(file._id), file.mediaEpoch]),
    }));
  };

  const listMediaCleanupScopes: MediaMethods['listMediaCleanupScopes'] = async ({
    limit,
    cursor,
    now,
  }) => {
    if (tenantStorage.getStore()?.tenantId !== SYSTEM_TENANT_ID) {
      throw new MediaPersistenceError('not_found', 'System context required for media cleanup');
    }
    positive(limit);
    const after = cursorParts(cursor);
    const threadAfter = after
      ? {
          $or: [{ ownerId: { $gt: after[1] } }, { ownerId: after[1], tenantId: { $gt: after[0] } }],
        }
      : {};
    const fileAfter = after
      ? {
          $or: [
            { user: { $gt: new mongoose.Types.ObjectId(after[1]) } },
            { user: new mongoose.Types.ObjectId(after[1]), tenantId: { $gt: after[0] } },
          ],
        }
      : {};
    const [threads, expiring, files, nativeJobs, deletedOwners, assetWrites] = await Promise.all([
      globalScopes(
        'thread',
        {
          $and: [
            threadAfter,
            {
              $or: [
                { status: 'retiring' },
                { status: 'retired', payloadPurgedAt: { $exists: false } },
              ],
            },
          ],
        },
        limit,
      ),
      globalScopes(
        'thread',
        { status: 'active', expiresAt: { $lte: iso(now) }, ...threadAfter },
        limit,
      ),
      globalScopes(
        'file',
        {
          $and: [
            fileAfter,
            { $or: [{ deletionRetryAt: null }, { deletionRetryAt: { $lte: new Date(iso(now)) } }] },
            {
              $or: [
                {
                  mediaLifecycle: 'live',
                  mediaRetainers: { $size: 0 },
                  expiredAt: { $ne: null, $lte: new Date(iso(now)) },
                },
                {
                  mediaLifecycle: 'live',
                  mediaHardExpiresAt: { $ne: null, $lte: new Date(iso(now)) },
                },
                { mediaLifecycle: 'retiring' },
              ],
            },
          ],
        },
        limit,
      ),
      globalScopes(
        'job',
        {
          executionOwner: 'chat',
          $and: [
            threadAfter,
            {
              $or: [
                { phase: { $in: ['queued', 'running'] } },
                { nativeRetentionState: 'purging' },
                { nativeCleanupPending: true },
                { nativeConsumersTracked: true, nativeRetentionState: { $ne: 'purged' } },
                { phase: 'reconciling', 'recoveryDecisions.request.action': 'acknowledge' },
                { nativeSource: { $exists: true }, nativeConsumers: { $exists: false } },
                {
                  'nativeSource.expiresAt': { $lte: iso(now) },
                  nativeRetentionState: { $ne: 'purged' },
                },
              ],
            },
          ],
        },
        limit,
      ),
      globalScopes('owner', { status: { $in: ['deleting', 'deleted'] }, ...threadAfter }, limit),
      globalScopes(
        'write',
        {
          state: { $in: ['reserved', 'committing', 'abandoned'] },
          $and: [
            threadAfter,
            { $or: [{ deletionRetryAt: null }, { deletionRetryAt: { $lte: iso(now) } }] },
          ],
        },
        limit,
      ),
    ]);
    const scopes = [
      ...threads,
      ...expiring,
      ...nativeJobs,
      ...deletedOwners,
      ...assetWrites,
      ...files,
    ];
    const rows = [...new Map(scopes.map((scope) => [canonical(scope), scope])).values()].sort(
      (a, b) =>
        a.ownerId.localeCompare(b.ownerId) || (a.tenantId ?? '').localeCompare(b.tenantId ?? ''),
    );
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      ...(last &&
      (rows.length > limit ||
        threads.length > limit ||
        expiring.length > limit ||
        files.length > limit ||
        nativeJobs.length > limit ||
        deletedOwners.length > limit ||
        assetWrites.length > limit)
        ? { nextCursor: cursorOf(last.tenantId ?? '', last.ownerId) }
        : {}),
    };
  };

  return {
    prepareMediaAccountDeletion,
    cancelMediaAccountDeletion,
    completeMediaAccountDeletion,
    reconcileMediaAccountDeletion,
    activateMedia,
    hasMediaActivation,
    ensureMediaIndexes,
    stageMediaSubmission: (input) => stage(input),
    publishMediaSubmission,
    getMediaSubmission: async (scope, clientRequestId) =>
      (await Job.findOne({ ...scopeFilter(scope), clientRequestId }).lean())?.receipt ?? null,
    stageMediaImport,
    publishMediaImport,
    getMediaImport: async (scope, clientRequestId) =>
      (await Turn.findOne({ ...scopeFilter(scope), kind: 'import', clientRequestId }).lean())
        ?.importReceipt ?? null,
    getMediaThread,
    listMediaThreads,
    listMediaTurns,
    getMediaLatestImageContext,
    listMediaTurnJobs,
    getMediaJob: getJob,
    getMediaParentContext: async (scope, threadId, parentTurnId) => {
      if (!(await Thread.exists({ ...scopeFilter(scope), threadId, status: 'active' }))) {
        return null;
      }
      return Job.findOne({
        ...scopeFilter(scope),
        threadId,
        turnId: parentTurnId,
        phase: 'succeeded',
        'receipt.phase': 'accepted',
      })
        .sort({ createdAt: -1, jobId: -1 })
        .lean<MediaStoredJob | null>();
    },
    getMediaJobView: async (scope, jobId) => {
      const job = await getJob(scope, jobId);
      return job &&
        (await Thread.exists({ ...scopeFilter(scope), threadId: job.threadId, status: 'active' }))
        ? jobView(job)
        : null;
    },
    updateMediaThread,
    replaceMediaThreadTitle,
    claimMediaJob,
    renewMediaJob,
    beginMediaSubmission,
    recordMediaJobObservation,
    cancelMediaJob,
    retryMediaJob,
    retireMediaThread,
    listDueMediaScopes,
    recoverMediaPublications,
    getStoredMediaCredential,
    reserveMediaAssetWrite,
    commitMediaAssetWrite,
    recoverMediaAssetWrites,
    listMediaAssetWritesForCleanup,
    incrementMediaAssetWriteDeletionAttempts,
    deferMediaAssetWriteCleanup,
    claimMediaAssetWriteDeletion,
    completeMediaAssetWriteDeletion,
    getMediaAsset,
    getMediaAssetContent,
    getMediaSourceFile,
    isMediaFile,
    retainMediaThreadAsset,
    getPublishedMediaAsset,
    retainMediaAsset,
    releaseMediaAsset,
    claimMediaAssetDeletion,
    completeMediaAssetDeletion,
    acquireMediaPermit,
    acquireMediaPermits,
    releaseMediaPermits,
    reconcileMediaPermits,
    listMediaCleanupScopes,
    reconcileMediaRetirements,
    purgeMediaThreadPayloads,
    retireExpiredMediaThreads,
    listMediaExpiredAssets,
  };
}
