import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  mediaAssetSchema,
  mediaImportReceiptSchema,
  mediaSubmissionReceiptSchema,
  mediaJobSchema,
  mediaSubmissionRequestSchema,
  mediaThreadSchema,
  mediaTurnSchema,
} from 'librechat-data-provider';
import type {
  MediaMethods,
  MediaOwnerScope,
  MediaStoredJob,
  StageMediaSubmissionInput,
} from '~/types/media';
import { createMediaMethods, deriveMediaThreadTitle } from './media';
import { runAsSystem, tenantStorage } from '~/config/tenantContext';
import { createKeyModel } from '~/models/key';
import { createFileMethods } from './file';

describe('media persistence on standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let methods: MediaMethods;
  let scope: MediaOwnerScope;
  const options = { maxRetainers: 4, maxTitleChars: 20 };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    methods = createMediaMethods(mongoose);
    createKeyModel(mongoose);
    await methods.ensureMediaIndexes();
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
    methods = createMediaMethods(mongoose);
  });

  function submission(clientRequestId: string, extra = {}): StageMediaSubmissionInput {
    const request = mediaSubmissionRequestSchema.parse({
      clientRequestId,
      operation: 'image.generate',
      prompt: 'A quiet observatory',
      selection: { connectionId: 'images', modelId: 'model-a', catalogVersion: 'v1' },
      ...extra,
    });
    return {
      scope,
      request,
      maxActiveJobs: 10,
      maxPendingTotal: 100,
      execution: {
        ...request.selection,
        api: 'openrouter.images',
        bindingRevision: 'destination-account-v1',
      },
    };
  }
  async function accepted(clientRequestId: string, extra = {}): Promise<MediaStoredJob> {
    const receipt = await methods.stageMediaSubmission(submission(clientRequestId, extra));
    const published = await methods.publishMediaSubmission(scope, receipt.jobId, options);
    expect(published?.phase).toBe('accepted');
    return (await methods.getMediaJob(scope, receipt.jobId))!;
  }

  it('bounds creation titles without truncating prompts or changing replay identity', async () => {
    const prompt = 'A🌲 in a quiet forest at dawn';
    const input = submission('bounded-title', { prompt });
    const receipt = await methods.stageMediaSubmission(input);
    await methods.publishMediaSubmission(scope, receipt.jobId, { ...options, maxTitleChars: 2 });
    expect((await methods.getMediaThread(scope, receipt.threadId))?.title).toBe('A');
    expect((await methods.getMediaJob(scope, receipt.jobId))?.request.prompt).toBe(prompt);
    expect(
      (
        await methods.listMediaTurns({
          scope,
          threadId: receipt.threadId,
          limit: 10,
          jobsPerTurn: 10,
        })
      ).items[0].prompt,
    ).toBe(prompt);
    expect((await methods.stageMediaSubmission(input)).jobId).toBe(receipt.jobId);
  });

  it('replaces a prompt-derived title once and never after the owner renames the thread', async () => {
    const job = await accepted('generated-title');
    const before = (await methods.getMediaThread(scope, job.threadId))!;
    expect(before.title).toBe(deriveMediaThreadTitle('A quiet observatory', options.maxTitleChars));
    expect(
      await methods.replaceMediaThreadTitle({
        scope,
        threadId: job.threadId,
        expectedTitle: before.title,
        title: 'Quiet Observatory',
      }),
    ).toBe(true);
    const generated = (await methods.getMediaThread(scope, job.threadId))!;
    expect(generated.title).toBe('Quiet Observatory');
    expect(generated.version).toBe(before.version + 1);
    expect(generated.updatedAt >= before.updatedAt).toBe(true);
    await methods.updateMediaThread({
      scope,
      threadId: job.threadId,
      expectedVersion: generated.version,
      title: 'My observatory',
    });
    expect(
      await methods.replaceMediaThreadTitle({
        scope,
        threadId: job.threadId,
        expectedTitle: 'Quiet Observatory',
        title: 'Late Generated Title',
      }),
    ).toBe(false);
    expect((await methods.getMediaThread(scope, job.threadId))?.title).toBe('My observatory');
    expect(
      await methods.replaceMediaThreadTitle({
        scope,
        threadId: 'missing-thread',
        expectedTitle: 'anything',
        title: 'Generated',
      }),
    ).toBe(false);
    expect(
      await methods.replaceMediaThreadTitle({
        scope: { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
        threadId: job.threadId,
        expectedTitle: 'My observatory',
        title: 'Stolen',
      }),
    ).toBe(false);
  });

  it('applies configured title bounds while recovering a preparing submission', async () => {
    const prompt = 'My long observatory prompt';
    const receipt = await methods.stageMediaSubmission(submission('recover-title', { prompt }));
    await methods.recoverMediaPublications({ scope, limit: 10, ...options, maxTitleChars: 7 });
    expect((await methods.getMediaThread(scope, receipt.threadId))?.title).toBe('My long');
    expect((await methods.getMediaJob(scope, receipt.jobId))?.request.prompt).toBe(prompt);
  });
  async function original(outputKey = 'upload:original') {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey,
      rendition: 'original',
      ingestToken: 'ingest-a',
      fingerprint: 'bytes-digest',
      storageKey: `images/${scope.ownerId}/${outputKey}.png`,
    });
    const content = {
      file_id: write.fileId,
      filename: 'original.png',
      type: 'image/png',
      bytes: 32,
      filepath: `/${write.storageKey}`,
      source: 'local',
      storageKey: write.storageKey,
      contentDigest: 'bytes-digest',
    };
    const asset = await methods.commitMediaAssetWrite({ scope, writeId: write.writeId, content });
    return { write, content, asset };
  }
  function fence(job: MediaStoredJob, now: string) {
    return {
      scope,
      jobId: job.jobId,
      leaseToken: job.leaseToken!,
      expectedVersion: job.version,
      now,
    };
  }

  it('publishes one linked job for simultaneous replay and rejects a changed request', async () => {
    const input = submission('same-key');
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () => methods.stageMediaSubmission(input)),
    );
    expect(new Set(receipts.map((item) => item.jobId)).size).toBe(1);
    expect(receipts.every((item) => item.phase === 'preparing')).toBe(true);
    expect(
      await methods.claimMediaJob({
        scope,
        workerId: 'w',
        now: new Date().toISOString(),
        leaseMs: 10000,
      }),
    ).toBeNull();
    await expect(
      methods.stageMediaSubmission(submission('same-key', { prompt: 'Different' })),
    ).rejects.toMatchObject({ code: 'conflict' });
    const results = await Promise.all(
      receipts.map((item) => methods.publishMediaSubmission(scope, item.jobId, options)),
    );
    results.forEach((item) =>
      expect(mediaSubmissionReceiptSchema.parse(item).phase).toBe('accepted'),
    );
    expect(await mongoose.models.MediaThread.countDocuments()).toBe(1);
    expect(await mongoose.models.MediaTurn.countDocuments()).toBe(1);
    expect(await mongoose.models.MediaJob.countDocuments()).toBe(1);
  });

  it('repairs a staged command with a fresh repository after process loss', async () => {
    const receipt = await methods.stageMediaSubmission(submission('crash-before-links'));
    methods = createMediaMethods(mongoose);
    expect(await methods.recoverMediaPublications({ scope, limit: 10, ...options })).toBe(1);
    expect(await methods.getMediaSubmission(scope, 'crash-before-links')).toMatchObject({
      ...receipt,
      phase: 'accepted',
    });
    expect(
      (
        await methods.listMediaTurns({
          scope,
          threadId: receipt.threadId,
          limit: 10,
          jobsPerTurn: 10,
        })
      ).items,
    ).toHaveLength(1);
  });

  it('repairs the sequence owner before assigning a parallel turn', async () => {
    const first = await accepted('first');
    const staged = await methods.stageMediaSubmission(
      submission('second', { threadId: first.threadId }),
    );
    const job = (await methods.getMediaJob(scope, staged.jobId))!;
    await mongoose.models.MediaTurn.create({
      ...scope,
      schemaVersion: 1,
      version: 1,
      threadId: job.threadId,
      turnId: job.turnId,
      threadEpoch: 1,
      kind: 'generation',
      createdAt: job.createdAt,
      updatedAt: job.createdAt,
      prompt: job.request.prompt,
      inputs: [],
      sourceJobId: job.jobId,
      newThread: false,
      publicationPhase: 'preparing',
    });
    await mongoose.models.MediaThread.updateOne(
      { threadId: first.threadId },
      { $set: { pendingTurnId: job.turnId }, $inc: { nextTurnSequence: 1 } },
    );
    const third = await accepted('third', { threadId: first.threadId });
    await methods.publishMediaSubmission(scope, staged.jobId, options);
    const turns = await methods.listMediaTurns({
      scope,
      threadId: third.threadId,
      limit: 10,
      jobsPerTurn: 10,
    });
    expect(turns.items.map((turn) => turn.sequence)).toEqual([1, 2, 3]);
  });

  it('enforces queue capacity with an index across independent repositories', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        createMediaMethods(mongoose).stageMediaSubmission({
          ...submission(`capacity-${index}`),
          maxActiveJobs: 2,
        }),
      ),
    );
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(2);
    expect(await mongoose.models.MediaJob.countDocuments()).toBe(2);
  });

  it('isolates owner and tenant reads, commands, and tenant contexts', async () => {
    const job = await accepted('private');
    const stranger = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    expect(await methods.getMediaJob(stranger, job.jobId)).toBeNull();
    expect(await methods.getMediaSubmission({ ...scope, tenantId: 'other' }, 'private')).toBeNull();
    expect(await methods.cancelMediaJob(stranger, job.jobId)).toBeNull();
    expect(await methods.retireMediaThread(stranger, job.threadId)).toBe(false);
    await expect(
      tenantStorage.run({ tenantId: 'other' }, async () => methods.getMediaJob(scope, job.jobId)),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('has authoritative import receipts without any provider job', async () => {
    const { asset } = await original();
    const request = {
      schemaVersion: 1 as const,
      clientRequestId: 'import-1',
      inputs: [{ role: 'reference' as const, file_id: asset.file_id }],
    };
    const receipts = await Promise.all([
      methods.stageMediaImport({ scope, request }),
      methods.stageMediaImport({ scope, request }),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    const published = await methods.publishMediaImport(scope, receipts[0].turnId, options);
    expect(mediaImportReceiptSchema.parse(published).phase).toBe('accepted');
    expect(await mongoose.models.MediaJob.countDocuments()).toBe(0);
    expect(
      await methods.claimMediaAssetDeletion({ scope, fileId: asset.file_id, token: 'delete' }),
    ).toBeNull();
    // Import and generation request identifiers intentionally have separate namespaces.
    expect((await methods.stageMediaSubmission(submission('import-1'))).phase).toBe('preparing');
  });

  it('bounds recovered import titles while preserving the original import request', async () => {
    const { asset } = await original();
    const request = {
      schemaVersion: 1 as const,
      clientRequestId: 'import-title',
      title: 'Imported reference set',
      inputs: [{ role: 'reference' as const, file_id: asset.file_id }],
    };
    const receipt = await methods.stageMediaImport({ scope, request });
    await methods.recoverMediaPublications({ scope, limit: 10, ...options, maxTitleChars: 8 });
    expect((await methods.getMediaThread(scope, receipt.threadId))?.title).toBe('Imported');
    expect((await methods.stageMediaImport({ scope, request })).turnId).toBe(receipt.turnId);
  });

  it('rejects an import of someone else’s original without publishing a job', async () => {
    const { asset } = await original();
    const other = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    const receipt = await methods.stageMediaImport({
      scope: other,
      request: {
        schemaVersion: 1,
        clientRequestId: 'foreign',
        inputs: [{ role: 'reference', file_id: asset.file_id }],
      },
    });
    expect(await methods.publishMediaImport(other, receipt.turnId, options)).toMatchObject({
      phase: 'rejected',
      error: { code: 'invalid_request' },
    });
    expect(await mongoose.models.MediaJob.countDocuments()).toBe(0);
  });

  it('allows only one claim and fences stale writes after takeover', async () => {
    const job = await accepted('claim');
    const now = new Date(Date.now() + 1000).toISOString();
    const claims = await Promise.all(
      ['one', 'two'].map((workerId) =>
        methods.claimMediaJob({ scope, workerId, now, leaseMs: 1000 }),
      ),
    );
    const claimed = claims.find((item) => item !== null)!;
    expect(claims.filter(Boolean)).toHaveLength(1);
    const begun = (await methods.beginMediaSubmission(fence(claimed, now)))!;
    expect(begun.phase).toBe('submitting');
    const later = new Date(new Date(now).getTime() + 2000).toISOString();
    const takeover = (await methods.claimMediaJob({
      scope,
      workerId: 'restart',
      now: later,
      leaseMs: 1000,
    }))!;
    expect(takeover).toMatchObject({
      jobId: job.jobId,
      phase: 'reconciling',
      provider: { certainty: 'unknown' },
    });
    expect(
      await methods.recordMediaJobObservation({
        ...fence(begun, later),
        observation: {
          phase: 'succeeded',
          provider: { certainty: 'terminal' },
        },
      }),
    ).toBeNull();
    await expect(
      methods.recordMediaJobObservation({
        ...fence(takeover, later),
        observation: { phase: 'queued' },
      }),
    ).rejects.toMatchObject({ code: 'unsafe_retry' });
    await expect(
      methods.retryMediaJob({
        scope,
        jobId: job.jobId,
        clientRequestId: 'unsafe',
        maxActiveJobs: 10,
        maxPendingTotal: 100,
      }),
    ).rejects.toMatchObject({ code: 'unsafe_retry' });
  });

  it('records cancellation intent for an unknown remote outcome', async () => {
    await accepted('cancel-submitted');
    const now = new Date(Date.now() + 1000).toISOString();
    const claim = (await methods.claimMediaJob({ scope, workerId: 'one', now, leaseMs: 10000 }))!;
    const begun = (await methods.beginMediaSubmission(fence(claim, now)))!;
    const result = await methods.cancelMediaJob(scope, begun.jobId);
    expect(result?.phase).toBe('submitting');
    expect((await methods.getMediaJob(scope, begun.jobId))?.cancelRequestedAt).toBeDefined();
    expect(result?.allowedActions.retry).toBe(false);
  });

  it('explicit safe retry creates a new job under the immutable turn', async () => {
    const job = await accepted('cancel-queued');
    await methods.cancelMediaJob(scope, job.jobId);
    const receipt = await methods.retryMediaJob({
      scope,
      jobId: job.jobId,
      clientRequestId: 'retry',
      maxActiveJobs: 10,
      maxPendingTotal: 100,
    });
    expect(receipt.turnId).toBe(job.turnId);
    expect(receipt.jobId).not.toBe(job.jobId);
    await methods.publishMediaSubmission(scope, receipt.jobId, options);
    expect((await methods.getMediaJob(scope, job.jobId))?.phase).toBe('cancelled');
    expect((await methods.getMediaJob(scope, receipt.jobId))?.retryOfJobId).toBe(job.jobId);
    expect(await mongoose.models.MediaTurn.countDocuments()).toBe(1);
  });

  it('prevents dispatch after thread retirement and never recreates the identity', async () => {
    const job = await accepted('retire');
    const now = new Date(Date.now() + 1000).toISOString();
    const claim = (await methods.claimMediaJob({ scope, workerId: 'one', now, leaseMs: 10000 }))!;
    await methods.retireMediaThread(scope, job.threadId);
    expect(await methods.beginMediaSubmission(fence(claim, now))).toBeNull();
    expect(await methods.getMediaThread(scope, job.threadId)).toBeNull();
    await expect(
      methods.stageMediaSubmission(submission('late', { threadId: job.threadId })),
    ).rejects.toMatchObject({ code: 'retired' });
    expect(await mongoose.models.MediaThread.countDocuments()).toBe(1);
  });

  it('never claims a native chat-owned job for paid execution', async () => {
    const receipt = await methods.stageMediaSubmission({
      ...submission('native'),
      executionOwner: 'chat',
    });
    await methods.publishMediaSubmission(scope, receipt.jobId, options);
    expect(
      await methods.claimMediaJob({
        scope,
        workerId: 'one',
        now: new Date(Date.now() + 1000).toISOString(),
        leaseMs: 10000,
      }),
    ).toBeNull();
  });

  it('returns public snapshots without credentials, provider recovery URLs, or owner fields', async () => {
    const job = await accepted('public');
    const view = await methods.getMediaJobView(scope, job.jobId);
    expect(mediaJobSchema.parse(view)).toEqual(view);
    expect(view).not.toHaveProperty('ownerId');
    expect(view).not.toHaveProperty('execution');
    expect(view).not.toHaveProperty('provider');
  });

  it('paginates stable turn creation order while jobs complete independently', async () => {
    const first = await accepted('ordered');
    await Promise.all(
      ['parallel-a', 'parallel-b', 'parallel-c'].map((key) =>
        accepted(key, { threadId: first.threadId, parentTurnId: first.turnId }),
      ),
    );
    const one = await methods.listMediaTurns({
      scope,
      threadId: first.threadId,
      limit: 2,
      jobsPerTurn: 2,
    });
    const two = await methods.listMediaTurns({
      scope,
      threadId: first.threadId,
      limit: 2,
      jobsPerTurn: 2,
      cursor: one.nextCursor,
    });
    expect([...one.items, ...two.items].map((turn) => turn.sequence)).toEqual([1, 2, 3, 4]);
    expect(two.nextCursor).toBeUndefined();
  });

  it('discovers restart work only through an explicit bounded system scan', async () => {
    await methods.stageMediaSubmission(submission('due'));
    await expect(
      methods.listDueMediaScopes({ now: new Date().toISOString(), limit: 1 }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const result = await runAsSystem(async () =>
      methods.listDueMediaScopes({ now: new Date().toISOString(), limit: 1 }),
    );
    expect(result.items).toEqual([scope]);
  });

  it('resolves credentials and expiry in one private snapshot', async () => {
    const expiresAt = new Date(Date.now() + 60000);
    await mongoose.models.Key.create({
      userId: scope.ownerId,
      tenantId: null,
      name: 'images',
      value: 'encrypted-only',
      expiresAt,
    });
    expect(await methods.getStoredMediaCredential({ scope, name: 'images' })).toMatchObject({
      value: 'encrypted-only',
      expiresAt: expiresAt.toISOString(),
    });
    expect(
      await methods.getStoredMediaCredential({
        scope: { ...scope, tenantId: 'other' },
        name: 'images',
      }),
    ).toBeNull();
  });

  it('replays immutable asset publication and detects changed bytes', async () => {
    const { write, content, asset } = await original();
    expect(await methods.commitMediaAssetWrite({ scope, writeId: write.writeId, content })).toEqual(
      asset,
    );
    await expect(
      methods.commitMediaAssetWrite({
        scope,
        writeId: write.writeId,
        content: { ...content, contentDigest: 'changed' },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await mongoose.models.File.countDocuments()).toBe(1);
    expect(await methods.getMediaAssetContent(scope, asset.file_id)).toMatchObject({
      storageKey: write.storageKey,
      contentDigest: content.contentDigest,
    });
  });

  it('omits unset dimensions when publishing and reading a video original', async () => {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey: 'video-original',
      rendition: 'original',
      ingestToken: 'video-ingest',
      fingerprint: 'video-digest',
      storageKey: `images/${scope.ownerId}/original.mp4`,
    });
    const asset = await methods.commitMediaAssetWrite({
      scope,
      writeId: write.writeId,
      content: {
        file_id: write.fileId,
        filename: 'original.mp4',
        type: 'video/mp4',
        width: undefined,
        height: undefined,
        bytes: 32,
        filepath: `/${write.storageKey}`,
        source: 'local',
        storageKey: write.storageKey,
        contentDigest: 'video-digest',
      },
    });
    expect(mediaAssetSchema.parse(asset)).toMatchObject({ type: 'video/mp4', bytes: 32 });
    expect(asset).not.toHaveProperty('width');
    expect(asset).not.toHaveProperty('height');
    expect(mediaAssetSchema.parse(await methods.getMediaAsset(scope, asset.file_id))).toEqual(
      asset,
    );
  });

  it('normalizes unset dimensions in previously stored output and cover snapshots', async () => {
    const { asset } = await original();
    const job = await accepted('legacy-video', { operation: 'video.generate' });
    const legacyAsset = {
      ...asset,
      type: 'video/mp4',
      width: null,
      height: null,
      durationSeconds: null,
    };
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      {
        $set: {
          phase: 'succeeded',
          outputs: [
            {
              kind: 'video',
              outputId: 'video-output',
              ordinal: 0,
              state: 'ready',
              asset: legacyAsset,
            },
          ],
        },
      },
    );
    await mongoose.models.MediaThread.updateOne(
      { threadId: job.threadId },
      { $set: { cover: legacyAsset } },
    );
    const detail = mediaJobSchema.parse(await methods.getMediaJobView(scope, job.jobId));
    expect(detail.outputs[0]).toMatchObject({ kind: 'video', asset: { type: 'video/mp4' } });
    expect(detail.outputs[0]).not.toHaveProperty('asset.width');
    const jobs = await methods.listMediaTurnJobs({ scope, turnId: job.turnId, limit: 10 });
    expect(mediaJobSchema.parse(jobs.items[0])).toEqual(detail);
    const turns = await methods.listMediaTurns({
      scope,
      threadId: job.threadId,
      limit: 10,
      jobsPerTurn: 10,
    });
    expect(mediaJobSchema.parse(turns.items[0].jobs[0])).toEqual(detail);
    const thread = mediaThreadSchema.parse(await methods.getMediaThread(scope, job.threadId));
    expect(thread.cover).not.toHaveProperty('height');
    expect(thread.cover).not.toHaveProperty('durationSeconds');
    const threads = await methods.listMediaThreads({ scope, limit: 10 });
    expect(mediaThreadSchema.parse(threads.items[0])).toEqual(thread);
  });

  it('shows a gallery original and model before opening its thread, without changing legacy views', async () => {
    const { asset } = await original();
    const job = await accepted('unopened-gemini', {
      selection: { connectionId: 'router', modelId: 'google/gemini-image', catalogVersion: 'v1' },
    });
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      {
        $set: {
          phase: 'succeeded',
          outputs: [
            { kind: 'text', outputId: 'caption', ordinal: 0, text: 'Here is your image' },
            { kind: 'image', outputId: 'image', ordinal: 1, state: 'ready', asset },
          ],
        },
      },
    );
    const legacy = (await methods.listMediaThreads({ scope, limit: 10 })).items[0];
    expect(legacy.cover).toBeUndefined();
    expect(legacy.activity).toBeUndefined();
    const result = await methods.listMediaThreads({ scope, limit: 10, include: 'activity' });
    const thread = mediaThreadSchema.parse(result.items[0]);
    expect(thread).toMatchObject({
      cover: asset,
      pendingJobCount: 0,
      activity: { readyOutputs: 1, latestJob: { phase: 'succeeded', selection: job.selection } },
    });
    expect(thread.version).toBe(legacy.version);
    expect(thread).not.toHaveProperty('ownerId');
    expect(thread.activity?.latestJob).not.toHaveProperty('execution');
    const stored = await mongoose.models.MediaThread.findOne({ threadId: job.threadId }).lean();
    expect(stored).toMatchObject({ threadId: job.threadId });
    expect(stored).not.toHaveProperty('cover');
  });

  it('filters and paginates gallery results by saved output instead of treating failures as completed', async () => {
    const { asset } = await original();
    const ready = await accepted('ready-gallery');
    const failed = await accepted('failed-gallery');
    const pending = await accepted('pending-gallery');
    await mongoose.models.MediaJob.updateOne(
      { jobId: ready.jobId },
      {
        $set: {
          phase: 'succeeded',
          outputs: [{ kind: 'image', outputId: 'ready', ordinal: 0, state: 'ready', asset }],
        },
      },
    );
    await mongoose.models.MediaJob.updateOne(
      { jobId: failed.jobId },
      { $set: { phase: 'failed' } },
    );
    const completed = await methods.listMediaThreads({
      scope,
      limit: 1,
      include: 'activity',
      filter: 'completed',
    });
    expect(completed.items.map((thread) => thread.threadId)).toEqual([ready.threadId]);
    expect(completed.nextCursor).toBeUndefined();
    const running = await methods.listMediaThreads({
      scope,
      limit: 1,
      include: 'activity',
      filter: 'pending',
    });
    expect(running.items.map((thread) => thread.threadId)).toEqual([pending.threadId]);
    const first = await methods.listMediaThreads({ scope, limit: 2, include: 'activity' });
    const second = await methods.listMediaThreads({
      scope,
      limit: 2,
      include: 'activity',
      cursor: first.nextCursor,
    });
    expect(new Set([...first.items, ...second.items].map((thread) => thread.threadId)).size).toBe(
      3,
    );
    expect(second.nextCursor).toBeUndefined();
  });

  it('keeps explicit gallery covers cleared and excludes other owners and tenants from activity', async () => {
    const { asset } = await original();
    const job = await accepted('private-gallery');
    await mongoose.models.MediaThread.updateOne(
      { threadId: job.threadId },
      { $set: { coverExplicit: true } },
    );
    await mongoose.models.MediaJob.updateOne(
      { jobId: job.jobId },
      {
        $set: {
          phase: 'succeeded',
          outputs: [{ kind: 'image', outputId: 'own', ordinal: 0, state: 'ready', asset }],
        },
      },
    );
    const row = await mongoose.models.MediaJob.findOne({ jobId: job.jobId }).lean();
    for (const other of [
      { ownerId: new mongoose.Types.ObjectId().toString() },
      { tenantId: 'another-tenant' },
    ]) {
      await mongoose.models.MediaJob.collection.insertOne({
        ...row,
        ...other,
        _id: new mongoose.Types.ObjectId(),
        jobId: new mongoose.Types.ObjectId().toString(),
        phase: 'running',
        createdAt: '2099-01-01T00:00:00.000Z',
      });
    }
    const thread = (await methods.listMediaThreads({ scope, limit: 10, include: 'activity' }))
      .items[0];
    expect(thread.cover).toBeUndefined();
    expect(thread).toMatchObject({
      pendingJobCount: 0,
      activity: { readyOutputs: 1, latestJob: { phase: 'succeeded' } },
    });
  });

  it('linearizes save versus retirement on the File document', async () => {
    const { asset } = await original();
    const [saved, deletion] = await Promise.all([
      methods.retainMediaAsset({
        scope,
        fileId: asset.file_id,
        retainer: 'library',
        maxRetainers: 2,
      }),
      methods.claimMediaAssetDeletion({ scope, fileId: asset.file_id, token: 'delete' }),
    ]);
    expect(Number(saved) + Number(deletion !== null)).toBe(1);
    if (deletion) {
      expect(
        await methods.completeMediaAssetDeletion({ scope, fileId: asset.file_id, token: 'wrong' }),
      ).toBe(false);
      expect(
        await methods.completeMediaAssetDeletion({ scope, fileId: asset.file_id, token: 'delete' }),
      ).toBe(true);
      expect(await methods.getMediaAsset(scope, asset.file_id)).toBeNull();
    }
  });

  it('bounds retainers and keeps live originals out of legacy deletion and retention', async () => {
    const { asset } = await original();
    await mongoose.models.File.updateOne(
      { file_id: asset.file_id },
      { $set: { expiredAt: new Date(0) } },
    );
    expect(
      await methods.retainMediaAsset({
        scope,
        fileId: asset.file_id,
        retainer: 'one',
        maxRetainers: 1,
      }),
    ).toBe(true);
    expect(
      await methods.retainMediaAsset({
        scope,
        fileId: asset.file_id,
        retainer: 'two',
        maxRetainers: 1,
      }),
    ).toBe(false);
    const legacy = createFileMethods(mongoose);
    expect(await legacy.getExpiredFiles()).toEqual([]);
    expect(await legacy.deleteFile(asset.file_id)).toBeNull();
    expect(await legacy.deleteFiles([asset.file_id])).toMatchObject({ deletedCount: 0 });
    expect(await methods.getMediaAsset(scope, asset.file_id)).not.toBeNull();
  });

  it('enforces deployment queue and execution capacity across owners and process restarts', async () => {
    const firstInput = { ...submission('global-first'), maxPendingTotal: 1 };
    const secondInput = {
      ...submission('global-second'),
      maxPendingTotal: 1,
      scope: { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
    };
    const first = await methods.stageMediaSubmission(firstInput);
    expect((await methods.stageMediaSubmission(secondInput)).phase).toBe('rejected');
    await methods.publishMediaSubmission(scope, first.jobId, options);
    expect(
      await methods.acquireMediaPermit({
        scope,
        jobId: first.jobId,
        kind: 'deployment',
        capacity: 1,
      }),
    ).toBe(true);
    const second = await methods.stageMediaSubmission({
      ...secondInput,
      maxPendingTotal: 10,
      request: { ...secondInput.request, clientRequestId: 'global-third' },
    });
    await methods.publishMediaSubmission(secondInput.scope, second.jobId, options);
    methods = createMediaMethods(mongoose);
    expect(
      await methods.acquireMediaPermit({
        scope: secondInput.scope,
        jobId: second.jobId,
        kind: 'deployment',
        capacity: 1,
      }),
    ).toBe(false);
    const now = new Date(Date.now() + 1000).toISOString();
    const claimed = (await methods.claimMediaJob({
      scope,
      workerId: 'worker',
      now,
      leaseMs: 10000,
    }))!;
    const submitted = (await methods.beginMediaSubmission(fence(claimed, now)))!;
    expect(await methods.releaseMediaPermits({ scope, jobId: first.jobId })).toBe(false);
    expect(
      await methods.recordMediaJobObservation({
        ...fence(submitted, now),
        observation: {
          phase: 'failed',
          provider: { certainty: 'terminal' },
        },
      }),
    ).not.toBeNull();
    expect(
      await methods.acquireMediaPermit({
        scope: secondInput.scope,
        jobId: second.jobId,
        kind: 'deployment',
        capacity: 1,
      }),
    ).toBe(true);
  });

  it('repairs a lost asset receipt acknowledgement from the canonical immutable File', async () => {
    const { write, asset } = await original();
    await mongoose.models.MediaAssetWrite.updateOne(
      { writeId: write.writeId },
      { $set: { state: 'reserved' }, $unset: { asset: 1 } },
    );
    expect(
      await methods.getPublishedMediaAsset({
        scope,
        outputKey: write.outputKey,
        rendition: 'original',
      }),
    ).toEqual(asset);
    expect(
      await mongoose.models.MediaAssetWrite.findOne({ writeId: write.writeId }).lean(),
    ).toMatchObject({ state: 'published' });
    expect(
      await methods.getPublishedMediaAsset({
        scope: { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
        outputKey: write.outputKey,
        rendition: 'original',
      }),
    ).toBeNull();
  });

  it('replays an import by original request identity after capturing different immutable file IDs', async () => {
    const { asset } = await original();
    const identityRequest = {
      schemaVersion: 1 as const,
      clientRequestId: 'captured-import',
      inputs: [{ role: 'reference' as const, file_id: 'legacy-source' }],
    };
    const first = await methods.stageMediaImport({
      scope,
      identityRequest,
      request: { ...identityRequest, inputs: [{ role: 'reference', file_id: asset.file_id }] },
    });
    await methods.publishMediaImport(scope, first.turnId, options);
    expect(
      await methods.stageMediaImport({ scope, request: identityRequest, identityRequest }),
    ).toMatchObject({ turnId: first.turnId, phase: 'accepted' });
    expect(await mongoose.models.MediaTurn.findOne({ turnId: first.turnId }).lean()).toMatchObject({
      inputs: [{ file_id: asset.file_id }],
    });
  });

  it('preserves a hard retention deadline when saving an orphan into a thread', async () => {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey: 'temporary-copy',
      rendition: 'original',
      ingestToken: 'hard',
      fingerprint: 'hard',
      storageKey: 'images/hard.png',
    });
    const deadline = new Date(Date.now() + 60000).toISOString();
    await methods.commitMediaAssetWrite({
      scope,
      writeId: write.writeId,
      content: {
        file_id: write.fileId,
        filename: 'hard.png',
        type: 'image/png',
        bytes: 1,
        filepath: '/images/hard.png',
        source: 'local',
        storageKey: write.storageKey,
        contentDigest: 'hard',
        expiredAt: deadline,
        hardExpiresAt: deadline,
      },
    });
    expect(
      await methods.retainMediaAsset({
        scope,
        fileId: write.fileId,
        retainer: 'thread:temporary',
        maxRetainers: 4,
      }),
    ).toBe(true);
    expect((await methods.getMediaAssetContent(scope, write.fileId))?.expiredAt).toBe(deadline);
    const expired = await methods.listMediaExpiredAssets({
      scope,
      limit: 10,
      now: new Date(Date.parse(deadline) + 1).toISOString(),
    });
    expect(expired.map((asset) => asset.file_id)).toContain(write.fileId);
  });

  it('fences account deletion against queued dispatch and safely releases a rejected deletion attempt', async () => {
    const job = await accepted('delete-busy');
    const now = new Date(Date.now() + 1000).toISOString();
    const claimed = (await methods.claimMediaJob({
      scope,
      workerId: 'worker',
      now,
      leaseMs: 10000,
    }))!;
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete-one' })).toBe(false);
    expect(await methods.beginMediaSubmission(fence(claimed, now))).toBeNull();
    await expect(methods.stageMediaSubmission(submission('delete-new'))).rejects.toMatchObject({
      code: 'retired',
    });
    await methods.cancelMediaAccountDeletion({ scope, token: 'wrong-token' });
    expect(await methods.beginMediaSubmission(fence(claimed, now))).toBeNull();
    await methods.cancelMediaAccountDeletion({ scope, token: 'delete-one' });
    expect(await methods.beginMediaSubmission(fence(claimed, now))).not.toBeNull();
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete-two' })).toBe(false);
    expect((await methods.getMediaJob(scope, job.jobId))?.provider.certainty).toBe('unknown');
  });

  it('retains a deleted owner tombstone and erases history only after durable retirement begins', async () => {
    const { asset } = await original();
    const job = await accepted('delete-safe', {
      inputs: [{ role: 'reference', file_id: asset.file_id }],
    });
    await methods.cancelMediaJob(scope, job.jobId);
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete' })).toBe(true);
    await methods.completeMediaAccountDeletion({ scope, token: 'delete' });
    await methods.completeMediaAccountDeletion({ scope, token: 'delete' });
    expect(await methods.getMediaThread(scope, job.threadId)).toBeNull();
    expect(
      (
        await runAsSystem(() =>
          methods.listMediaCleanupScopes({ limit: 10, now: new Date().toISOString() }),
        )
      ).items,
    ).toContainEqual(scope);
    await methods.reconcileMediaAccountDeletion({ scope, limit: 10 });
    expect(await methods.getMediaJob(scope, job.jobId)).toBeNull();
    const claimed = await methods.claimMediaAssetDeletion({
      scope,
      fileId: asset.file_id,
      token: 'storage-delete',
    });
    expect(claimed?.file_id).toBe(asset.file_id);
    await methods.completeMediaAssetDeletion({
      scope,
      fileId: asset.file_id,
      token: 'storage-delete',
    });
    await methods.reconcileMediaAccountDeletion({ scope, limit: 10 });
    expect(await mongoose.models.File.countDocuments({ user: scope.ownerId })).toBe(0);
    expect(await mongoose.models.MediaOwner.findOne(scope).lean()).toMatchObject({
      status: 'deleted',
    });
    await methods.cancelMediaAccountDeletion({ scope, token: 'delete' });
    await expect(methods.stageMediaSubmission(submission('resurrect'))).rejects.toMatchObject({
      code: 'retired',
    });
  });

  it('recovers an admitted original after a crash before File publication and excludes it from cleanup', async () => {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey: 'crash-upload',
      rendition: 'original',
      ingestToken: 'crash',
      fingerprint: 'digest',
      storageKey: 'images/crash.png',
    });
    const content = {
      file_id: write.fileId,
      filename: 'crash.png',
      type: 'image/png',
      bytes: 2,
      filepath: '/images/crash.png',
      source: 'local',
      storageKey: write.storageKey,
      contentDigest: 'digest',
    };
    const failedWrite = jest.spyOn(mongoose.models.File, 'updateOne').mockImplementationOnce(() => {
      throw new Error('database disconnected');
    });
    await expect(
      methods.commitMediaAssetWrite({ scope, writeId: write.writeId, content }),
    ).rejects.toThrow('database disconnected');
    failedWrite.mockRestore();
    expect(
      await mongoose.models.MediaAssetWrite.findOne({ writeId: write.writeId }).lean(),
    ).toMatchObject({ state: 'committing', publicationContent: content });
    expect(
      await methods.claimMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'cleanup',
        staleBefore: new Date(Date.now() + 60000).toISOString(),
      }),
    ).toBeNull();
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete' })).toBe(false);
    methods = createMediaMethods(mongoose);
    expect(await methods.recoverMediaAssetWrites({ scope, limit: 1 })).toBe(1);
    expect(await methods.getMediaAsset(scope, write.fileId)).toMatchObject({
      file_id: write.fileId,
    });
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete' })).toBe(true);
  });

  it('fences an old unpublished upload before authorizing byte deletion', async () => {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey: 'old-upload',
      rendition: 'original',
      ingestToken: 'old',
      fingerprint: 'digest',
      storageKey: 'images/old.png',
    });
    const staleBefore = new Date(Date.now() + 60000).toISOString();
    expect(
      (await methods.listMediaAssetWritesForCleanup({ scope, limit: 1, staleBefore }))[0].writeId,
    ).toBe(write.writeId);
    expect(
      await methods.claimMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'cleanup',
        staleBefore,
      }),
    ).toMatchObject({ storageKey: write.storageKey, token: 'cleanup' });
    await expect(
      methods.commitMediaAssetWrite({
        scope,
        writeId: write.writeId,
        content: {
          file_id: write.fileId,
          filename: 'late.png',
          type: 'image/png',
          bytes: 2,
          filepath: '/images/old.png',
          source: 'local',
          storageKey: write.storageKey,
          contentDigest: 'digest',
        },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await mongoose.models.File.countDocuments()).toBe(0);
    expect(
      await methods.completeMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'wrong',
      }),
    ).toBe(false);
    expect(
      await methods.completeMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'cleanup',
      }),
    ).toBe(true);
  });

  it('never hands a canonical original path to staging cleanup even after a lost acknowledgement', async () => {
    const { write } = await original();
    await mongoose.models.MediaAssetWrite.updateOne(
      { writeId: write.writeId },
      { $set: { state: 'reserved' }, $unset: { asset: 1 } },
    );
    expect(
      await methods.claimMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'cleanup',
        staleBefore: new Date(Date.now() + 60000).toISOString(),
      }),
    ).toBeNull();
    expect(await methods.getMediaAsset(scope, write.fileId)).not.toBeNull();
  });

  it('allows explicit cleanup when a paused uploader writes after its receipt was deleted', async () => {
    const write = await methods.reserveMediaAssetWrite({
      scope,
      outputKey: 'paused-upload',
      rendition: 'original',
      ingestToken: 'paused',
      fingerprint: 'digest',
      storageKey: 'images/paused.png',
    });
    const staleBefore = new Date(Date.now() + 60000).toISOString();
    await methods.claimMediaAssetWriteDeletion({
      scope,
      writeId: write.writeId,
      token: 'first',
      staleBefore,
    });
    await methods.completeMediaAssetWriteDeletion({
      scope,
      writeId: write.writeId,
      token: 'first',
    });
    expect(await methods.listMediaAssetWritesForCleanup({ scope, limit: 1, staleBefore })).toEqual(
      [],
    );
    expect(await methods.prepareMediaAccountDeletion({ scope, token: 'delete-paused' })).toBe(true);
    await methods.completeMediaAccountDeletion({ scope, token: 'delete-paused' });
    await methods.reconcileMediaAccountDeletion({ scope, limit: 10 });
    // The uploader opens and finishes its private path after the first cleanup acknowledgement.
    await expect(
      methods.commitMediaAssetWrite({
        scope,
        writeId: write.writeId,
        content: {
          file_id: write.fileId,
          filename: 'paused.png',
          type: 'image/png',
          bytes: 2,
          filepath: '/images/paused.png',
          source: 'local',
          storageKey: write.storageKey,
          contentDigest: 'digest',
        },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(
      await methods.claimMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'late',
        staleBefore,
      }),
    ).toMatchObject({ storageKey: write.storageKey, token: 'late' });
    expect(
      await methods.completeMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'first',
      }),
    ).toBe(false);
    expect(
      await methods.completeMediaAssetWriteDeletion({
        scope,
        writeId: write.writeId,
        token: 'late',
      }),
    ).toBe(true);
    expect(await mongoose.models.File.countDocuments()).toBe(0);
  });

  it('prevents legacy metadata mutation from moving original bytes or attaching a Mongo TTL', async () => {
    const { asset } = await original();
    await mongoose.models.File.updateOne(
      { file_id: asset.file_id },
      { $set: { source: 'firebase', storageKey: 'other-location', expiresAt: new Date(0) } },
    );
    const stored = await mongoose.models.File.findOne({ file_id: asset.file_id }).lean();
    expect(stored).toMatchObject({ source: 'local' });
    expect(stored).not.toHaveProperty('expiresAt');
    expect(stored).not.toMatchObject({ storageKey: 'other-location' });
  });

  it('pages distinct scopes before applying a bound so prolific owners cannot hide intermediate owners', async () => {
    const owners = [
      '100000000000000000000001',
      '100000000000000000000002',
      '100000000000000000000003',
    ];
    scope = { ownerId: owners[0], tenantId: null };
    await Promise.all(
      [1, 2, 3].map((index) => methods.stageMediaSubmission(submission(`many-${index}`))),
    );
    scope = { ownerId: owners[1], tenantId: null };
    await methods.stageMediaSubmission(submission('middle'));
    const tenantScope = { ...scope, tenantId: 'tenant-z' };
    await methods.stageMediaSubmission({ ...submission('middle-tenant'), scope: tenantScope });
    scope = { ownerId: owners[2], tenantId: null };
    await methods.stageMediaImport({
      scope,
      request: { schemaVersion: 1, clientRequestId: 'last-import', inputs: [] },
    });
    const found: MediaOwnerScope[] = [];
    let cursor: string | undefined;
    do {
      const page = await runAsSystem(() =>
        methods.listDueMediaScopes({ limit: 1, now: new Date().toISOString(), cursor }),
      );
      found.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(found).toEqual([
      { ownerId: owners[0], tenantId: null },
      { ownerId: owners[1], tenantId: null },
      tenantScope,
      { ownerId: owners[2], tenantId: null },
    ]);
  });

  it.each(['media', 'chat'] as const)(
    'repairs a %s thread projection on detail read after a crash following terminal job CAS',
    async (executionOwner) => {
      const { asset } = await original();
      const receipt = await methods.stageMediaSubmission({
        ...submission('projection-crash'),
        executionOwner,
      });
      await methods.publishMediaSubmission(scope, receipt.jobId, options);
      await methods.retainMediaThreadAsset({
        scope,
        threadId: receipt.threadId,
        fileId: asset.file_id,
        maxRetainers: options.maxRetainers,
      });
      const before = (await methods.listMediaThreads({ scope, limit: 10 })).items[0];
      expect(before).toMatchObject({ pendingJobCount: 1, turnCount: 1 });
      await mongoose.models.MediaJob.updateOne(
        { ...scope, jobId: receipt.jobId },
        {
          $set: {
            phase: 'succeeded',
            provider: { certainty: 'terminal' },
            outputs: [
              {
                kind: 'image',
                outputId: 'ready-image',
                ordinal: 0,
                state: 'ready',
                asset,
              },
            ],
          },
          $inc: { version: 1 },
        },
      );
      // The completion was durable; its summary write never ran before the process stopped.
      methods = createMediaMethods(mongoose);
      const staleList = (await methods.listMediaThreads({ scope, limit: 10 })).items[0];
      expect(staleList).toMatchObject({ pendingJobCount: 1, version: before.version });
      expect(staleList.cover).toBeUndefined();
      const restored = await methods.getMediaThread(scope, receipt.threadId);
      expect(restored).toMatchObject({
        pendingJobCount: 0,
        turnCount: 1,
        cover: asset,
        version: before.version + 1,
      });
      expect(await methods.getMediaThread(scope, receipt.threadId)).toEqual(restored);
      expect((await methods.listMediaThreads({ scope, limit: 10 })).items[0]).toEqual(restored);
      expect(
        await methods.getMediaThread(
          { ...scope, ownerId: new mongoose.Types.ObjectId().toString() },
          receipt.threadId,
        ),
      ).toBeNull();
    },
  );

  it('preserves an explicitly cleared cover while repairing a missed completion projection', async () => {
    const { asset } = await original();
    const job = await accepted('explicit-cover-projection');
    const before = (await methods.getMediaThread(scope, job.threadId))!;
    await methods.updateMediaThread({
      scope,
      threadId: job.threadId,
      expectedVersion: before.version,
      coverFileId: null,
    });
    await mongoose.models.MediaJob.updateOne(
      { ...scope, jobId: job.jobId },
      {
        $set: {
          phase: 'succeeded',
          provider: { certainty: 'terminal' },
          outputs: [
            {
              kind: 'image',
              outputId: 'ready-image',
              ordinal: 0,
              state: 'ready',
              asset,
            },
          ],
        },
        $inc: { version: 1 },
      },
    );
    const repaired = await methods.getMediaThread(scope, job.threadId);
    expect(repaired?.pendingJobCount).toBe(0);
    expect(repaired?.cover).toBeUndefined();
  });

  it('hides a temporary creation from the library and retires it once its retention passes', async () => {
    const retention = 60_000;
    const receipt = await methods.stageMediaSubmission(
      submission('temporary', { temporary: true }),
    );
    const published = await methods.publishMediaSubmission(scope, receipt.jobId, {
      ...options,
      temporaryRetentionMs: retention,
    });
    expect(published?.phase).toBe('accepted');
    const thread = mediaThreadSchema.parse(await methods.getMediaThread(scope, receipt.threadId));
    expect(thread.expiresAt).toBe(
      new Date(new Date(thread.createdAt).getTime() + retention).toISOString(),
    );
    const followUp = await methods.stageMediaSubmission(
      submission('temporary-follow-up', {
        threadId: receipt.threadId,
        parentTurnId: receipt.turnId,
      }),
    );
    expect(
      (
        await methods.publishMediaSubmission(scope, followUp.jobId, {
          ...options,
          temporaryRetentionMs: 1,
        })
      )?.phase,
    ).toBe('accepted');
    expect((await methods.getMediaThread(scope, receipt.threadId))?.expiresAt).toBe(
      thread.expiresAt,
    );
    const durable = await accepted('durable');
    expect((await methods.getMediaThread(scope, durable.threadId))?.expiresAt).toBeUndefined();
    for (const include of [undefined, 'activity'] as const) {
      const listed = await methods.listMediaThreads({ scope, limit: 10, include });
      expect(listed.items.map((item) => item.threadId)).toEqual([durable.threadId]);
    }
    expect(
      await methods.retireExpiredMediaThreads({ scope, now: thread.createdAt, limit: 10 }),
    ).toBe(0);
    expect(
      (
        await runAsSystem(() =>
          methods.listMediaCleanupScopes({ limit: 10, now: thread.createdAt }),
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await runAsSystem(() =>
          methods.listMediaCleanupScopes({ limit: 10, now: thread.expiresAt! }),
        )
      ).items,
    ).toEqual([scope]);
    expect(
      await methods.retireExpiredMediaThreads({ scope, now: thread.expiresAt!, limit: 10 }),
    ).toBe(1);
    expect(await methods.getMediaThread(scope, receipt.threadId)).toBeNull();
    expect(
      await mongoose.models.MediaThread.findOne({ threadId: receipt.threadId }).lean(),
    ).toMatchObject({ status: 'retiring', epoch: 2 });
    expect((await methods.getMediaJob(scope, receipt.jobId))?.phase).toBe('cancelled');
    expect((await methods.getMediaThread(scope, durable.threadId))?.retiredAt).toBeUndefined();
    expect(
      await methods.retireExpiredMediaThreads({ scope, now: thread.expiresAt!, limit: 10 }),
    ).toBe(0);
  });

  it('keeps a temporary request durable when no retention window is configured', async () => {
    const receipt = await methods.stageMediaSubmission(
      submission('temporary-unbounded', { temporary: true }),
    );
    await methods.publishMediaSubmission(scope, receipt.jobId, options);
    const thread = await methods.getMediaThread(scope, receipt.threadId);
    expect(thread).not.toHaveProperty('expiresAt');
    expect((await methods.listMediaThreads({ scope, limit: 10 })).items).toHaveLength(1);
  });

  it('carries a comparison marker onto the published turn view', async () => {
    const compared = await accepted('compare-a', { comparisonId: 'comparison-1' });
    const plain = await accepted('plain');
    const [turn] = (
      await methods.listMediaTurns({
        scope,
        threadId: compared.threadId,
        limit: 10,
        jobsPerTurn: 10,
      })
    ).items;
    expect(mediaTurnSchema.parse(turn).comparisonId).toBe('comparison-1');
    const [plainTurn] = (
      await methods.listMediaTurns({ scope, threadId: plain.threadId, limit: 10, jobsPerTurn: 10 })
    ).items;
    expect(plainTurn).not.toHaveProperty('comparisonId');
  });
});
