import axios from 'axios';
import sharp from 'sharp';
import multer from 'multer';
import path from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import {
  EModelEndpoint,
  FileSources,
  resolveMediaConfig,
  mediaCatalogSchema,
  mediaSubmissionReceiptSchema,
} from 'librechat-data-provider';
import {
  createMediaMethods,
  createMediaNativeMethods,
  createMediaAccountingMethods,
  runAsSystem,
  tenantStorage,
} from '@librechat/data-schemas';
import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { Server } from 'node:http';
import { createMediaAccounting } from './accounting';
import { createLocalMediaStorage } from './storage';
import { createMediaTransport } from './transport';
import { createMediaRuntime } from './runtime';

describe('Media Studio HTTP and worker with standalone MongoDB', () => {
  let mongo: MongoMemoryServer;
  let provider: Server;
  let directory: string;
  let root: string;
  let original: Buffer;
  let posts = 0;
  let polls = 0;
  let behavior: 'image' | 'uncertain' | 'rejected' | 'video' = 'image';
  let repository: MediaMethods & MediaNativeMethods;
  let scope: MediaOwnerScope;
  let config: AppConfig;
  let runtime: ReturnType<typeof createMediaRuntime>;
  let app: express.Express;
  let userRole = 'USER';

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    const mediaMethods = createMediaMethods(mongoose);
    repository = { ...mediaMethods, ...createMediaNativeMethods(mongoose, mediaMethods) };
    await repository.ensureMediaIndexes();
    directory = await mkdtemp(path.join(tmpdir(), 'librechat-media-'));
    original = await sharp({ create: { width: 24, height: 16, channels: 4, background: '#cde' } })
      .png()
      .toBuffer();
    const api = express();
    api.use(express.json({ limit: '1mb' }));
    api.post('/v1/images/generations', (_req, res) => {
      posts++;
      if (behavior === 'uncertain') {
        res.status(503).json({ error: 'lost receipt' });
        return;
      }
      if (behavior === 'rejected') {
        res.status(400).json({ error: 'invalid request' });
        return;
      }
      res.json({ data: [{ b64_json: original.toString('base64') }] });
    });
    api.post('/v1/videos', (_req, res) => {
      posts++;
      res.json({ id: 'operation-1', status: 'queued' });
    });
    api.get('/v1/videos/operation-1', (_req, res) => {
      polls++;
      res.json({ id: 'operation-1', status: 'completed' });
    });
    api.get('/v1/videos/operation-1/content', (_req, res) => {
      const header = Buffer.alloc(32);
      header.write('ftyp', 4);
      header.write('mp42', 8);
      res.type('video/mp4').send(header);
    });
    provider = await new Promise<Server>((resolve) => {
      const server = api.listen(0, '127.0.0.1', () => resolve(server));
    });
    const address = provider.address();
    if (!address || typeof address === 'string') {
      throw new Error('Provider listener unavailable');
    }
    root = `http://127.0.0.1:${address.port}/v1`;
  }, 60000);

  afterAll(async () => {
    await runtime?.worker.stop();
    await new Promise<void>((resolve, reject) =>
      provider.close((error) => (error ? reject(error) : resolve())),
    );
    await mongoose.disconnect();
    await mongo.stop();
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.collection.deleteMany({})),
    );
    posts = 0;
    polls = 0;
    behavior = 'image';
    userRole = 'USER';
    scope = { ownerId: new mongoose.Types.ObjectId().toString(), tenantId: null };
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
            operations: ['image.generate', 'image.edit'],
          },
          {
            id: 'videos',
            api: 'openai.videos',
            endpointRef: { kind: 'custom', name: 'Fixture' },
            catalog: { kind: 'configured', models: ['sora-2'] },
            operations: ['video.generate'],
          },
        ],
      }),
      endpoints: { custom: [{ name: 'Fixture', apiKey: 'fixture-secret', baseURL: root }] },
    };
    runtime = createMediaRuntime({
      appConfig: config,
      repository,
      getUserById: async () => ({ role: 'USER' }),
      getRoleByName: async (role) => ({
        permissions: { MEDIA: { USE: true, CREATE: role !== 'READ_ONLY' } },
      }),
      getAppConfig: async () => config,
      tenantContext: tenantStorage,
      asSystem: runAsSystem,
      environment: { GOOGLE_KEY: 'fixture-google', GOOGLE_REVERSE_PROXY: root },
      decrypt: async (value) => value,
      transport: createMediaTransport({
        http: axios.create({ proxy: false }),
        allowedAddresses: [new URL(root).host],
      }),
      upload: multer,
      accounting: createMediaAccounting({
        repository: createMediaAccountingMethods(mongoose),
        now: Date.now,
      }),
      log: (error) => {
        throw error;
      },
    });
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: scope.ownerId, role: userRole } as Express.User;
      next();
    });
    app.use('/api/media', runtime.router);
  });

  async function submit(clientRequestId: string, extra = {}) {
    const catalog = mediaCatalogSchema.parse(
      (await request(app).get('/api/media/catalog').expect(200)).body,
    );
    return request(app)
      .post('/api/media/submissions')
      .send({
        clientRequestId,
        prompt: 'A small observatory',
        operation: 'image.generate',
        selection: {
          connectionId: 'images',
          modelId: 'gpt-image-1',
          catalogVersion: catalog.version,
        },
        ...extra,
      });
  }
  async function run(jobId: string) {
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

  it('queues idempotently, stores original bytes, and iterates in the same tile', async () => {
    const first = await submit('stable-request');
    expect(first.status).toBe(202);
    const receipt = mediaSubmissionReceiptSchema.parse(first.body);
    expect(receipt.phase).toBe('accepted');
    expect(posts).toBe(0);
    const replay = await submit('stable-request');
    expect(replay.body.jobId).toBe(receipt.jobId);
    const completed = await run(receipt.jobId);
    expect(completed?.phase).toBe('succeeded');
    expect(posts).toBe(1);
    const output = completed?.outputs[0];
    if (!output || output.kind === 'text' || !output.asset) {
      throw new Error('Expected image');
    }
    expect(await readFile(path.join(directory, output.asset.filepath))).toEqual(original);
    expect(output.asset).toMatchObject({ width: 24, height: 16, bytes: original.length });
    const next = await submit('iteration', {
      threadId: receipt.threadId,
      parentTurnId: receipt.turnId,
      operation: 'image.edit',
      inputs: [{ role: 'reference', file_id: output.asset.file_id }],
    });
    expect(next.status).toBe(202);
    expect(next.body.threadId).toBe(receipt.threadId);
    const threads = await request(app).get('/api/media/threads').expect(200);
    expect(threads.body.items).toHaveLength(1);
    expect(
      await repository.claimMediaAssetDeletion({
        scope,
        fileId: output.asset.file_id,
        token: 'delete',
      }),
    ).toBeNull();
  });

  it('keeps uncertain provider acceptance out of automatic and user retry', async () => {
    behavior = 'uncertain';
    const response = await submit('uncertain');
    expect(response.status).toBe(202);
    const job = await run(response.body.jobId);
    expect(job?.phase).toBe('requires_attention');
    expect(posts).toBe(1);
    await request(app)
      .post(`/api/media/jobs/${response.body.jobId}/retry`)
      .send({ clientRequestId: 'unsafe-retry' })
      .expect(409);
    expect(posts).toBe(1);
  });

  it('allows a new attempt after a definitive provider rejection and cancels queued work', async () => {
    behavior = 'rejected';
    const response = await submit('rejected');
    expect((await run(response.body.jobId))?.phase).toBe('failed');
    const retried = await request(app)
      .post(`/api/media/jobs/${response.body.jobId}/retry`)
      .send({ clientRequestId: 'safe-retry' })
      .expect(202);
    expect(retried.body.jobId).not.toBe(response.body.jobId);
    expect(retried.body.turnId).toBe(response.body.turnId);
    config.media!.integrations = [];
    const replay = await request(app)
      .post(`/api/media/jobs/${response.body.jobId}/retry`)
      .send({ clientRequestId: 'safe-retry' })
      .expect(202);
    expect(replay.body.jobId).toBe(retried.body.jobId);
    await request(app).post(`/api/media/jobs/${retried.body.jobId}/cancel`).expect(200);
    expect(posts).toBe(1);
  });

  it('polls an existing video after repository recreation and media config removal without resubmission', async () => {
    behavior = 'video';
    const catalog = mediaCatalogSchema.parse((await request(app).get('/api/media/catalog')).body);
    const response = await submit('video', {
      operation: 'video.generate',
      selection: { connectionId: 'videos', modelId: 'sora-2', catalogVersion: catalog.version },
      parameters: { durationSeconds: 4, resolution: '1280x720' },
    });
    expect(response.status).toBe(202);
    expect((await run(response.body.jobId))?.phase).toBe('running');
    config.media = resolveMediaConfig();
    const mediaMethods = createMediaMethods(mongoose);
    repository = { ...mediaMethods, ...createMediaNativeMethods(mongoose, mediaMethods) };
    expect((await run(response.body.jobId))?.phase).toBe('succeeded');
    expect(posts).toBe(1);
    expect(polls).toBe(1);
  });

  it('recovers a direct original committed before its acknowledgment without a second inference', async () => {
    const commit = repository.commitMediaAssetWrite.bind(repository);
    jest.spyOn(repository, 'commitMediaAssetWrite').mockImplementationOnce(async (input) => {
      await commit(input);
      throw new Error('Lost storage publication acknowledgment');
    });
    const response = await submit('lost-storage-ack');
    expect((await run(response.body.jobId))?.phase).toBe('ingesting');
    const recovered = await run(response.body.jobId);
    expect(recovered?.phase).toBe('succeeded');
    expect(recovered?.outputs[0]).toMatchObject({ kind: 'image', state: 'ready' });
    expect(posts).toBe(1);
  });

  it('records native Gemini parts before exposure and restores only the original account', async () => {
    config.media!.integrations.push({
      id: 'google-images',
      api: 'google.generateContent',
      endpointRef: { kind: 'builtin', endpoint: EModelEndpoint.google },
      catalog: { kind: 'configured', models: ['gemini-2.5-flash-image'] },
      operations: ['image.generate', 'image.edit'],
    });
    const factory = await runtime.nativeFactory(
      Object.assign(Object.create(express.request) as express.Request, {
        user: { id: scope.ownerId, role: 'USER' },
      }),
      {
        conversationId: 'chat-one',
        messageId: 'assistant-one',
        prompt: 'Draw an observatory',
        temporary: false,
      },
    );
    const port = await factory?.({
      provider: 'google',
      model: 'gemini-2.5-flash-image',
      apiKey: 'fixture-google',
      baseURL: root,
    });
    if (!port) {
      throw new Error('Native recording port is unavailable');
    }
    expect(await port.start({ modelRunId: 'native-run', model: 'gemini-2.5-flash-image' })).toEqual(
      { responseModalities: ['TEXT', 'IMAGE'] },
    );
    const text = await port.part({
      modelRunId: 'native-run',
      chunkIndex: 0,
      partIndex: 0,
      part: {
        kind: 'text',
        text: 'Here is the observatory.',
        thoughtSignature: 'private-text-signature',
      },
    });
    const image = await port.part({
      modelRunId: 'native-run',
      chunkIndex: 1,
      partIndex: 0,
      part: {
        kind: 'image',
        mimeType: 'image/png',
        data: original.toString('base64'),
        thoughtSignature: 'private-image-signature',
      },
    });
    expect(JSON.stringify([text, image])).not.toContain('private-');
    expect(JSON.stringify(image)).not.toContain(original.toString('base64'));
    if (image.type !== 'image_file') {
      throw new Error('Expected a durable image part');
    }
    await expect(
      port.restore({
        file_id: image.image_file.file_id,
        continuationRef: image.native_media?.continuationRef,
      }),
    ).resolves.toMatchObject({
      kind: 'image',
      data: original.toString('base64'),
      thoughtSignature: 'private-image-signature',
    });
    await port.complete({ modelRunId: 'native-run' });
    const threads = await repository.listMediaThreads({ scope, limit: 10 });
    const detail = await runtime.services.queries.thread(threads.items[0].threadId, {
      scope,
      appConfig: config,
      config: config.media!,
      canUse: true,
      canCreate: true,
    });
    expect(detail.turns.items[0].jobs[0]).toMatchObject({
      phase: 'succeeded',
      executionOwner: 'chat',
      outputs: [{ kind: 'text' }, { kind: 'image', state: 'ready' }],
    });
    expect(JSON.stringify(detail)).not.toContain('private-');
    expect(posts).toBe(0);
    expect(await mongoose.connection.collection('transactions').countDocuments()).toBe(0);
    await expect(
      repository.getMediaNativeContinuation({
        scope,
        continuationRef: image.native_media?.continuationRef,
        execution: {
          api: 'google.generateContent',
          modelId: 'gemini-2.5-flash-image',
          bindingRevision: 'another-account',
        },
      }),
    ).resolves.toBeNull();
  });

  it('removes late upload bytes when cleanup retired its reservation before the stream opened', async () => {
    const storage = createLocalMediaStorage({
      repository,
      imageDirectory: path.join(directory, 'images'),
      uploadDirectory: path.join(directory, 'uploads'),
    });
    const reserve = repository.reserveMediaAssetWrite.bind(repository);
    jest.spyOn(repository, 'reserveMediaAssetWrite').mockImplementationOnce(async (input) => {
      const receipt = await reserve(input);
      expect(
        await storage.discardWrite(
          scope,
          receipt.writeId,
          new Date(Date.now() + 60_000).toISOString(),
        ),
      ).toBe(true);
      return receipt;
    });
    await expect(
      storage.publish({
        scope,
        outputKey: 'paused-upload',
        stream: Readable.from(original),
        type: 'image/png',
        filename: 'original.png',
        config: config.media!,
      }),
    ).rejects.toThrow('Media asset write not found');
    expect(await readdir(path.join(directory, 'images', scope.ownerId))).toEqual([]);
  });

  it('denies mutations for a read-only role and isolates another owner', async () => {
    const response = await submit('private');
    userRole = 'READ_ONLY';
    expect((await submit('forbidden')).status).toBe(403);
    scope = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    await request(app).get(`/api/media/jobs/${response.body.jobId}`).expect(404);
    await request(app).get(`/api/media/threads/${response.body.threadId}`).expect(404);
  });
});
