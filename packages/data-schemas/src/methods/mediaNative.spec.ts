import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FileSources, mediaSubmissionRequestSchema } from 'librechat-data-provider';
import type { FileStorage } from 'librechat-data-provider';
import type { MediaNativeMethods, MediaNativeLimits } from '~/types/mediaNative';
import type { MediaMethods, MediaOwnerScope } from '~/types/media';
import { createMediaNativeMethods } from './mediaNative';
import { createMessageMethods } from './message';
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
    native = createMediaNativeMethods(mongoose, media);
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
  async function original(source: FileStorage = FileSources.local, thumbnail = false) {
    const storageKey = `images/t/${scope.tenantId ?? 'default'}/${scope.ownerId}/immutable.png`;
    const filepath =
      source === FileSources.local ? `/${storageKey}` : `https://private.example/${storageKey}`;
    const rendition = {
      source,
      storageKey: `${storageKey}.thumbnail.png`,
      filepath: `${filepath}.thumbnail.png`,
      type: 'image/png',
      bytes: 8,
      width: 16,
      height: 16,
      contentDigest: 'thumbnail-digest',
    };
    const write = await media.reserveMediaAssetWrite({
      scope,
      outputKey: 'native-image',
      rendition: 'original',
      ingestToken: 'one',
      fingerprint: 'digest',
      storageKey,
      source,
      ...(thumbnail ? { renditionLocations: [{ ...rendition, kind: 'thumbnail' as const }] } : {}),
    });
    return media.commitMediaAssetWrite({
      scope,
      writeId: write.writeId,
      content: {
        file_id: write.fileId,
        storageKey: write.storageKey,
        source,
        filename: 'immutable.png',
        type: 'image/png',
        filepath,
        bytes: 16,
        contentDigest: 'digest',
        ...(thumbnail ? { mediaRenditions: { thumbnail: rendition } } : {}),
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

  it.each([FileSources.local, FileSources.s3] as const)(
    'restores private %s native outputs and thumbnails through the canonical public projection',
    async (source) => {
      scope.tenantId = 'tenant-one';
      const job = await start();
      const image = await original(source, true);
      await native.recordMediaNativePart({
        scope,
        jobId: job.jobId,
        chunkIndex: 0,
        partIndex: 0,
        part: { kind: 'image', mimeType: 'image/png', fileId: image.file_id },
        maxRetainers: 4,
      });
      native = createMediaNativeMethods(mongoose, createMediaMethods(mongoose));
      const completed = await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
      expect(completed?.outputs).toEqual([
        expect.objectContaining({ kind: 'image', state: 'ready', asset: image }),
      ]);
      const publicPath = `/api/media/assets/${image.file_id}/content`;
      expect(image).toMatchObject({
        filepath: publicPath,
        renditions: { thumbnail: { filepath: `${publicPath}?rendition=thumbnail`, bytes: 8 } },
      });
      const restored = await media.getMediaJobView(scope, job.jobId);
      expect(JSON.stringify(restored)).not.toContain('private.example');
      expect(JSON.stringify(restored)).not.toContain('images/t/');
      expect(JSON.stringify(restored)).not.toContain('storageKey');
      expect((await media.getMediaThread(scope, job.threadId))?.cover).toEqual(image);
      const content = await media.getMediaAssetContent(scope, image.file_id);
      expect(content?.filepath).toContain('images/t/tenant-one/');
      expect(content?.mediaRenditions?.thumbnail?.storageKey).toContain('thumbnail.png');
      expect(content?.source).toBe(source);
    },
  );

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
    expect(await native.getMediaNativeContinuation(base)).not.toBeNull();
    await native.releaseMediaNativeConversation({
      scope,
      maxRetainers: 4,
      conversationId: 'conversation',
    });
    expect(await native.getMediaNativeContinuation(base)).toBeNull();
  });

  it('retains source and fork continuations independently of the Studio projection until the final consumer leaves', async () => {
    const job = await start();
    const asset = await original();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: {
        kind: 'image',
        fileId: asset.file_id,
        mimeType: 'image/png',
        thoughtSignature: 'private signature',
      },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    expect(
      await native.retainMediaNativeConversation({
        scope,
        conversationId: 'fork',
        continuationRefs: [reference.continuationRef],
        limit: 20,
        maxRetainers: 4,
      }),
    ).toBe(true);
    await media.retireMediaThread(scope, job.threadId);
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    const replay = (conversationId: string) =>
      native.getMediaNativeContinuation({ scope, ...reference, execution, conversationId });
    expect(await replay('conversation')).not.toBeNull();
    expect(await replay('fork')).not.toBeNull();
    expect(await replay('unregistered')).toBeNull();
    expect((await media.getMediaJob(scope, job.jobId))?.outputs).toHaveLength(1);
    await native.releaseMediaNativeConversation({
      scope,
      maxRetainers: 4,
      conversationId: 'conversation',
    });
    expect(await replay('conversation')).toBeNull();
    expect(await replay('fork')).not.toBeNull();
    expect(await media.getMediaAsset(scope, asset.file_id)).not.toBeNull();
    await native.releaseMediaNativeConversation({ scope, maxRetainers: 4, conversationId: 'fork' });
    expect(await replay('fork')).toBeNull();
    expect(await mongoose.models.MediaNativePart.countDocuments({ jobId: job.jobId })).toBe(0);
    expect(await media.getMediaJob(scope, job.jobId)).toMatchObject({
      nativeRetentionState: 'purged',
      outputs: [],
      request: { prompt: '' },
    });
    expect(await mongoose.models.File.findOne({ file_id: asset.file_id }).lean()).toMatchObject({
      mediaRetainers: [],
    });
    expect(
      await media.claimMediaAssetDeletion({
        scope,
        fileId: asset.file_id,
        token: 'final-consumer',
      }),
    ).not.toBeNull();
    expect(
      await native.retainMediaNativeConversation({
        scope,
        conversationId: 'late',
        continuationRefs: [reference.continuationRef],
        limit: 20,
        maxRetainers: 4,
      }),
    ).toBe(false);
  });

  it('recovers a crash after source-consumer release before presentation cleanup', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'sensitive' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const failure = jest
      .spyOn(media, 'retireMediaThread')
      .mockRejectedValueOnce(new Error('interrupted database connection'));
    await expect(
      native.releaseMediaNativeConversation({
        scope,
        maxRetainers: 4,
        conversationId: 'conversation',
      }),
    ).rejects.toThrow('interrupted');
    failure.mockRestore();
    const now = new Date().toISOString();
    native = createMediaNativeMethods(mongoose, media);
    await native.reconcileMediaNativeRecordings({ scope, now, staleBefore: now, limit: 10 });
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    await native.reconcileMediaNativeRecordings({ scope, now, staleBefore: now, limit: 10 });
    expect(await native.getMediaNativeContinuation({ scope, execution, ...reference })).toBeNull();
    expect(await mongoose.models.MediaNativePart.countDocuments({ jobId: job.jobId })).toBe(0);
    expect((await media.getMediaJob(scope, job.jobId))?.nativeCleanupPending).toBeUndefined();
  });

  it('restores a transcript in two bounded reads and preserves request order and authorization', async () => {
    const job = await start('batch', { ...limits, maxParts: 30 });
    const references = [];
    for (let index = 0; index < 24; index++) {
      references.push(
        await native.recordMediaNativePart({
          scope,
          jobId: job.jobId,
          chunkIndex: index,
          partIndex: 0,
          part: { kind: 'text', text: `chunk ${index}` },
          maxRetainers: 4,
        }),
      );
    }
    const parts = jest.spyOn(mongoose.models.MediaNativePart, 'find');
    const jobs = jest.spyOn(mongoose.models.MediaJob, 'find');
    const threads = jest.spyOn(mongoose.models.MediaThread, 'find');
    const restored = await native.getMediaNativeContinuations({
      scope,
      references: [...references].reverse(),
      execution,
      conversationId: 'conversation',
      limit: 30,
    });
    expect(restored.map((part) => part?.part)).toEqual(
      Array.from({ length: 24 }, (_, index) => ({ kind: 'text', text: `chunk ${23 - index}` })),
    );
    expect(parts).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveBeenCalledTimes(1);
    expect(threads).not.toHaveBeenCalled();
    parts.mockRestore();
    jobs.mockRestore();
    threads.mockRestore();
    expect(
      await native.getMediaNativeContinuations({
        scope,
        references,
        execution: { ...execution, bindingRevision: 'different-account' },
        limit: 30,
      }),
    ).toEqual(Array(24).fill(null));
    await expect(
      native.getMediaNativeContinuations({ scope, references, execution, limit: 10 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
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

  it('central message deletion releases only absent consumers, preserving a saved fork and other messages', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const content = [{ type: 'text', text: 'caption', native_media: reference }];
    await mongoose.models.Message.create([
      { user: scope.ownerId, conversationId: 'conversation', messageId: 'source', content },
      { user: scope.ownerId, conversationId: 'fork', messageId: 'fork-one', content },
      { user: scope.ownerId, conversationId: 'fork', messageId: 'fork-two', content },
    ]);
    await native.retainMediaNativeConversation({
      scope,
      conversationId: 'fork',
      continuationRefs: [reference.continuationRef],
      maxRetainers: 4,
      limit: 4,
    });
    const messages = createMessageMethods(mongoose);
    expect(
      (await messages.deleteMessages({ user: scope.ownerId, messageId: 'source' })).deletedCount,
    ).toBe(1);
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'conversation',
      }),
    ).toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'fork',
      }),
    ).not.toBeNull();
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    expect(
      await mongoose.models.MediaThread.findOne({ threadId: job.threadId }).lean(),
    ).toMatchObject({ status: 'retired' });
    await messages.deleteMessages({ user: scope.ownerId, messageId: 'fork-one' });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'fork',
      }),
    ).not.toBeNull();
    await messages.deleteMessages({ user: scope.ownerId, messageId: 'fork-two' });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'fork',
      }),
    ).toBeNull();
  });

  it('protects unpublished clone claims and reclaims an abandoned clone after the claim expires', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    await mongoose.models.Message.create({
      user: scope.ownerId,
      conversationId: 'conversation',
      messageId: 'source',
      content: [{ type: 'text', text: 'caption', native_media: reference }],
    });
    await native.retainMediaNativeConversation({
      scope,
      conversationId: 'unpublished',
      continuationRefs: [reference.continuationRef],
      maxRetainers: 4,
      limit: 4,
      pendingUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    await native.migrateMediaNativeConsumers({ scope, limit: 10, maxRetainers: 1 });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'unpublished',
      }),
    ).not.toBeNull();
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      { $set: { 'nativeConsumerClaims.0.expiresAt': new Date(0).toISOString() } },
    );
    await native.migrateMediaNativeConsumers({ scope, limit: 10, maxRetainers: 1 });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'unpublished',
      }),
    ).toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'conversation',
      }),
    ).not.toBeNull();
  });

  it('releases an edited text-only native consumer without retaining private original text forever', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'old caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    const content = [{ type: 'text', text: 'corrected caption', native_media: reference }];
    await mongoose.models.Message.create({
      user: scope.ownerId,
      conversationId: 'conversation',
      messageId: 'source',
      content,
    });
    await createMessageMethods(mongoose).updateMessage(scope.ownerId, {
      messageId: 'source',
      content,
      userSubmittedPaths: ['/content/0/text'],
    });
    const stored = await mongoose.models.Message.findOne({ messageId: 'source' }).lean<{
      content: typeof content;
    }>();
    expect(stored?.content).toEqual([{ type: 'text', text: 'corrected caption' }]);
    expect((await media.getMediaJob(scope, job.jobId))?.nativeConsumers).toEqual([]);
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    expect(await mongoose.models.MediaNativePart.countDocuments({ jobId: job.jobId })).toBe(0);
  });

  it('backfills old forks from owned saved content without resurrecting an absent source', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'legacy caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      { $unset: { nativeConsumers: 1, nativeRetentionState: 1 } },
    );
    await mongoose.models.Message.create({
      messageId: 'fork-message',
      conversationId: 'old-fork',
      user: scope.ownerId,
      tenantId: scope.tenantId,
      content: [{ type: 'text', text: 'legacy caption', native_media: { ...reference } }],
    });
    await mongoose.models.Message.create({
      messageId: 'foreign-message',
      conversationId: 'foreign-fork',
      user: new mongoose.Types.ObjectId().toString(),
      tenantId: scope.tenantId,
      content: [{ type: 'text', text: 'legacy caption', native_media: { ...reference } }],
    });
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'old-fork',
      }),
    ).not.toBeNull();
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'conversation',
      }),
    ).toBeNull();
    await media.retireMediaThread(scope, job.threadId);
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    expect(
      await mongoose.models.MediaThread.findOne({ threadId: job.threadId }).lean(),
    ).toMatchObject({ status: 'retiring' });
    expect(
      await native.migrateMediaNativeConsumers({
        scope,
        threadId: job.threadId,
        maxRetainers: 1,
        limit: 10,
      }),
    ).toBe(1);
    await media.reconcileMediaRetirements({ scope, limit: 10 });
    expect((await media.getMediaJob(scope, job.jobId))?.nativeConsumers).toEqual(['old-fork']);
    expect(
      await native.getMediaNativeContinuation({
        scope,
        execution,
        ...reference,
        conversationId: 'old-fork',
      }),
    ).not.toBeNull();
    await native.releaseMediaNativeConversation({
      scope,
      conversationId: 'old-fork',
      maxRetainers: 1,
    });
    expect(await mongoose.models.MediaNativePart.countDocuments({ jobId: job.jobId })).toBe(0);
  });

  it('defers destructive legacy retirement when existing consumer count exceeds the configured bound', async () => {
    const job = await start();
    const reference = await native.recordMediaNativePart({
      scope,
      jobId: job.jobId,
      chunkIndex: 0,
      partIndex: 0,
      part: { kind: 'text', text: 'retained caption' },
      maxRetainers: 4,
    });
    await native.completeMediaNativeRecording({ scope, jobId: job.jobId });
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      { $unset: { nativeConsumers: 1, nativeRetentionState: 1 } },
    );
    await mongoose.models.Message.insertMany(
      ['first', 'second'].map((conversationId) => ({
        messageId: `${conversationId}-message`,
        conversationId,
        user: scope.ownerId,
        tenantId: scope.tenantId,
        content: [{ type: 'text', text: 'retained caption', native_media: { ...reference } }],
      })),
    );
    await expect(
      native.migrateMediaNativeConsumers({ scope, maxRetainers: 1, limit: 10 }),
    ).rejects.toMatchObject({ code: 'capacity' });
    expect((await media.getMediaJob(scope, job.jobId))?.nativeConsumers).toBeUndefined();
    expect(await mongoose.models.MediaNativePart.countDocuments({ jobId: job.jobId })).toBe(1);
    expect(await native.migrateMediaNativeConsumers({ scope, maxRetainers: 2, limit: 10 })).toBe(1);
    expect((await media.getMediaJob(scope, job.jobId))?.nativeConsumers?.sort()).toEqual([
      'first',
      'second',
    ]);
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
