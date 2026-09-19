import { createHash, randomUUID } from 'crypto';
import type { MediaOutput } from 'librechat-data-provider';
import type {
  MediaNativeMethods,
  MediaNativePart,
  MediaNativePartDocument,
  MediaNativePartRecord,
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
import { createMessageModel } from '~/models/message';
import { createFileModel } from '~/models/file';
import { MediaPersistenceError } from './media';
import { toMediaAsset } from '~/utils/media';

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
  const Message = createMessageModel(mongoose);

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
      publicationExpiresAt: input.source.expiresAt ?? null,
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
          nativeConsumers: [input.source.conversationId],
          nativeRetentionState: 'live',
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
        !(await media.retainMediaAsset({
          scope,
          fileId: part.fileId,
          retainer: `native:${job.jobId}`,
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
        })
          .select(
            'file_id filename type bytes filepath width height durationSeconds source mediaRenditions',
          )
          .lean()
      : [];
    const assets = new Map(files.map((file) => [file.file_id, toMediaAsset(file)]));
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
    resolutionId,
  }) => {
    const job = await media.getMediaJob(scope, jobId);
    if (!job?.nativeLimits || job.executionOwner !== 'chat') {
      return null;
    }
    const decision = job.recoveryDecisions?.[job.recoveryDecisions.length - 1];
    const resolving =
      resolutionId !== undefined &&
      decision?.request.clientRequestId === resolutionId &&
      decision.request.action === 'acknowledge';
    if (resolutionId !== undefined && !resolving) {
      throw new MediaPersistenceError('conflict', 'Native media recovery identity changed');
    }
    const phases = resolving ? ['reconciling'] : ['running', 'requires_attention'];
    if (!phases.includes(job.phase)) {
      return job;
    }
    const content = await materialize(job, true);
    const failed = await Job.findOneAndUpdate(
      {
        ...scopeFilter(scope),
        jobId,
        executionOwner: 'chat',
        phase: { $in: phases },
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
      const acknowledged = await Job.find({
        ...scope,
        executionOwner: 'chat',
        phase: 'reconciling',
        'recoveryDecisions.request.action': 'acknowledge',
      })
        .sort({ jobId: 1 })
        .limit(input.limit)
        .lean<MediaStoredJob[]>();
      for (const job of acknowledged) {
        const decision = job.recoveryDecisions?.[job.recoveryDecisions.length - 1];
        if (decision?.request.action === 'acknowledge') {
          await failMediaNativeRecording({
            scope,
            jobId: job.jobId,
            reason: 'provider',
            resolutionId: decision.request.clientRequestId,
          });
        }
      }
      const cleanup = await Job.find({
        ...scope,
        executionOwner: 'chat',
        $or: [
          { nativeCleanupPending: true },
          { nativeRetentionState: 'purging' },
          {
            'nativeSource.expiresAt': { $lte: new Date(input.now).toISOString() },
            nativeRetentionState: { $ne: 'purged' },
          },
        ],
      })
        .select({ jobId: 1, threadId: 1, nativeSource: 1, nativeConsumers: 1 })
        .sort({ jobId: 1 })
        .limit(input.limit)
        .lean();
      for (const job of cleanup) {
        const sourceReleased =
          job.nativeConsumers !== undefined &&
          !job.nativeConsumers.includes(job.nativeSource?.conversationId ?? '');
        const expired = !!job.nativeSource?.expiresAt && job.nativeSource.expiresAt <= input.now;
        if (sourceReleased || expired) {
          await media.retireMediaThread(scope, job.threadId);
        }
        const purged = await media.purgeMediaThreadPayloads({ scope, threadId: job.threadId });
        if (purged || (!sourceReleased && !expired)) {
          await Job.updateOne(
            { ...scope, jobId: job.jobId, nativeConsumers: job.nativeConsumers },
            { $unset: { nativeCleanupPending: 1 } },
            { writeConcern: durable },
          );
        }
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
  ) =>
    (
      await getMediaNativeContinuations({
        ...input,
        references: [{ continuationRef: input.continuationRef, fileId: input.fileId }],
        limit: 1,
      })
    )[0];

  const getMediaNativeContinuations: MediaNativeMethods['getMediaNativeContinuations'] = async (
    input,
  ) => {
    const scope = scopeFilter(input.scope);
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit <= 0 ||
      input.references.length > input.limit
    ) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native continuation batch');
    }
    if (!input.references.length) {
      return [];
    }
    const refs = [
      ...new Set(
        input.references.flatMap((entry) => (entry.continuationRef ? [entry.continuationRef] : [])),
      ),
    ];
    const fileIds = [
      ...new Set(
        input.references.flatMap((entry) =>
          !entry.continuationRef && entry.fileId ? [entry.fileId] : [],
        ),
      ),
    ];
    const now = new Date();
    const parts = await Part.find({
      ...scope,
      $and: [
        { $or: [{ continuationRef: { $in: refs } }, { fileId: { $in: fileIds } }] },
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
      ],
    }).lean();
    const jobs = await Job.find({
      ...scope,
      jobId: { $in: [...new Set(parts.map((part) => part.jobId))] },
      executionOwner: 'chat',
      'execution.api': input.execution.api,
      'execution.modelId': input.execution.modelId,
      'execution.bindingRevision': {
        $in: [input.execution.bindingRevision, ...(input.bindingAliases ?? [])],
      },
      nativeRetentionState: { $nin: ['purging', 'purged'] },
      $or: [
        { 'nativeSource.expiresAt': { $exists: false } },
        { 'nativeSource.expiresAt': { $gt: now.toISOString() } },
      ],
    })
      .select({ jobId: 1, threadId: 1, phase: 1, nativeConsumers: 1, nativeSource: 1 })
      .lean();
    const activeJobs = new Map(jobs.map((job) => [job.jobId, job]));
    const candidates = jobs.filter((job) => !job.nativeConsumers?.length);
    const legacyIds = new Set(
      jobs.filter((job) => job.nativeConsumers === undefined).map((job) => job.jobId),
    );
    const legacyRefs = parts
      .filter((part) => legacyIds.has(part.jobId))
      .map((part) => part.continuationRef);
    const imageIds = [...new Set(parts.flatMap((part) => (part.fileId ? [part.fileId] : [])))];
    const [threads, files, legacyConsumers] = await Promise.all([
      candidates.length
        ? Thread.find({
            ...scope,
            threadId: { $in: candidates.map((job) => job.threadId) },
            status: 'active',
          })
            .select({ threadId: 1 })
            .lean()
        : [],
      imageIds.length
        ? File.find({
            user: scope.ownerId,
            tenantId: scope.tenantId,
            file_id: { $in: imageIds },
            mediaLifecycle: 'live',
            $or: [{ mediaHardExpiresAt: null }, { mediaHardExpiresAt: { $gt: now } }],
          })
            .select({ file_id: 1 })
            .lean()
        : [],
      legacyRefs.length
        ? Message.aggregate<{ _id: string }>([
            {
              $match: {
                user: scope.ownerId,
                tenantId: scope.tenantId,
                ...(input.conversationId ? { conversationId: input.conversationId } : {}),
                'content.native_media.continuationRef': { $in: legacyRefs },
                $or: [{ expiredAt: null }, { expiredAt: { $gt: now } }],
              },
            },
            { $unwind: '$content' },
            { $match: { 'content.native_media.continuationRef': { $in: legacyRefs } } },
            { $group: { _id: '$content.native_media.continuationRef' } },
          ])
        : [],
    ]);
    const liveThreads = new Set(threads.map((thread) => thread.threadId));
    const liveFiles = new Set(files.map((file) => file.file_id));
    const legacyAuthorized = new Set(legacyConsumers.map((consumer) => consumer._id));
    const byRef = new Map<string, MediaNativePartRecord>();
    const byFile = new Map<string, MediaNativePartRecord>();
    for (const part of parts) {
      const job = activeJobs.get(part.jobId);
      if (!job || (part.fileId && !liveFiles.has(part.fileId))) {
        continue;
      }
      const consumers =
        job.nativeConsumers ??
        (job.nativeSource && ['queued', 'running'].includes(job.phase)
          ? [job.nativeSource.conversationId]
          : []);
      const legacyConsumer =
        job.nativeConsumers === undefined && legacyAuthorized.has(part.continuationRef);
      if (
        input.conversationId
          ? !consumers.includes(input.conversationId) && !legacyConsumer
          : !consumers.length && !liveThreads.has(job.threadId) && !legacyConsumer
      ) {
        continue;
      }
      const { expiresAt, ...stored } = part;
      const record = { ...stored, ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}) };
      byRef.set(part.continuationRef, record);
      if (part.fileId) {
        byFile.set(part.fileId, record);
      }
    }
    return input.references.map((reference) => {
      const byFileId = reference.fileId ? byFile.get(reference.fileId) : undefined;
      const record = reference.continuationRef ? byRef.get(reference.continuationRef) : byFileId;
      return record && (!reference.fileId || reference.fileId === record.fileId) ? record : null;
    });
  };

  const retainMediaNativeConversation: MediaNativeMethods['retainMediaNativeConversation'] = async (
    input,
  ) => {
    const scope = scopeFilter(input.scope);
    if (
      !input.conversationId ||
      !Number.isSafeInteger(input.maxRetainers) ||
      input.maxRetainers <= 0 ||
      !Number.isSafeInteger(input.limit) ||
      input.limit <= 0 ||
      input.continuationRefs.length > input.limit ||
      (input.pendingUntil !== undefined && !(Date.parse(input.pendingUntil) > Date.now()))
    ) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native conversation consumer');
    }
    const references = [...new Set(input.continuationRefs)];
    const now = new Date();
    const parts = await Part.find({
      ...scope,
      continuationRef: { $in: references },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
    })
      .select({ jobId: 1, continuationRef: 1 })
      .lean();
    if (parts.length !== references.length) {
      return false;
    }
    for (const jobId of new Set(parts.map((part) => part.jobId))) {
      const job = await media.getMediaJob(scope, jobId);
      if (!job || !(await migrateNativeJob(scope, job, input.maxRetainers))) {
        return false;
      }
      const result = await Job.updateOne(
        {
          ...scope,
          jobId,
          executionOwner: 'chat',
          nativeRetentionState: { $nin: ['purging', 'purged'] },
          $and: [
            {
              $or: [
                { 'nativeSource.expiresAt': { $exists: false } },
                { 'nativeSource.expiresAt': { $gt: now.toISOString() } },
              ],
            },
            {
              $or: [
                { nativeConsumers: input.conversationId },
                {
                  $expr: {
                    $lt: [
                      {
                        $size: { $ifNull: ['$nativeConsumers', ['$nativeSource.conversationId']] },
                      },
                      input.maxRetainers,
                    ],
                  },
                },
              ],
            },
          ],
        },
        [
          {
            $set: {
              nativeConsumers: {
                $setUnion: [
                  { $ifNull: ['$nativeConsumers', ['$nativeSource.conversationId']] },
                  [input.conversationId],
                ],
              },
              nativeRetentionState: 'live',
              ...(input.pendingUntil
                ? {
                    nativeConsumersTracked: true,
                    nativeConsumerClaims: {
                      $concatArrays: [
                        {
                          $filter: {
                            input: { $ifNull: ['$nativeConsumerClaims', []] },
                            as: 'claim',
                            cond: { $ne: ['$$claim.conversationId', input.conversationId] },
                          },
                        },
                        [{ conversationId: input.conversationId, expiresAt: input.pendingUntil }],
                      ],
                    },
                  }
                : {}),
            },
          },
        ],
        { writeConcern: durable },
      );
      if (!result.matchedCount) {
        return false;
      }
    }
    return true;
  };

  const releaseMediaNativeConversation: MediaNativeMethods['releaseMediaNativeConversation'] =
    async (input) => {
      const scope = scopeFilter(input.scope);
      if (!input.conversationId) {
        throw new MediaPersistenceError('invalid_input', 'Invalid native conversation consumer');
      }
      const jobs = await Job.find({
        ...scope,
        executionOwner: 'chat',
        $or: [
          { nativeConsumers: input.conversationId },
          {
            'nativeSource.conversationId': input.conversationId,
          },
        ],
      }).lean<MediaStoredJob[]>();
      for (const job of jobs) {
        if (!(await migrateNativeJob(scope, job, input.maxRetainers))) {
          throw new MediaPersistenceError(
            'capacity',
            'Existing native consumers exceed the configured retention limit',
          );
        }
        await Job.updateOne(
          { ...scope, jobId: job.jobId },
          [
            {
              $set: {
                nativeCleanupPending: true,
                nativeConsumers: {
                  $setDifference: [
                    { $ifNull: ['$nativeConsumers', ['$nativeSource.conversationId']] },
                    [input.conversationId],
                  ],
                },
              },
            },
          ],
          { writeConcern: durable },
        );
        if (job.nativeSource?.conversationId === input.conversationId) {
          await media.retireMediaThread(scope, job.threadId);
        }
        await media.purgeMediaThreadPayloads({ scope, threadId: job.threadId });
      }
    };

  async function migrateNativeJob(
    scope: MediaOwnerScope,
    job: MediaStoredJob,
    maxRetainers?: number,
  ): Promise<boolean> {
    if (job.nativeConsumers !== undefined) {
      return true;
    }
    if (
      !job.nativeSource ||
      (maxRetainers !== undefined && (!Number.isSafeInteger(maxRetainers) || maxRetainers <= 0))
    ) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native consumer migration');
    }
    const parts = await Part.find({ ...scope, jobId: job.jobId })
      .select({ continuationRef: 1, fileId: 1 })
      .limit(job.nativeLimits?.maxParts ?? 1)
      .lean();
    const now = new Date();
    const expired = !!job.nativeSource.expiresAt && job.nativeSource.expiresAt <= now.toISOString();
    const consumers = expired
      ? []
      : await Message.aggregate<{ conversationId: string }>([
          {
            $match: {
              user: scope.ownerId,
              tenantId: scope.tenantId,
              'content.native_media.continuationRef': {
                $in: parts.map((part) => part.continuationRef),
              },
              $or: [{ expiredAt: null }, { expiredAt: { $gt: now } }],
            },
          },
          { $group: { _id: '$conversationId' } },
          ...(maxRetainers !== undefined ? [{ $limit: maxRetainers + 1 }] : []),
          { $project: { _id: 0, conversationId: '$_id' } },
        ]);
    const ids = new Set(consumers.map((consumer) => consumer.conversationId));
    if (!expired && ['queued', 'running'].includes(job.phase)) {
      ids.add(job.nativeSource.conversationId);
    }
    if (maxRetainers !== undefined && ids.size > maxRetainers) {
      return false;
    }
    const fileIds = parts.flatMap((part) => (part.fileId ? [part.fileId] : []));
    if (fileIds.length) {
      await File.updateMany(
        {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          file_id: { $in: fileIds },
          mediaLifecycle: 'live',
        },
        { $addToSet: { mediaRetainers: `native:${job.jobId}` } },
        { writeConcern: durable },
      );
    }
    await Job.updateOne(
      { ...scope, jobId: job.jobId, nativeConsumers: { $exists: false } },
      { $set: { nativeConsumers: [...ids], nativeRetentionState: 'live' } },
      { writeConcern: durable },
    );
    if (job.nativeSource.expiresAt) {
      await Thread.updateOne(
        { ...scope, threadId: job.threadId, expiresAt: { $exists: false } },
        { $set: { expiresAt: job.nativeSource.expiresAt } },
        { writeConcern: durable },
      );
    }
    return true;
  }

  const confirmMediaNativeConversation: MediaNativeMethods['confirmMediaNativeConversation'] =
    async (input) => {
      const scope = scopeFilter(input.scope);
      await Job.updateMany(
        { ...scope, executionOwner: 'chat', nativeConsumers: input.conversationId },
        { $pull: { nativeConsumerClaims: { conversationId: input.conversationId } } },
        { writeConcern: durable },
      );
    };

  const prepareMediaNativeMessageDeletion: MediaNativeMethods['prepareMediaNativeMessageDeletion'] =
    async (input) => {
      const scope = scopeFilter(input.scope);
      if (!input.continuationRefs.length) return;
      const parts = await Part.find({
        ...scope,
        continuationRef: { $in: [...input.continuationRefs] },
      })
        .select({ jobId: 1 })
        .lean();
      for (const jobId of new Set(parts.map((part) => part.jobId))) {
        const job = await media.getMediaJob(scope, jobId);
        if (!job) continue;
        await migrateNativeJob(scope, job);
        await Job.updateOne(
          { ...scope, jobId },
          { $set: { nativeConsumersTracked: true } },
          { writeConcern: durable },
        );
      }
    };

  async function reconcileNativeConsumers(
    scope: MediaOwnerScope,
    job: MediaStoredJob,
  ): Promise<void> {
    await migrateNativeJob(scope, job);
    const current = await media.getMediaJob(scope, job.jobId);
    if (!current?.nativeConsumers || current.nativeRetentionState === 'purged') return;
    const now = new Date();
    const parts = await Part.find({ ...scope, jobId: job.jobId })
      .select({ continuationRef: 1 })
      .limit(job.nativeLimits?.maxParts ?? 1)
      .lean();
    const consumers = await Message.aggregate<{ conversationId: string }>([
      {
        $match: {
          user: scope.ownerId,
          tenantId: scope.tenantId,
          conversationId: { $in: current.nativeConsumers },
          'content.native_media.continuationRef': {
            $in: parts.map((part) => part.continuationRef),
          },
          $or: [{ expiredAt: null }, { expiredAt: { $gt: now } }],
        },
      },
      { $group: { _id: '$conversationId' } },
      { $project: { _id: 0, conversationId: '$_id' } },
    ]);
    const live = new Set(consumers.map((consumer) => consumer.conversationId));
    const claims = (current.nativeConsumerClaims ?? []).filter(
      (claim) => claim.expiresAt > now.toISOString(),
    );
    for (const claim of claims) live.add(claim.conversationId);
    if (['queued', 'running'].includes(current.phase) && current.nativeSource)
      live.add(current.nativeSource.conversationId);
    const retained = current.nativeConsumers.filter((id) => live.has(id));
    const result = await Job.updateOne(
      {
        ...scope,
        jobId: current.jobId,
        nativeConsumers: current.nativeConsumers,
        nativeConsumerClaims: current.nativeConsumerClaims ?? { $exists: false },
      },
      {
        $set: {
          nativeConsumers: retained,
          nativeConsumerClaims: claims,
          nativeConsumersCheckedAt: now.toISOString(),
        },
      },
      { writeConcern: durable },
    );
    if (!result.matchedCount) return;
    if (current.nativeSource && !retained.includes(current.nativeSource.conversationId)) {
      await media.retireMediaThread(scope, current.threadId);
    }
    await media.purgeMediaThreadPayloads({ scope, threadId: current.threadId });
  }

  const reconcileMediaNativeMessageDeletion: MediaNativeMethods['reconcileMediaNativeMessageDeletion'] =
    async (input) => {
      const scope = scopeFilter(input.scope);
      const jobs = Job.find({
        ...scope,
        executionOwner: 'chat',
        nativeConsumersTracked: true,
        $or: [
          { nativeConsumers: input.conversationId },
          { 'nativeSource.conversationId': input.conversationId },
        ],
      })
        .lean<MediaStoredJob>()
        .cursor();
      for await (const job of jobs) await reconcileNativeConsumers(scope, job);
    };

  const migrateMediaNativeConsumers: MediaNativeMethods['migrateMediaNativeConsumers'] = async (
    input,
  ) => {
    const scope = scopeFilter(input.scope);
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit <= 0 ||
      !Number.isSafeInteger(input.maxRetainers) ||
      input.maxRetainers <= 0
    ) {
      throw new MediaPersistenceError('invalid_input', 'Invalid native consumer migration bounds');
    }
    const jobs = await Job.find({
      ...scope,
      executionOwner: 'chat',
      nativeSource: { $exists: true },
      $or: [
        { nativeConsumers: { $exists: false } },
        { nativeConsumersTracked: true, nativeRetentionState: { $ne: 'purged' } },
      ],
      ...(input.threadId ? { threadId: input.threadId } : {}),
    })
      .sort({ nativeConsumersCheckedAt: 1, jobId: 1 })
      .limit(input.limit)
      .lean<MediaStoredJob[]>();
    for (const job of jobs) {
      if (!(await migrateNativeJob(scope, job, input.maxRetainers))) {
        throw new MediaPersistenceError(
          'capacity',
          'Existing native consumers exceed the configured retention limit',
        );
      }
      if (job.nativeConsumersTracked) await reconcileNativeConsumers(scope, job);
      else
        await Job.updateOne(
          { ...scope, jobId: job.jobId },
          { $set: { nativeConsumersCheckedAt: new Date().toISOString() } },
          { writeConcern: durable },
        );
    }
    return jobs.length;
  };

  return {
    ensureMediaNativeIndexes,
    startMediaNativeRecording,
    recordMediaNativePart,
    completeMediaNativeRecording,
    failMediaNativeRecording,
    getMediaNativeContinuation,
    getMediaNativeContinuations,
    retainMediaNativeConversation,
    confirmMediaNativeConversation,
    prepareMediaNativeMessageDeletion,
    reconcileMediaNativeMessageDeletion,
    releaseMediaNativeConversation,
    migrateMediaNativeConsumers,
    reconcileMediaNativeRecordings,
  };
}
