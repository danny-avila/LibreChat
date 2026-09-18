import { createHash, randomUUID } from 'crypto';
import type { MediaOutput } from 'librechat-data-provider';
import type {
  MediaNativeMethods,
  MediaNativePart,
  MediaNativePartDocument,
} from '~/types/mediaNative';
import type {
  MediaMethods,
  MediaOwnerScope,
  MediaStoredJob,
  MediaProviderState,
} from '~/types/media';
import { createMediaJobModel, createMediaThreadModel } from '~/models/media';
import { tenantStorage, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { createMediaNativePartModel } from '~/models/mediaNativePart';
import { createIndexesWithRetry } from '~/utils/retry';
import { createFileModel } from '~/models/file';
import { MediaPersistenceError } from './media';

const durable = { w: 'majority' as const, j: true };
function scopeFilter(scope: MediaOwnerScope): MediaOwnerScope {
  const current = tenantStorage.getStore()?.tenantId;
  if (
    !scope.ownerId ||
    scope.tenantId === '' ||
    scope.tenantId === SYSTEM_TENANT_ID ||
    (current && current !== SYSTEM_TENANT_ID && current !== scope.tenantId)
  ) {
    throw new MediaPersistenceError('not_found', 'Native recording owner scope is unavailable');
  }
  return { ownerId: scope.ownerId, tenantId: scope.tenantId ?? null };
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function duplicate(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
}
function canonicalPart(part: MediaNativePart): MediaNativePart {
  const thoughtSignature =
    part.thoughtSignature !== undefined ? { thoughtSignature: part.thoughtSignature } : {};
  if (part.kind === 'text' && typeof part.text === 'string') {
    return { kind: 'text', text: part.text, ...thoughtSignature };
  }
  if (
    part.kind === 'image' &&
    typeof part.fileId === 'string' &&
    part.mimeType.startsWith('image/')
  ) {
    return { kind: 'image', fileId: part.fileId, mimeType: part.mimeType, ...thoughtSignature };
  }
  throw new MediaPersistenceError('invalid_input', 'Unsupported native media part');
}

/** Records one existing chat invocation. These methods never acquire execution or billing authority. */
export function createMediaNativeMethods(
  mongoose: typeof import('mongoose'),
  media: MediaMethods,
): MediaNativeMethods {
  const Part = createMediaNativePartModel(mongoose);
  const Job = createMediaJobModel(mongoose);
  const Thread = createMediaThreadModel(mongoose);
  const File = createFileModel(mongoose);

  const ensureMediaNativeIndexes: MediaNativeMethods['ensureMediaNativeIndexes'] = async () => {
    await createIndexesWithRetry(Part);
  };

  const startMediaNativeRecording: MediaNativeMethods['startMediaNativeRecording'] = async (
    input,
  ) => {
    const scope = scopeFilter(input.scope);
    if (Object.values(input.limits).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native recording limits');
    }
    if (input.source.expiresAt && !(Date.parse(input.source.expiresAt) > Date.now())) {
      throw new MediaPersistenceError('retired', 'Native source retention expired');
    }
    await ensureMediaNativeIndexes();
    const clientRequestId = `native:${hash([scope, input.source.conversationId, input.source.messageId, input.source.modelRunId])}`;
    const receipt = await media.stageMediaSubmission({
      scope,
      request: { ...input.request, clientRequestId },
      execution: input.execution,
      executionOwner: 'chat',
      maxActiveJobs: 1,
      maxPendingTotal: 1,
    });
    const published = await media.publishMediaSubmission(scope, receipt.jobId, {
      maxRetainers: input.maxRetainers,
      maxTitleChars: input.maxTitleChars,
    });
    if (published?.phase !== 'accepted') {
      throw new MediaPersistenceError(
        'retired',
        'Native recording could not publish its linked thread',
      );
    }
    await Job.updateOne(
      {
        ...scope,
        jobId: receipt.jobId,
        executionOwner: 'chat',
        phase: 'queued',
        nativeSource: { $exists: false },
      },
      {
        $set: {
          nativeSource: input.source,
          nativeLimits: input.limits,
          nativePartKeys: [],
          nativePartBytes: 0,
          phase: 'running',
          provider: { certainty: 'unknown' },
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
      { writeConcern: durable },
    );
    const job = await media.getMediaJob(scope, receipt.jobId);
    if (
      !job ||
      job.executionOwner !== 'chat' ||
      !job.nativeSource ||
      job.nativeSource.conversationId !== input.source.conversationId ||
      job.nativeSource.messageId !== input.source.messageId ||
      job.nativeSource.modelRunId !== input.source.modelRunId ||
      job.nativeSource.expiresAt !== input.source.expiresAt
    ) {
      throw new MediaPersistenceError('conflict', 'Native invocation identity changed');
    }
    return job;
  };

  const recordMediaNativePart: MediaNativeMethods['recordMediaNativePart'] = async (input) => {
    const scope = scopeFilter(input.scope);
    if (
      ![input.chunkIndex, input.partIndex].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    ) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native part position');
    }
    const part = canonicalPart(input.part);
    const fingerprint = hash(part);
    const bytes = Buffer.byteLength(JSON.stringify(part), 'utf8');
    const key = `${input.chunkIndex}:${input.partIndex}`;
    const identity = {
      ...scope,
      jobId: input.jobId,
      chunkIndex: input.chunkIndex,
      partIndex: input.partIndex,
    };
    const existing = await Part.findOne(identity).lean();
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new MediaPersistenceError('conflict', 'Native part bytes changed');
      }
      return { continuationRef: existing.continuationRef };
    }
    let job = await media.getMediaJob(scope, input.jobId);
    if (
      !job?.nativeLimits ||
      job.executionOwner !== 'chat' ||
      !['running', 'requires_attention'].includes(job.phase) ||
      (job.nativeSource?.expiresAt && Date.parse(job.nativeSource.expiresAt) <= Date.now())
    ) {
      throw new MediaPersistenceError('retired', 'Native invocation cannot accept more parts');
    }
    if (bytes > job.nativeLimits.maxPartBytes) {
      throw new MediaPersistenceError('capacity', 'Native part exceeds its storage limit');
    }
    if (part.kind === 'image') {
      const file = await media.getMediaAssetContent(scope, part.fileId);
      if (
        !file ||
        file.type !== part.mimeType ||
        !(await media.retainMediaThreadAsset({
          scope,
          threadId: job.threadId,
          fileId: part.fileId,
          maxRetainers: input.maxRetainers,
        }))
      ) {
        throw new MediaPersistenceError('retired', 'Native original is unavailable');
      }
    }
    const reserved = job.nativePartKeys?.find((entry) => entry.key === key);
    if (reserved && reserved.fingerprint !== fingerprint) {
      throw new MediaPersistenceError('conflict', 'Native part reservation changed');
    }
    if (!reserved) {
      job = await Job.findOneAndUpdate(
        {
          ...scope,
          jobId: input.jobId,
          executionOwner: 'chat',
          phase: { $in: ['running', 'requires_attention'] },
          'nativePartKeys.key': { $ne: key },
          $expr: {
            $and: [
              { $lt: [{ $size: '$nativePartKeys' }, job.nativeLimits.maxParts] },
              { $lte: [{ $add: ['$nativePartBytes', bytes] }, job.nativeLimits.maxRecordingBytes] },
            ],
          },
        },
        {
          $push: { nativePartKeys: { key, fingerprint, bytes } },
          $inc: { nativePartBytes: bytes, version: 1 },
          $set: {
            phase: 'running',
            updatedAt: new Date().toISOString(),
            'provider.certainty': 'submitted',
          },
        },
        { new: true, writeConcern: durable },
      ).lean<MediaStoredJob | null>();
      if (!job) {
        const current = await media.getMediaJob(scope, input.jobId);
        const winner = current?.nativePartKeys?.find((entry) => entry.key === key);
        if (!winner || winner.fingerprint !== fingerprint) {
          throw new MediaPersistenceError(
            winner ? 'conflict' : 'capacity',
            'Native recording reservation could not be accepted',
          );
        }
        job = current;
      }
    }
    const record: MediaNativePartDocument = {
      ...identity,
      continuationRef: randomUUID(),
      fingerprint,
      part,
      ...(part.kind === 'image' ? { fileId: part.fileId } : {}),
      createdAt: new Date().toISOString(),
      ...(job?.nativeSource?.expiresAt ? { expiresAt: new Date(job.nativeSource.expiresAt) } : {}),
    };
    try {
      await new Part(record).save(durable);
      return { continuationRef: record.continuationRef };
    } catch (error) {
      if (!duplicate(error)) {
        throw error;
      }
      const winner = await Part.findOne(identity).lean();
      if (!winner || winner.fingerprint !== fingerprint) {
        throw new MediaPersistenceError('conflict', 'Native part identity changed');
      }
      return { continuationRef: winner.continuationRef };
    }
  };

  async function materialize(
    job: MediaStoredJob,
    allowIncomplete = false,
  ): Promise<{ outputs: MediaOutput[]; recovery: MediaProviderState['recovery'] }> {
    const parts = await Part.find({ ...scopeFilter(job), jobId: job.jobId })
      .sort({ chunkIndex: 1, partIndex: 1 })
      .limit(job.nativeLimits!.maxParts)
      .lean();
    if (!allowIncomplete && parts.length !== job.nativePartKeys?.length) {
      throw new MediaPersistenceError('conflict', 'Native part publication is incomplete');
    }
    const outputs: MediaOutput[] = [];
    const recoveryParts: NonNullable<MediaProviderState['recovery']>['parts'] = [];
    const fileIds = parts.flatMap((entry) =>
      entry.part.kind === 'image' ? [entry.part.fileId] : [],
    );
    const files = fileIds.length
      ? await File.find({
          user: job.ownerId,
          tenantId: job.tenantId,
          file_id: { $in: fileIds },
          mediaLifecycle: 'live',
          $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: new Date() } }],
        }).lean()
      : [];
    const assets = new Map(
      files.map((file) => [
        file.file_id,
        {
          file_id: file.file_id,
          filename: file.filename,
          type: file.type,
          bytes: file.bytes,
          filepath: file.filepath,
          ...(file.width !== undefined ? { width: file.width } : {}),
          ...(file.height !== undefined ? { height: file.height } : {}),
        },
      ]),
    );
    parts.forEach((entry, ordinal) => {
      const part = entry.part;
      if (part.kind === 'text') {
        recoveryParts.push({
          kind: 'text',
          ordinal,
          text: part.text,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        });
        const previous = outputs[outputs.length - 1];
        if (previous?.kind === 'text') {
          previous.text += part.text;
        } else {
          outputs.push({ kind: 'text', outputId: entry.continuationRef, ordinal, text: part.text });
        }
      } else {
        recoveryParts.push({
          kind: 'image',
          ordinal,
          type: part.mimeType,
          fileId: part.fileId,
          ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
        });
        const asset = assets.get(part.fileId);
        outputs.push({
          kind: 'image',
          ordinal,
          outputId: entry.continuationRef,
          state: asset ? 'ready' : 'expired',
          ...(asset ? { asset } : { error: { code: 'output_expired' as const } }),
        });
      }
    });
    return { outputs, recovery: { parts: recoveryParts, terminalStatus: 'completed' } };
  }

  const completeMediaNativeRecording: MediaNativeMethods['completeMediaNativeRecording'] = async ({
    scope,
    jobId,
  }) => {
    scopeFilter(scope);
    const job = await media.getMediaJob(scope, jobId);
    if (!job?.nativeLimits || job.executionOwner !== 'chat') {
      return null;
    }
    if (!['running', 'requires_attention'].includes(job.phase)) {
      await refreshThread(job);
      return job;
    }
    const content = await materialize(job);
    const completed = await Job.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        jobId,
        executionOwner: 'chat',
        phase: { $in: ['running', 'requires_attention'] },
        version: job.version,
      },
      {
        $set: {
          phase: 'succeeded',
          outputs: content.outputs,
          provider: { certainty: 'terminal', recovery: content.recovery },
          updatedAt: new Date().toISOString(),
        },
        $unset: { error: 1 },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
    if (!completed) {
      throw new MediaPersistenceError('conflict', 'Native recording changed during completion');
    }
    await refreshThread(completed);
    return completed;
  };

  const failMediaNativeRecording: MediaNativeMethods['failMediaNativeRecording'] = async ({
    scope,
    jobId,
    reason,
  }) => {
    const job = await media.getMediaJob(scope, jobId);
    if (!job?.nativeLimits || job.executionOwner !== 'chat') {
      return null;
    }
    if (!['running', 'requires_attention'].includes(job.phase)) {
      return job;
    }
    const content = await materialize(job, true);
    const failed = await Job.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        jobId,
        executionOwner: 'chat',
        phase: { $in: ['running', 'requires_attention'] },
        version: job.version,
      },
      {
        $set: {
          phase: reason === 'aborted' ? 'cancelled' : 'failed',
          outputs: content.outputs,
          provider: {
            certainty: 'terminal',
            recovery: {
              ...content.recovery,
              terminalStatus: reason === 'aborted' ? 'cancelled' : 'failed',
            },
          },
          error: { code: reason === 'storage' ? 'storage_failed' : 'provider_rejected' },
          updatedAt: new Date().toISOString(),
        },
        $inc: { version: 1 },
      },
      { new: true, writeConcern: durable },
    ).lean<MediaStoredJob | null>();
    if (failed) {
      await refreshThread(failed);
    }
    return failed;
  };

  const reconcileMediaNativeRecordings: MediaNativeMethods['reconcileMediaNativeRecordings'] =
    async (input) => {
      const scope = scopeFilter(input.scope);
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit <= 0 ||
        !Number.isFinite(Date.parse(input.now)) ||
        !Number.isFinite(Date.parse(input.staleBefore))
      ) {
        throw new MediaPersistenceError('invalid_input', 'Invalid native recovery bounds');
      }
      const jobs = await Job.find({
        ...scope,
        executionOwner: 'chat',
        phase: { $in: ['queued', 'running'] },
        updatedAt: { $lte: new Date(input.staleBefore).toISOString() },
      })
        .sort({ updatedAt: 1, jobId: 1 })
        .limit(input.limit)
        .lean<MediaStoredJob[]>();
      for (const job of jobs) {
        if (!job.nativeLimits && job.phase === 'queued') {
          // start() never returned, so the SDK has no permission to invoke the provider.
          const failed = await Job.findOneAndUpdate(
            {
              ...scope,
              jobId: job.jobId,
              executionOwner: 'chat',
              phase: 'queued',
              version: job.version,
              nativeLimits: { $exists: false },
            },
            {
              $set: {
                phase: 'failed',
                error: { code: 'provider_rejected' },
                updatedAt: new Date(input.now).toISOString(),
              },
              $inc: { version: 1 },
            },
            { new: true, writeConcern: durable },
          ).lean<MediaStoredJob | null>();
          if (failed) {
            await refreshThread(failed);
          }
          continue;
        }
        if (!job.nativeLimits) {
          continue;
        }
        const content = await materialize(job, true);
        const { terminalStatus: _terminalStatus, ...recovery } = content.recovery ?? {};
        await Job.updateOne(
          {
            ...scope,
            jobId: job.jobId,
            executionOwner: 'chat',
            phase: 'running',
            version: job.version,
          },
          {
            $set: {
              phase: 'requires_attention',
              outputs: content.outputs,
              provider: { ...job.provider, recovery },
              error: { code: 'submission_uncertain' },
              updatedAt: new Date(input.now).toISOString(),
            },
            $inc: { version: 1 },
          },
          { writeConcern: durable },
        );
        await refreshThread({ ...job, outputs: content.outputs });
      }
      return jobs.length;
    };

  async function refreshThread(job: MediaStoredJob): Promise<void> {
    if (['succeeded', 'failed', 'cancelled'].includes(job.phase)) {
      await media.releaseMediaPermits({ scope: scopeFilter(job), jobId: job.jobId });
    }
    const pendingJobCount = await Job.countDocuments({
      ...scopeFilter(job),
      threadId: job.threadId,
      'receipt.phase': 'accepted',
      phase: { $nin: ['succeeded', 'failed', 'cancelled'] },
    });
    await Thread.updateOne(
      { ...scopeFilter(job), threadId: job.threadId },
      { $set: { pendingJobCount }, $inc: { version: 1 } },
    );
    const cover = job.outputs.find(
      (output) => output.kind !== 'text' && output.state === 'ready' && output.asset,
    );
    if (cover && cover.kind !== 'text' && cover.asset) {
      await Thread.updateOne(
        {
          ...scopeFilter(job),
          threadId: job.threadId,
          status: 'active',
          cover: { $exists: false },
          coverExplicit: { $ne: true },
        },
        { $set: { cover: cover.asset }, $inc: { version: 1 } },
      );
    }
  }

  const getMediaNativeContinuation: MediaNativeMethods['getMediaNativeContinuation'] = async (
    input,
  ) => {
    const scope = scopeFilter(input.scope);
    if (!input.continuationRef && !input.fileId) {
      return null;
    }
    const part = await Part.findOne({
      ...scope,
      ...(input.continuationRef
        ? { continuationRef: input.continuationRef }
        : { fileId: input.fileId }),
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
    }).lean();
    if (!part || (input.fileId && part.fileId !== input.fileId)) {
      return null;
    }
    const job = await Job.findOne({
      ...scope,
      jobId: part.jobId,
      executionOwner: 'chat',
      'execution.api': input.execution.api,
      'execution.modelId': input.execution.modelId,
      'execution.bindingRevision': input.execution.bindingRevision,
    }).lean();
    if (!job || !(await Thread.exists({ ...scope, threadId: job.threadId, status: 'active' }))) {
      return null;
    }
    if (part.fileId && !(await media.getMediaAsset(scope, part.fileId))) {
      return null;
    }
    const { expiresAt, ...stored } = part;
    return { ...stored, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) };
  };

  return {
    ensureMediaNativeIndexes,
    startMediaNativeRecording,
    recordMediaNativePart,
    completeMediaNativeRecording,
    failMediaNativeRecording,
    getMediaNativeContinuation,
    reconcileMediaNativeRecordings,
  };
}
