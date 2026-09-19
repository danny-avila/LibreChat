import sharp from 'sharp';
import multer from 'multer';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  FileSources,
  resolveMediaConfig,
  mediaCatalogSchema,
  mediaSubmissionReceiptSchema,
} from 'librechat-data-provider';
import {
  createModels,
  createMediaMethods,
  createMediaNativeMethods,
  createMediaPresetMethods,
  createMediaAccountingMethods,
  runAsSystem,
  tenantStorage,
} from '@librechat/data-schemas';
import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaPresetMethods,
} from '@librechat/data-schemas';
import type { MediaTransport } from './transport';
import { createMediaAccounting } from './accounting';
import { createMediaRuntime } from './runtime';
import { MediaProviderError } from './errors';

interface HeldSubmission {
  release(): void;
  aborted: boolean;
}

describe('media worker admission with standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let directory: string;
  let original: Buffer;
  let repository: MediaMethods & MediaNativeMethods & MediaPresetMethods;
  let config: AppConfig;
  let runtime: ReturnType<typeof createMediaRuntime>;
  let accounting: ReturnType<typeof createMediaAccounting>;
  let app: express.Express;
  let currentOwner: string;
  let logged: Error[] = [];
  let submissions: HeldSubmission[] = [];
  let holdSubmissions = true;
  let restartRuntime: () => void;
  let remote:
    | {
        status: string;
        submissions: number;
        deletes: number;
        afterDelete?: string;
        deleteError?: boolean;
      }
    | undefined;

  const transport: MediaTransport = {
    async json(input, schema) {
      if (remote) {
        const runway = config.media!.integrations[0].api === 'runway.videos';
        if (input.method === 'POST') {
          remote.submissions++;
          return schema.parse(runway ? { id: 'remote-job' } : { job_id: 'remote-job' });
        }
        if (input.method === 'DELETE') {
          remote.deletes++;
          if (remote.status === 'missing') {
            throw new MediaProviderError('rejected', 404);
          }
          remote.status = remote.afterDelete ?? remote.status;
          if (remote.deleteError) {
            remote.deleteError = false;
            throw new MediaProviderError('uncertain', 503, 'lost_cancellation_acknowledgement');
          }
          return schema.parse({});
        }
        if (remote.status === 'missing') throw new MediaProviderError('rejected', 404);
        return schema.parse(
          runway
            ? { id: 'remote-job', status: remote.status }
            : {
                job_id: 'remote-job',
                status: remote.status,
                ...(remote.status === 'completed'
                  ? { result: { urls: ['https://cdn.example/image.png'] } }
                  : {}),
              },
        );
      }
      if (!input.url.endsWith('/images/generations')) {
        throw new MediaProviderError('rejected', 404, 'fixture_route');
      }
      const held: HeldSubmission = { release: () => undefined, aborted: false };
      submissions.push(held);
      if (holdSubmissions) {
        await new Promise<void>((resolve, reject) => {
          held.release = resolve;
          input.signal?.addEventListener(
            'abort',
            () => {
              held.aborted = true;
              reject(new Error('The fixture request was aborted.'));
            },
            { once: true },
          );
        });
      }
      return schema.parse({ data: [{ b64_json: original.toString('base64') }] });
    },
    async stream() {
      if (remote?.status === 'completed') return Readable.from([original]);
      throw new MediaProviderError('rejected', 404, 'fixture_route');
    },
  };

  const owner = () => new mongoose.Types.ObjectId().toString();
  const waitFor = async (condition: () => boolean) => {
    for (let attempt = 0; attempt < 400 && !condition(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    createModels(mongoose);
    const mediaMethods = createMediaMethods(mongoose);
    repository = {
      ...mediaMethods,
      ...createMediaNativeMethods(mongoose, mediaMethods),
      ...createMediaPresetMethods(mongoose),
    };
    await repository.ensureMediaIndexes();
    await repository.ensureMediaPresetIndexes();
    directory = await mkdtemp(path.join(tmpdir(), 'librechat-media-worker-'));
    original = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#abc' } })
      .png()
      .toBuffer();
  }, 60000);

  afterAll(async () => {
    await runtime?.worker.stop();
    await mongoose.disconnect();
    await mongo.stop();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    logged = [];
    submissions = [];
    holdSubmissions = true;
    remote = undefined;
    currentOwner = owner();
    config = {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      transactions: { enabled: false },
      paths: {
        uploads: path.join(directory, 'uploads'),
        imageOutput: path.join(directory, 'images'),
        publicPath: directory,
      },
      media: resolveMediaConfig({
        enabled: true,
        integrations: [
          {
            id: 'images',
            api: 'openai.images',
            endpointRef: { kind: 'custom', name: 'Fixture' },
            catalog: { kind: 'configured', models: ['gpt-image-1'] },
            operations: ['image.generate'],
          },
        ],
      }),
      endpoints: {
        custom: [{ name: 'Fixture', apiKey: 'fixture-secret', baseURL: 'http://provider.test/v1' }],
      },
    };
    accounting = createMediaAccounting({
      repository: createMediaAccountingMethods(mongoose),
      now: Date.now,
    });
    restartRuntime = () => {
      runtime = createMediaRuntime({
        appConfig: config,
        repository,
        getUserById: async () => ({ role: 'USER' }),
        getRoleByName: async () => ({ permissions: { MEDIA: { USE: true, CREATE: true } } }),
        getAppConfig: async () => config,
        tenantContext: tenantStorage,
        asSystem: runAsSystem,
        environment: {},
        decrypt: async (value) => value,
        transport,
        upload: multer,
        accounting,
        log: (error) => {
          logged.push(error);
        },
      });
      app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: currentOwner, role: 'USER' } as Express.User;
        next();
      });
      app.use('/api/media', runtime.router);
    };
    restartRuntime();
  });

  afterEach(() => {
    if (logged.length > 0) {
      throw new Error(
        `The media worker logged unexpected errors: ${logged.map((error) => error.message).join('; ')}`,
      );
    }
  });

  async function submitAs(ownerId: string, clientRequestId: string) {
    currentOwner = ownerId;
    const modelCatalog = config.media!.integrations[0].catalog;
    if (modelCatalog.kind !== 'configured') throw new Error('Expected configured fixture model');
    const catalog = mediaCatalogSchema.parse(
      (await request(app).get('/api/media/catalog').expect(200)).body,
    );
    const response = await request(app)
      .post('/api/media/submissions')
      .send({
        clientRequestId,
        prompt: `A study for ${clientRequestId}`,
        operation: config.media!.integrations[0].operations[0],
        selection: {
          connectionId: 'images',
          modelId: modelCatalog.models[0],
          catalogVersion: catalog.version,
        },
      })
      .expect(202);
    return mediaSubmissionReceiptSchema.parse(response.body);
  }

  async function run(ownerId: string, jobId: string) {
    const scope = { ownerId, tenantId: null };
    const job = await repository.claimMediaJob({
      scope,
      workerId: 'test-worker',
      now: new Date(Date.now() + 60_000).toISOString(),
      leaseMs: 120_000,
    });
    expect(job?.jobId).toBe(jobId);
    if (!job) {
      throw new Error('Expected claimable job');
    }
    await runtime.worker.runJob(job);
    return repository.getMediaJob(scope, jobId);
  }

  async function remoteJob(api: 'runway.videos' | 'krea.images', clientRequestId: string) {
    config.balance = { enabled: true };
    config.media!.integrations[0] = {
      ...config.media!.integrations[0],
      api,
      catalog: {
        kind: 'configured',
        models: [api === 'runway.videos' ? 'runway/gen-4.5' : 'krea/krea-2-large'],
      },
      operations: [api === 'runway.videos' ? 'video.generate' : 'image.generate'],
      billing: { estimatedCostUSD: 0.01, maxCostUSD: 0.02, creditsPerUSD: 1000 },
    };
    remote = {
      status: api === 'runway.videos' ? 'RUNNING' : 'processing',
      submissions: 0,
      deletes: 0,
    };
    await accounting.ensureReady();
    await mongoose.models.Balance.create({ user: currentOwner, tokenCredits: 1000 });
    const receipt = await submitAs(currentOwner, clientRequestId);
    expect(await run(currentOwner, receipt.jobId)).toMatchObject({
      phase: 'running',
      execution: { cancellation: 'best-effort' },
    });
    return receipt;
  }

  async function balance() {
    return mongoose.models.Balance.findOne({ user: currentOwner })
      .select('+reservedCredits')
      .lean();
  }

  it('persists Krea cancellation across restarts and retains the hold until terminal confirmation', async () => {
    const receipt = await remoteJob('krea.images', 'cancel-krea');
    config.media!.cancellation.enabled = false;
    const response = await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    expect(response.body).toMatchObject({
      phase: 'running',
      cancellation: 'requested',
      allowedActions: { cancel: false, retry: false },
    });
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 20 });
    expect(await run(currentOwner, receipt.jobId)).toMatchObject({
      phase: 'running',
      provider: { cancellationAcknowledged: true },
    });
    expect(remote!.deletes).toBe(1);
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 20 });
    restartRuntime();
    await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    await run(currentOwner, receipt.jobId);
    expect(remote!.deletes).toBe(1);
    remote!.status = 'cancelled';
    expect(await run(currentOwner, receipt.jobId)).toMatchObject({
      phase: 'cancelled',
      provider: { recovery: { terminalStatus: 'cancelled', usage: { costUSD: 0 } } },
    });
    expect(
      (await request(app).get(`/api/media/jobs/${receipt.jobId}`).expect(200)).body,
    ).toMatchObject({
      cancellation: 'confirmed',
    });
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 0 });
    expect(await mongoose.models.MediaPermit.countDocuments({ jobId: receipt.jobId })).toBe(0);
    expect(remote!.submissions).toBe(1);
    expect(remote!.deletes).toBe(1);
  });

  it('preserves completed output and billing when provider completion wins cancellation', async () => {
    const receipt = await remoteJob('krea.images', 'completion-wins');
    await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    remote!.status = 'completed';
    const job = await run(currentOwner, receipt.jobId);
    expect(job).toMatchObject({ phase: 'succeeded', outputs: [{ kind: 'image', state: 'ready' }] });
    expect(
      (await request(app).get(`/api/media/jobs/${receipt.jobId}`).expect(200)).body.cancellation,
    ).toBeUndefined();
    expect(await balance()).toMatchObject({ tokenCredits: 990, reservedCredits: 0 });
    expect(remote!.deletes).toBe(0);
    expect(remote!.submissions).toBe(1);
  });

  it('defers Krea mutation until the provider enters a cancellable lifecycle state', async () => {
    const receipt = await remoteJob('krea.images', 'deferred-krea');
    await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    remote!.status = 'backlogged';
    const deferred = await run(currentOwner, receipt.jobId);
    expect(deferred?.provider.cancellationAttemptedAt).toBeUndefined();
    expect(remote!.deletes).toBe(0);
    remote!.status = 'processing';
    expect((await run(currentOwner, receipt.jobId))?.provider.cancellationAcknowledged).toBe(true);
    expect(remote!.deletes).toBe(1);
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 20 });
  });

  it('polls Krea after an uncertain cancellation without repeating an unverified mutation', async () => {
    const receipt = await remoteJob('krea.images', 'uncertain-krea');
    await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    remote!.deleteError = true;
    const attempted = await run(currentOwner, receipt.jobId);
    expect(attempted?.provider.cancellationAttemptedAt).toBeDefined();
    expect(attempted?.provider.cancellationAcknowledged).toBeUndefined();
    expect(logged.splice(0)).toHaveLength(1);
    restartRuntime();
    await run(currentOwner, receipt.jobId);
    expect(remote!.deletes).toBe(1);
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 20 });
    remote!.status = 'cancelled';
    expect((await run(currentOwner, receipt.jobId))?.phase).toBe('cancelled');
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 0 });
    expect(remote!.submissions).toBe(1);
  });

  it('retries Runway cancellation idempotently after a lost acknowledgement and retains unknown liability', async () => {
    const receipt = await remoteJob('runway.videos', 'uncertain-runway');
    await request(app).post(`/api/media/jobs/${receipt.jobId}/cancel`).expect(200);
    remote!.deleteError = true;
    remote!.afterDelete = 'missing';
    await run(currentOwner, receipt.jobId);
    expect(logged.splice(0)).toHaveLength(1);
    restartRuntime();
    expect(await run(currentOwner, receipt.jobId)).toMatchObject({
      phase: 'requires_attention',
      provider: { certainty: 'terminal', recovery: { terminalStatus: 'cancelled' } },
      error: { code: 'not_ready' },
    });
    expect(
      (await request(app).get(`/api/media/jobs/${receipt.jobId}`).expect(200)).body,
    ).toMatchObject({
      cancellation: 'confirmed',
      allowedActions: { cancel: false, retry: false },
    });
    expect(await balance()).toMatchObject({ tokenCredits: 1000, reservedCredits: 20 });
    expect(remote!.deletes).toBe(2);
    expect(remote!.submissions).toBe(1);
  });

  it('lets a second owner dispatch while the first owner saturates its own concurrency', async () => {
    config.media!.execution = {
      maxActivePerUser: 1,
      maxActivePerIntegration: 2,
      maxActiveTotal: 2,
    };
    const ownerA = owner();
    const ownerB = owner();
    const [a1, a2, a3] = [
      await submitAs(ownerA, 'a-1'),
      await submitAs(ownerA, 'a-2'),
      await submitAs(ownerA, 'a-3'),
    ];
    const b1 = await submitAs(ownerB, 'b-1');

    const first = run(ownerA, a1.jobId);
    await waitFor(() => submissions.length === 1);
    for (const waiting of [a2, a3]) {
      expect(await run(ownerA, waiting.jobId)).toMatchObject({
        phase: 'queued',
        provider: { certainty: 'unsubmitted' },
      });
    }
    const second = run(ownerB, b1.jobId);
    await waitFor(() => submissions.length === 2);

    const executionPermits = async () =>
      mongoose.models.MediaPermit.find({ kind: { $ne: 'queue' } }).lean<
        Array<{ kind: string; jobId: string }>
      >();
    const permits = await executionPermits();
    expect(
      permits
        .filter((permit) => permit.kind === 'deployment')
        .map((permit) => permit.jobId)
        .sort(),
    ).toEqual([a1.jobId, b1.jobId].sort());
    expect(permits.some((permit) => [a2.jobId, a3.jobId].includes(permit.jobId))).toBe(false);

    for (const held of submissions) {
      held.release();
    }
    expect((await first)?.phase).toBe('succeeded');
    expect((await second)?.phase).toBe('succeeded');
    expect(await executionPermits()).toEqual([]);
  });

  it('fails work that outlived the queue with a code that names expiry', async () => {
    config.media!.queue.maxQueueAgeMs = 1;
    const receipt = await submitAs(currentOwner, 'expired');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await run(currentOwner, receipt.jobId)).toMatchObject({
      phase: 'failed',
      error: { code: 'queue_expired' },
      provider: { certainty: 'unsubmitted' },
    });
    expect(submissions).toHaveLength(0);
  });

  it('reconciles a reserved balance without submitting when queued cancellation wins dispatch', async () => {
    config.balance = { enabled: true };
    config.media!.integrations[0].billing = {
      estimatedCostUSD: 0.01,
      maxCostUSD: 0.02,
      creditsPerUSD: 1000,
    };
    await accounting.ensureReady();
    await mongoose.models.Balance.create({ user: currentOwner, tokenCredits: 1000 });
    const receipt = await submitAs(currentOwner, 'cancel-reserved');
    const reserve = accounting.reserve;
    const reservation = jest.spyOn(accounting, 'reserve').mockImplementation(async (...args) => {
      await reserve(...args);
      const cancelled = await request(app)
        .post(`/api/media/jobs/${receipt.jobId}/cancel`)
        .expect(200);
      expect(cancelled.body).toMatchObject({ phase: 'cancelled' });
    });
    try {
      expect(await run(currentOwner, receipt.jobId)).toMatchObject({
        phase: 'cancelled',
        provider: { certainty: 'unsubmitted' },
      });
    } finally {
      reservation.mockRestore();
    }
    expect(submissions).toHaveLength(0);
    const scope = { ownerId: currentOwner, tenantId: null };
    await accounting.reconcile(scope, config.media!);
    expect(
      await mongoose.models.Balance.findOne({ user: currentOwner })
        .select('+reservedCredits')
        .lean(),
    ).toMatchObject({ tokenCredits: 1000, reservedCredits: 0 });
    expect(await mongoose.models.MediaPermit.countDocuments({ jobId: receipt.jobId })).toBe(0);
  });

  it('rejects cancellation after dispatch without recording unsupported provider intent', async () => {
    const receipt = await submitAs(currentOwner, 'cancel-dispatched');
    const pending = run(currentOwner, receipt.jobId);
    await waitFor(() => submissions.length === 1);
    try {
      const response = await request(app)
        .post(`/api/media/jobs/${receipt.jobId}/cancel`)
        .expect(409);
      expect(response.body).toMatchObject({ error: { code: 'cancel_unsupported' } });
      const job = await repository.getMediaJob(
        { ownerId: currentOwner, tenantId: null },
        receipt.jobId,
      );
      expect(job).toMatchObject({ phase: 'submitting', provider: { certainty: 'unknown' } });
      expect(job?.cancelRequestedAt).toBeUndefined();
      expect(submissions[0].aborted).toBe(false);
    } finally {
      submissions[0].release();
    }
    expect((await pending)?.phase).toBe('succeeded');
  });

  it('aborts the in-flight provider request when the worker stops and keeps its capacity reserved', async () => {
    const receipt = await submitAs(currentOwner, 'stopped');
    const pending = run(currentOwner, receipt.jobId);
    await waitFor(() => submissions.length === 1);
    await runtime.worker.stop();
    const job = await pending;
    expect(submissions[0].aborted).toBe(true);
    expect(job).toMatchObject({ phase: 'submitting', provider: { certainty: 'unknown' } });
    const retained = await mongoose.models.MediaPermit.find({ jobId: receipt.jobId }).lean<
      Array<{ kind: string }>
    >();
    expect(retained.map((permit) => permit.kind).sort()).toEqual([
      'deployment',
      'integration',
      'owner',
      'queue',
    ]);
  });
});
