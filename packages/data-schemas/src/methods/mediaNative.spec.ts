import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mediaSubmissionRequestSchema } from 'librechat-data-provider';
import type { MediaNativeMethods, MediaNativeLimits } from '~/types/mediaNative';
import type { MediaMethods, MediaOwnerScope } from '~/types/media';
import { createMediaNativeMethods } from './mediaNative';
import { createMediaMethods } from './media';

describe('native chat media persistence', () => {
  let mongo: MongoMemoryServer;
  let media: MediaMethods;
  let native: MediaNativeMethods;
  let scope: MediaOwnerScope;
  const execution = {
    api: 'google.generateContent' as const,
    modelId: 'gemini-image',
    connectionId: 'google',
    catalogVersion: 'v1',
    bindingRevision: 'account-one',
  };
  const limits: MediaNativeLimits = { maxParts: 20, maxPartBytes: 1024, maxRecordingBytes: 4096 };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    media = createMediaMethods(mongoose);
    native = createMediaNativeMethods(mongoose, media);
    await media.ensureMediaIndexes();
    await native.ensureMediaNativeIndexes();
  }, 60000);
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
  });

  async function start(
    modelRunId = 'run-one',
    configuredLimits = limits,
    maxTitleChars = 20,
    expiresAt?: string,
  ) {
    return native.startMediaNativeRecording({
      scope,
      source: {
        conversationId: 'conversation',
        messageId: 'assistant-message',
        modelRunId,
        ...(expiresAt ? { expiresAt } : {}),
      },
      request: mediaSubmissionRequestSchema.parse({
        clientRequestId: 'ignored-client-key',
        prompt: 'Create an image',
        operation: 'image.generate',
        selection: {
          connectionId: execution.connectionId,
          modelId: execution.modelId,
          catalogVersion: execution.catalogVersion,
        },
      }),
      execution,
      maxRetainers: 4,
      maxTitleChars,
      limits: configuredLimits,
    });
  }

  it('bounds native tile titles without changing the original chat prompt', async () => {
    const job = await start('bounded-title', limits, 5);
    expect((await media.getMediaThread(scope, job.threadId))?.title).toBe('Creat');
    expect(job.request.prompt).toBe('Create an image');
    expect((await start('bounded-title', limits, 5)).jobId).toBe(job.jobId);
  });
  async function original() {
    const write = await media.reserveMediaAssetWrite({
      scope,
      outputKey: 'native-image',
      rendition: 'original',
      ingestToken: 'one',
      fingerprint: 'digest',
      storageKey: 'images/immutable.png',
    });
    return media.commitMediaAssetWrite({
      scope,
      writeId: write.writeId,
      content: {
        file_id: write.fileId,
        storageKey: write.storageKey,
        source: 'local',
        filename: 'immutable.png',
        type: 'image/png',
        filepath: '/images/immutable.png',
        bytes: 16,
        contentDigest: 'digest',
      },
    });
  }

  it('records one existing invocation without a queue permit, lease, or second accounting owner', async () => {
    const [one, two] = await Promise.all([start(), start()]);
    expect(one.jobId).toBe(two.jobId);
    expect(one).toMatchObject({ executionOwner: 'chat', phase: 'running' });
    expect(one.activeSlot).toBeUndefined();
    expect(await mongoose.models.MediaPermit.countDocuments()).toBe(0);
    expect(
      await media.claimMediaJob({
        scope,
        workerId: 'media-worker',
        now: new Date(Date.now() + 1000).toISOString(),
        leaseMs: 10000,
      }),
    ).toBeNull();
    expect(
      await media.acquireMediaPermit({ scope, jobId: one.jobId, kind: 'deployment', capacity: 10 }),
    ).toBe(false);
  });

  it('persists ordered text/image/signature facts and restores them after repository restart', async () => {
    const job = await start();
    const image = await original();
    const imagePart = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 1,
      partIndex: 0,
      part: {
        kind: 'image',
        mimeType: 'image/png',
        fileId: image.file_id,
        thoughtSignature: 'private-image-signature',
      },
      maxRetainers: 4,
    });
    const text = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'Before', thoughtSignature: 'private-text-signature' },
      maxRetainers: 4,
    });
    await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 2,
      partIndex: 0,
      part: { kind: 'text', text: 'After' },
      maxRetainers: 4,
    });
    const complete = await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    expect(complete?.outputs.map((part) => part.kind)).toEqual(['text', 'image', 'text']);
    expect(complete?.provider.recovery?.parts?.map((part) => part.ordinal)).toEqual([0, 1, 2]);
    expect(JSON.stringify(await media.getMediaJobView(scope, job.jobId))).not.toContain('private-');
    native = createMediaNativeMethods(mongoose, createMediaMethods(mongoose));
    expect(
      await native.getMediaNativeContinuation({
        scope,
        continuationRef: text.continuationRef,
        execution,
      }),
    ).toMatchObject({
      part: { kind: 'text', text: 'Before', thoughtSignature: 'private-text-signature' },
    });
    expect(
      await native.getMediaNativeContinuation({ scope, fileId: image.file_id, execution }),
    ).toMatchObject({
      continuationRef: imagePart.continuationRef,
      part: { thoughtSignature: 'private-image-signature' },
    });
    expect((await media.getMediaThread(scope, job.threadId))?.pendingJobCount).toBe(0);
  });

  it('deduplicates part replay and rejects a changed body at the same position', async () => {
    const job = await start();
    const input = {
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text' as const, text: 'Stable' },
      maxRetainers: 4,
    };
    const receipts = await Promise.all(
      Array.from({ length: 4 }, () => native.recordMediaNativePart(input)),
    );
    expect(new Set(receipts.map((receipt) => receipt.continuationRef)).size).toBe(1);
    expect((await media.getMediaJob(scope, job.jobId))?.nativePartKeys).toHaveLength(1);
    await expect(
      native.recordMediaNativePart({ ...input, part: { kind: 'text', text: 'Different' } }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('enforces cumulative descriptor and part limits under concurrent writers', async () => {
    const job = await start('bounded', { maxParts: 1, maxPartBytes: 256, maxRecordingBytes: 256 });
    const results = await Promise.allSettled(
      [0, 1].map((chunkIndex) =>
        native.recordMediaNativePart({
          scope,
          jobId: job.jobId,
          chunkIndex,
          partIndex: 0,
          part: { kind: 'text', text: 'One' },
          maxRetainers: 4,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await mongoose.models.MediaNativePart.countDocuments()).toBe(1);
  });

  it('does not complete a recording whose reserved part was not durably published', async () => {
    const job = await start();
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      {
        $push: {
          nativePartKeys: { key: '0:0', fingerprint: 'reserved-before-crash', bytes: 10 },
        },
      },
    );
    await expect(
      native.completeMediaNativeRecording({ scope, jobId: job.jobId }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect((await media.getMediaJob(scope, job.jobId))?.phase).toBe('running');
  });

  it('rejects continuation access across owner, model, account, and ref/file identity', async () => {
    const job = await start();
    const asset = await original();
    const receipt = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: {
        kind: 'image',
        mimeType: 'image/png',
        fileId: asset.file_id,
        thoughtSignature: 'secret',
      },
      maxRetainers: 4,
    });
    const base = { scope, execution, continuationRef: receipt.continuationRef };
    expect(
      await native.getMediaNativeContinuation({
        ...base,
        execution: { ...execution, modelId: 'other' },
      }),
    ).toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        ...base,
        execution: { ...execution, bindingRevision: 'other' },
      }),
    ).toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        ...base,
        scope: { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
      }),
    ).toBeNull();
    expect(await native.getMediaNativeContinuation({ ...base, fileId: 'another-file' })).toBeNull();
    await media.retireMediaThread(scope, job.threadId);
    expect(await native.getMediaNativeContinuation(base)).toBeNull();
  });

  it('stores part expiry as a TTL-backed date and hides an expired continuation', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const job = await start('expiring-run', limits, 20, expiresAt);
    const receipt = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'Soon gone' },
      maxRetainers: 4,
    });
    const input = { scope, execution, continuationRef: receipt.continuationRef };
    expect(await native.getMediaNativeContinuation(input)).toMatchObject({ expiresAt });
    const stored = await mongoose.models.MediaNativePart.findOne({
      continuationRef: receipt.continuationRef,
    }).lean<{ expiresAt?: Date }>();
    expect(stored?.expiresAt).toBeInstanceOf(Date);
    const indexes = await mongoose.models.MediaNativePart.listIndexes();
    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    );
    await mongoose.models.MediaNativePart.updateOne(
      { continuationRef: receipt.continuationRef },
      { $set: { expiresAt: new Date(0) } },
    );
    expect(await native.getMediaNativeContinuation(input)).toBeNull();
  });

  it('records native failure without enabling automatic or manual paid retry', async () => {
    const job = await start();
    await native.failMediaNativeRecording({ scope, jobId: job.jobId, reason: 'provider' });
    expect(await media.getMediaJobView(scope, job.jobId)).toMatchObject({
      phase: 'failed',
      allowedActions: { cancel: false, retry: false },
    });
    await expect(
      native.recordMediaNativePart({
        scope,
        jobId: job.jobId,
        chunkIndex: 0,
        partIndex: 0,
        part: { kind: 'text', text: 'late' },
        maxRetainers: 4,
      }),
    ).rejects.toMatchObject({ code: 'retired' });
    expect(
      await media.claimMediaJob({
        scope,
        workerId: 'media-worker',
        now: new Date(Date.now() + 1000).toISOString(),
        leaseMs: 10000,
      }),
    ).toBeNull();
  });

  it('preserves emitted partial outputs and signatures when the original chat invocation fails', async () => {
    const job = await start();
    const image = await original();
    const receipt = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: {
        kind: 'image',
        mimeType: 'image/png',
        fileId: image.file_id,
        thoughtSignature: 'partial-signature',
      },
      maxRetainers: 4,
    });
    const failed = await native.failMediaNativeRecording({
      scope,
      jobId: job.jobId,
      reason: 'provider',
    });
    expect(failed).toMatchObject({
      phase: 'failed',
      outputs: [{ kind: 'image', state: 'ready', asset: image }],
      provider: { recovery: { terminalStatus: 'failed' } },
    });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        continuationRef: receipt.continuationRef,
        execution,
      }),
    ).toMatchObject({ part: { thoughtSignature: 'partial-signature' } });
    expect((await media.getMediaThread(scope, job.threadId))?.cover).toEqual(image);
    expect(await media.prepareMediaAccountDeletion({ scope, token: 'after-failure' })).toBe(true);
  });

  it('recovers stale native recordings from known facts without replaying the chat call', async () => {
    const job = await start();
    await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'Known partial', thoughtSignature: 'private' },
      maxRetainers: 4,
    });
    const now = new Date(Date.now() + 60000).toISOString();
    expect(
      await native.reconcileMediaNativeRecordings({ scope, now, staleBefore: now, limit: 1 }),
    ).toBe(1);
    const stale = await media.getMediaJob(scope, job.jobId);
    expect(stale).toMatchObject({
      phase: 'requires_attention',
      outputs: [{ kind: 'text', text: 'Known partial' }],
    });
    expect(stale?.provider.recovery?.terminalStatus).toBeUndefined();
    expect(await media.claimMediaJob({ scope, now, workerId: 'worker', leaseMs: 1000 })).toBeNull();
    expect((await native.completeMediaNativeRecording({ scope, jobId: job.jobId }))?.phase).toBe(
      'succeeded',
    );
  });

  it('respects an explicitly cleared cover when native completion projects its first image', async () => {
    const job = await start();
    const thread = (await media.getMediaThread(scope, job.threadId))!;
    await media.updateMediaThread({
      scope,
      threadId: thread.threadId,
      expectedVersion: thread.version,
      coverFileId: null,
    });
    const image = await original();
    await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'image', mimeType: 'image/png', fileId: image.file_id },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    expect((await media.getMediaThread(scope, job.threadId))?.cover).toBeUndefined();
  });
});
