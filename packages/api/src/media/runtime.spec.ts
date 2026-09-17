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
  createMediaMethods,
  createMediaNativeMethods,
  createMediaAccountingMethods,
  runAsSystem,
  tenantStorage,
} from '@librechat/data-schemas';
import {
  EModelEndpoint,
  FileSources,
  resolveMediaConfig,
  mediaCatalogSchema,
  mediaSubmissionRequestSchema,
  mediaSubmissionReceiptSchema,
  mediaURLUploadResponseSchema,
} from 'librechat-data-provider';
import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaOwnerScope,
} from '@librechat/data-schemas';
import type { Server } from 'node:http';
import { mp4ReferenceFixture } from './__fixtures__/reference-content';
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
  let providerHeaders: Array<{ authorization?: string; secret?: string }> = [];
  let routedBodies: string[] = [];
  let remoteReference: Buffer;
  let referenceReads = 0;
  let referenceHeaders: Array<{ authorization?: string; cookie?: string }> = [];
  let chunkedReference = false;
  let referenceStatus = 200;
  let holdReference: ((response: express.Response) => void) | undefined;
  const referenceURL = 'https://media-fixture.example/reference';
  let vertexToken = 'access-1';
  let vertexAuthorizations: Array<string | undefined> = [];
  const vertexApi = 'https://us-central1-aiplatform.googleapis.com/v1';
  const vertexModel = 'veo-3.1-fast-generate-001';
  const vertexOperation = `projects/test-project/locations/us-central1/publishers/google/models/${vertexModel}/operations/vertex-job-1`;
  let behavior: 'image' | 'uncertain' | 'rejected' | 'video' | 'unsafe-svg' | 'mislabeled' =
    'image';
  let accounting: ReturnType<typeof createMediaAccounting>;
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
    api.get('/v1/images/models', (_req, res) => {
      res.json({ data: [{ id: 'fixture/image', name: 'Fixture image' }] });
    });
    api.get('/v1/videos/models', (_req, res) => {
      res.json({ data: [{ id: 'bytedance/seedance-2.0', name: 'Hosted references' }] });
    });
    api.get('/v1/models', (_req, res) => {
      res.json({
        data: [
          {
            id: 'bytedance/seedance-2.0',
            architecture: { input_modalities: ['text', 'image', 'audio', 'video'] },
          },
        ],
      });
    });
    api.get('/v1/models/bytedance/seedance-2.0/endpoints', (_req, res) => {
      res.json({ data: { endpoints: [{ tag: 'seed' }] } });
    });
    api.get('/v1/reference', (req, res) => {
      referenceReads++;
      referenceHeaders.push({ authorization: req.get('authorization'), cookie: req.get('cookie') });
      if (referenceStatus !== 200) {
        res.status(referenceStatus).end();
        return;
      }
      // Type detection must rely on the bytes, even when the host declares an unrelated MIME type.
      res.type('text/plain');
      if (holdReference) {
        holdReference(res);
        return;
      }
      if (chunkedReference) {
        res.write(remoteReference);
        res.end();
      } else res.send(remoteReference);
    });
    api.get('/v1/images/models/fixture/image/endpoints', (_req, res) => {
      res.json({
        id: 'fixture/image',
        endpoints: ['provider-a', 'provider-b'].map((tag) => ({
          provider_tag: tag,
          provider_name: tag,
          supported_parameters: {
            n: { type: 'range', min: 1, max: 1 },
            input_references: { type: 'range', min: 0, max: 2 },
            quality: { type: 'enum', values: [tag === 'provider-a' ? 'draft' : 'high'] },
          },
          allowed_passthrough_parameters: ['strength'],
        })),
      });
    });
    api.post('/v1/images', (req, res) => {
      posts++;
      routedBodies.push(JSON.stringify(req.body));
      res.json({ data: [{ b64_json: original.toString('base64') }] });
    });
    api.post('/v1/images/generations', (req, res) => {
      posts++;
      providerHeaders.push({
        authorization: req.get('authorization'),
        secret: req.get('x-extra-credential'),
      });
      if (behavior === 'uncertain') {
        res.status(503).json({ error: 'lost receipt' });
        return;
      }
      if (behavior === 'rejected') {
        res.status(400).json({ error: 'invalid request' });
        return;
      }
      if (behavior === 'unsafe-svg' || behavior === 'mislabeled') {
        const data =
          behavior === 'unsafe-svg'
            ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
            : original;
        res.json({
          data: [
            {
              b64_json: data.toString('base64'),
              media_type: behavior === 'unsafe-svg' ? 'image/svg+xml' : 'image/jpeg',
            },
          ],
          usage: { input_tokens: 3, output_tokens: 7 },
        });
        return;
      }
      res.json({ data: [{ b64_json: original.toString('base64') }] });
    });
    api.post('/v1/videos', (req, res) => {
      posts++;
      routedBodies.push(JSON.stringify(req.body));
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
    api.post(
      '/v1/projects/test-project/locations/us-central1/publishers/google/models/:action',
      (req, res) => {
        vertexAuthorizations.push(req.headers.authorization);
        if (req.params.action === `${vertexModel}:predictLongRunning`) {
          posts++;
          res.json({ name: vertexOperation });
          return;
        }
        if (
          req.params.action !== `${vertexModel}:fetchPredictOperation` ||
          req.body.operationName !== vertexOperation
        ) {
          res.status(400).json({ error: 'Unexpected Vertex operation' });
          return;
        }
        polls++;
        const bytes = Buffer.alloc(32);
        bytes.write('ftyp', 4);
        bytes.write('mp42', 8);
        res.json({
          name: vertexOperation,
          done: true,
          response: {
            videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: bytes.toString('base64') }],
          },
        });
      },
    );
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
    providerHeaders = [];
    routedBodies = [];
    remoteReference = Buffer.alloc(46);
    remoteReference.write('RIFF');
    remoteReference.writeUInt32LE(38, 4);
    remoteReference.write('WAVEfmt ', 8);
    remoteReference.writeUInt32LE(16, 16);
    remoteReference.writeUInt16LE(1, 20);
    remoteReference.writeUInt16LE(1, 22);
    remoteReference.writeUInt32LE(8000, 24);
    remoteReference.writeUInt32LE(16000, 28);
    remoteReference.writeUInt16LE(2, 32);
    remoteReference.writeUInt16LE(16, 34);
    remoteReference.write('data', 36);
    remoteReference.writeUInt32LE(2, 40);
    referenceReads = 0;
    referenceHeaders = [];
    chunkedReference = false;
    referenceStatus = 200;
    holdReference = undefined;
    vertexToken = 'access-1';
    vertexAuthorizations = [];
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
          {
            id: 'vertex',
            api: 'google.vertex.videos',
            endpointRef: { kind: 'vertex', keyFile: 'fixture-auth.json' },
            catalog: { kind: 'configured', models: [vertexModel] },
            operations: ['video.generate'],
          },
        ],
      }),
      endpoints: { custom: [{ name: 'Fixture', apiKey: 'fixture-secret', baseURL: root }] },
    };
    const providerTransport = createMediaTransport({
      http: axios.create({ proxy: false }),
      allowedAddresses: [new URL(root).host],
    });
    accounting = createMediaAccounting({
      repository: createMediaAccountingMethods(mongoose),
      now: Date.now,
    });
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
      vertexCredentials: async () => ({
        projectId: 'test-project',
        accessToken: vertexToken,
        revision: 'original-service-account',
      }),
      decrypt: async (value) => value,
      transport: {
        json: (input, schema) =>
          providerTransport.json(
            {
              ...input,
              url: input.url.startsWith(`${vertexApi}/`)
                ? root + input.url.slice(vertexApi.length)
                : input.url,
            },
            schema,
          ),
        stream: (input) =>
          providerTransport.stream(
            new URL(input.url).origin === 'https://media-fixture.example'
              ? { ...input, url: root + new URL(input.url).pathname, publicOnly: false }
              : input,
          ),
      },
      upload: multer,
      accounting,
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

  async function hostedSubmission(clientRequestId: string, inputs: object[]) {
    if (!config.media!.integrations.some((entry) => entry.id === 'hosted')) {
      config.media!.integrations.push({
        id: 'hosted',
        api: 'openrouter.videos',
        endpointRef: { kind: 'custom', name: 'Fixture' },
        catalog: {
          kind: 'discovered',
          allowModels: ['bytedance/seedance-2.0'],
          excludeModels: [],
          allModels: false,
        },
        operations: ['video.generate'],
      });
    }
    const catalog = mediaCatalogSchema.parse(
      (await request(app).get('/api/media/catalog').expect(200)).body,
    );
    const offering = catalog.offerings.find((entry) => entry.connectionId === 'hosted');
    expect(offering?.capabilities[0].inputs.hostedRoles).toEqual(['video', 'audio']);
    return submit(clientRequestId, {
      operation: 'video.generate',
      inputs,
      selection: {
        connectionId: 'hosted',
        modelId: 'bytedance/seedance-2.0',
        catalogVersion: catalog.version,
      },
    });
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

  it('uploads a safe SVG original and prepares a raster reference for the selected image API', async () => {
    const source = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><rect width="24" height="16" fill="red"/></svg>',
    );
    const response = await request(app)
      .post('/api/media/uploads')
      .attach('file', source, { filename: 'original.svg', contentType: 'image/svg+xml' })
      .expect(201);
    const asset = response.body.file;
    const catalog = mediaCatalogSchema.parse((await request(app).get('/api/media/catalog')).body);
    const prepared = await runtime.services.prepare(
      mediaSubmissionRequestSchema.parse({
        clientRequestId: 'edit-svg',
        operation: 'image.edit',
        prompt: 'Make the rectangle blue',
        selection: {
          connectionId: 'images',
          modelId: 'gpt-image-1',
          catalogVersion: catalog.version,
        },
        inputs: [{ role: 'reference', file_id: asset.file_id }],
      }),
      { scope, appConfig: config, config: config.media!, canUse: true, canCreate: true },
      true,
    );
    expect(prepared.inputs[0]).toMatchObject({ type: 'image/png', role: 'reference' });
    expect(await sharp(prepared.inputs[0].data).metadata()).toMatchObject({
      width: 24,
      height: 16,
    });
    expect(await readFile(path.join(directory, asset.filepath))).toEqual(source);
    expect(await readdir(path.join(directory, 'uploads', 'media-staging'))).toEqual([]);
    expect(posts).toBe(0);
  });

  it('uploads video and audio using their own limits and rejects assigning audio to an image role', async () => {
    config.media!.transfers.maxImageBytes = 32;
    config.media!.transfers.maxAudioBytes = 64;
    config.media!.transfers.maxVideoBytes = 128;
    const wave = Buffer.alloc(46);
    wave.write('RIFF');
    wave.writeUInt32LE(38, 4);
    wave.write('WAVEfmt ', 8);
    wave.writeUInt32LE(16, 16);
    wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22);
    wave.writeUInt32LE(8000, 24);
    wave.writeUInt32LE(16000, 28);
    wave.writeUInt16LE(2, 32);
    wave.writeUInt16LE(16, 34);
    wave.write('data', 36);
    wave.writeUInt32LE(2, 40);
    const audio = await request(app)
      .post('/api/media/uploads')
      .attach('file', wave, { filename: 'reference.wav', contentType: 'audio/x-wav' })
      .expect(201);
    expect(audio.body.file).toMatchObject({ type: 'audio/wav', bytes: 46 });
    const video = Buffer.alloc(80);
    video.write('ftyp', 4);
    video.write('mp42', 8);
    await request(app)
      .post('/api/media/uploads')
      .attach('file', video, { filename: 'reference.mp4', contentType: 'video/mp4' })
      .expect(201);
    await request(app)
      .post('/api/media/uploads')
      .attach('file', Buffer.concat([wave, wave]), {
        filename: 'too-large.wav',
        contentType: 'audio/wav',
      })
      .expect(413);
    config.media!.transfers.maxImageBytes = 64;
    const response = await submit('wrong-input-role', {
      operation: 'image.edit',
      inputs: [{ role: 'reference', file_id: audio.body.file.file_id }],
    });
    expect(response.status).toBe(422);
    expect(posts).toBe(0);
    expect(await readdir(path.join(directory, 'uploads', 'media-staging'))).toEqual([]);
  });

  it.each(['audio', 'video'] as const)(
    'imports an HTTPS %s reference and preserves its verified URL through the queue',
    async (role) => {
      if (role === 'video') remoteReference = mp4ReferenceFixture();
      const archived = Buffer.from(remoteReference);
      const response = await request(app)
        .post('/api/media/uploads/url')
        .set('Authorization', 'Bearer browser-credential')
        .set('Cookie', 'session=browser-cookie')
        .send({ url: referenceURL, role })
        .expect(201);
      const imported = mediaURLUploadResponseSchema.parse(response.body);
      expect(imported.file.type).toBe(role === 'video' ? 'video/mp4' : 'audio/wav');
      expect(imported.sourceURL).toBe(referenceURL);
      expect(await readFile(path.join(directory, imported.file.filepath))).toEqual(archived);
      const submission = await hostedSubmission(`hosted-${role}`, [
        {
          role,
          file_id: imported.file.file_id,
          sourceURL: imported.sourceURL,
        },
      ]);
      expect(submission.status).toBe(202);
      const queued = await repository.getMediaJob(scope, submission.body.jobId);
      expect(queued?.request.inputs[0].sourceURL).toBe(referenceURL);
      expect((await run(submission.body.jobId))?.phase).toBe('running');
      expect(referenceReads).toBe(3);
      expect(referenceHeaders).toEqual(
        Array.from({ length: 3 }, () => ({ authorization: undefined, cookie: undefined })),
      );
      expect(JSON.parse(routedBodies[0]).input_references).toEqual([
        role === 'video'
          ? { type: 'video_url', video_url: { url: referenceURL } }
          : { type: 'audio_url', audio_url: { url: referenceURL } },
      ]);
      expect((await run(submission.body.jobId))?.phase).toBe('succeeded');
      expect(posts).toBe(1);
    },
  );

  it('rejects changed hosted bytes before admission and again immediately before paid dispatch', async () => {
    const imported = mediaURLUploadResponseSchema.parse(
      (
        await request(app)
          .post('/api/media/uploads/url')
          .send({ url: referenceURL, role: 'audio' })
          .expect(201)
      ).body,
    );
    const input = { role: 'audio', file_id: imported.file.file_id, sourceURL: referenceURL };
    const archived = Buffer.from(remoteReference);
    remoteReference[45] = 1;
    const rejected = await hostedSubmission('changed-before-queue', [input]);
    expect(rejected.status).toBe(422);
    expect(rejected.body).toEqual({ error: { code: 'reference_changed' } });
    expect(posts).toBe(0);
    remoteReference = Buffer.from(archived);
    const queued = await hostedSubmission('changed-before-dispatch', [input]);
    expect(queued.status).toBe(202);
    remoteReference[45] = 2;
    const settled = await run(queued.body.jobId);
    expect(settled).toMatchObject({
      phase: 'failed',
      error: { code: 'reference_changed' },
      provider: { certainty: 'unsubmitted' },
    });
    expect(posts).toBe(0);
    expect(await readFile(path.join(directory, imported.file.filepath))).toEqual(archived);
  });

  it.each([401, 403, 404, 410])(
    'reports an unavailable hosted reference for HTTP %s without publishing a file',
    async (status) => {
      referenceStatus = status;
      const publication = jest.spyOn(repository, 'reserveMediaAssetWrite');
      const response = await request(app)
        .post('/api/media/uploads/url')
        .send({ url: referenceURL, role: 'audio' })
        .expect(422);
      expect(response.body).toEqual({ error: { code: 'reference_unavailable' } });
      expect(publication).not.toHaveBeenCalled();
      expect(posts).toBe(0);
    },
  );

  it.each(['deployment', 'integration', 'owner'] as const)(
    'does not download queued hosted references while %s execution capacity is saturated',
    async (kind) => {
      config.media!.execution.maxActiveTotal = 1;
      config.media!.execution.maxActivePerIntegration = 1;
      config.media!.execution.maxActivePerUser = 1;
      const imported = mediaURLUploadResponseSchema.parse(
        (
          await request(app)
            .post('/api/media/uploads/url')
            .send({ url: referenceURL, role: 'audio' })
            .expect(201)
        ).body,
      );
      const inputs = [{ role: 'audio', file_id: imported.file.file_id, sourceURL: referenceURL }];
      const first = await hostedSubmission(`occupy-${kind}`, inputs);
      expect(first.status).toBe(202);
      const claimed = await repository.claimMediaJob({
        scope,
        workerId: 'other-worker',
        now: new Date().toISOString(),
        leaseMs: 300_000,
      });
      expect(claimed?.jobId).toBe(first.body.jobId);
      expect(
        await repository.acquireMediaPermit({
          scope,
          jobId: first.body.jobId,
          kind,
          key: kind === 'integration' ? 'hosted' : undefined,
          capacity: 1,
        }),
      ).toBe(true);
      const waiting = await hostedSubmission(`waiting-${kind}`, inputs);
      expect(waiting.status).toBe(202);
      const readsBeforeDispatch = referenceReads;
      const reservation = jest.spyOn(accounting, 'reserve');
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(await run(waiting.body.jobId)).toMatchObject({
          phase: 'queued',
          provider: { certainty: 'unsubmitted' },
        });
      }
      expect(referenceReads).toBe(readsBeforeDispatch);
      expect(reservation).not.toHaveBeenCalled();
      expect(posts).toBe(0);
    },
  );

  it('aborts hosted reference revalidation when the worker stops before dispatch', async () => {
    const imported = mediaURLUploadResponseSchema.parse(
      (
        await request(app)
          .post('/api/media/uploads/url')
          .send({ url: referenceURL, role: 'audio' })
          .expect(201)
      ).body,
    );
    const queued = await hostedSubmission('stop-during-reference-download', [
      { role: 'audio', file_id: imported.file.file_id, sourceURL: referenceURL },
    ]);
    expect(queued.status).toBe(202);
    let heldResponse: express.Response | undefined;
    let releaseDownload: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    const received = new Promise<void>((resolve) => {
      holdReference = (response) => {
        heldResponse = response;
        response.once('close', () => releaseDownload?.());
        response.write(remoteReference.subarray(0, 8));
        resolve();
      };
    });
    const reservation = jest.spyOn(accounting, 'reserve');
    try {
      const pending = run(queued.body.jobId);
      await received;
      await runtime.worker.stop();
      const job = await pending;
      await closed;
      expect(job).toMatchObject({ phase: 'queued', provider: { certainty: 'unsubmitted' } });
      expect(reservation).not.toHaveBeenCalled();
      expect(posts).toBe(0);
    } finally {
      holdReference = undefined;
      heldResponse?.destroy();
    }
  });

  it('requires a hosted source and checks file ownership before downloading a submitted URL', async () => {
    const imported = mediaURLUploadResponseSchema.parse(
      (
        await request(app)
          .post('/api/media/uploads/url')
          .send({ url: referenceURL, role: 'audio' })
          .expect(201)
      ).body,
    );
    expect(
      (
        await hostedSubmission('missing-hosted-url', [
          { role: 'audio', file_id: imported.file.file_id },
        ])
      ).status,
    ).toBe(422);
    expect(referenceReads).toBe(1);
    scope = { ...scope, ownerId: new mongoose.Types.ObjectId().toString() };
    expect(
      (
        await hostedSubmission('another-owner-url', [
          {
            role: 'audio',
            file_id: imported.file.file_id,
            sourceURL: referenceURL,
          },
        ])
      ).status,
    ).toBe(404);
    expect(referenceReads).toBe(1);
    expect(posts).toBe(0);
  });

  it.each([
    'https://127.0.0.1/reference',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/reference',
    'https://localhost/reference',
    'http://media-fixture.example/reference',
    'https://user:secret@media-fixture.example/reference',
    'https://media-fixture.example/reference#fragment',
    'file:///local-reference.mp4',
    'not-a-url',
  ])('rejects an unsafe URL without accessing the reference or provider: %s', async (url) => {
    const response = await request(app)
      .post('/api/media/uploads/url')
      .send({ url, role: 'video' })
      .expect(422);
    expect(response.body).toEqual({ error: { code: 'reference_unavailable' } });
    expect(referenceReads).toBe(0);
    expect(posts).toBe(0);
  });

  it('enforces reference byte limits, role detection, permissions and upload policy before publication', async () => {
    const publication = jest.spyOn(repository, 'reserveMediaAssetWrite');
    try {
      userRole = 'READ_ONLY';
      await request(app)
        .post('/api/media/uploads/url')
        .send({ url: referenceURL, role: 'audio' })
        .expect(403);
      expect(referenceReads).toBe(0);
      userRole = 'USER';
      config.media!.transfers.maxAudioBytes = 32;
      chunkedReference = true;
      await request(app)
        .post('/api/media/uploads/url')
        .send({ url: referenceURL, role: 'audio' })
        .expect(413);
      config.media!.transfers.maxAudioBytes = 1024;
      await request(app)
        .post('/api/media/uploads/url')
        .send({ url: referenceURL, role: 'video' })
        .expect(422);
      config.filters = {
        files: {
          pii: {
            fields: ['content'],
            starterPatterns: [],
            customPatterns: [{ id: 'private', label: 'Private value', regex: 'PRIVATE-[A-Z]+' }],
            uninspectable: 'block',
          },
        },
      };
      await request(app)
        .post('/api/media/uploads/url')
        .send({ url: referenceURL, role: 'audio' })
        .expect(403);
      expect(publication).not.toHaveBeenCalled();
      expect(posts).toBe(0);
    } finally {
      publication.mockRestore();
    }
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

  it('uses direct provider credentials without copying literal keys or secret headers into persisted jobs', async () => {
    const integration = config.media!.integrations.find((entry) => entry.id === 'images');
    if (!integration) throw new Error('Missing images integration');
    integration.endpointRef = {
      kind: 'direct',
      baseURL: root,
      apiKey: 'literal-direct-key',
      headers: { 'X-Extra-Credential': 'literal-direct-header' },
    };
    const response = await submit('direct-credentials');
    expect(response.status).toBe(202);
    const queued = await repository.getMediaJob(scope, response.body.jobId);
    expect(queued?.execution).not.toHaveProperty('endpointRef');
    expect(JSON.stringify(queued)).not.toMatch(/literal-direct-key|literal-direct-header/);
    const completed = await run(response.body.jobId);
    expect(completed?.phase).toBe('succeeded');
    expect(JSON.stringify(completed)).not.toMatch(/literal-direct-key|literal-direct-header/);
    expect(providerHeaders).toEqual([
      { authorization: 'Bearer literal-direct-key', secret: 'literal-direct-header' },
    ]);
    expect(posts).toBe(1);
  });

  it('preserves the chosen image provider, validated options, and owned reference through the persisted queue', async () => {
    const integration = config.media!.integrations.find((entry) => entry.id === 'images');
    if (!integration) throw new Error('Missing images integration');
    integration.api = 'openrouter.images';
    integration.catalog = { kind: 'configured', models: ['fixture/image'] };
    const upload = await request(app)
      .post('/api/media/uploads')
      .attach('file', original, { filename: 'reference.png', contentType: 'image/png' })
      .expect(201);
    const catalog = mediaCatalogSchema.parse((await request(app).get('/api/media/catalog')).body);
    const submission = {
      operation: 'image.edit',
      selection: {
        connectionId: 'images',
        modelId: 'fixture/image',
        catalogVersion: catalog.version,
        providerTag: 'provider-b',
      },
      inputs: [{ role: 'reference', file_id: upload.body.file.file_id }],
      parameters: { count: 1, quality: 'high', providerOptions: { strength: 0.5 } },
    };
    const response = await submit('routed-image', submission);
    expect(response.status).toBe(202);
    const queued = await repository.getMediaJob(scope, response.body.jobId);
    expect(queued).toMatchObject({
      execution: { providerTag: 'provider-b' },
      request: {
        selection: { providerTag: 'provider-b' },
        parameters: { providerOptions: { strength: 0.5 } },
      },
    });
    expect((await submit('routed-image', submission)).body.jobId).toBe(response.body.jobId);
    expect(posts).toBe(0);
    expect((await run(response.body.jobId))?.phase).toBe('succeeded');
    expect(routedBodies).toHaveLength(1);
    expect(JSON.parse(routedBodies[0])).toMatchObject({
      quality: 'high',
      provider: {
        only: ['provider-b'],
        allow_fallbacks: false,
        options: { 'provider-b': { strength: 0.5 } },
      },
      input_references: [
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${original.toString('base64')}` },
        },
      ],
    });
    expect(posts).toBe(1);
  });

  it('requires the configured direct connection to recover an accepted video without replaying generation', async () => {
    const integration = config.media!.integrations.find((entry) => entry.id === 'videos');
    if (!integration) throw new Error('Missing video integration');
    integration.endpointRef = { kind: 'direct', baseURL: root, apiKey: 'literal-video-key' };
    const catalog = mediaCatalogSchema.parse((await request(app).get('/api/media/catalog')).body);
    const response = await submit('direct-video', {
      operation: 'video.generate',
      selection: { connectionId: 'videos', modelId: 'sora-2', catalogVersion: catalog.version },
      parameters: { durationSeconds: 4, resolution: '1280x720' },
    });
    expect(response.status).toBe(202);
    const running = await run(response.body.jobId);
    expect(running?.phase).toBe('running');
    expect(running?.execution).not.toHaveProperty('endpointRef');
    config.media!.integrations = config.media!.integrations.filter(
      (entry) => entry.id !== 'videos',
    );
    const paused = await run(response.body.jobId);
    expect(paused).toMatchObject({
      phase: 'requires_attention',
      error: { code: 'not_ready' },
      provider: { operationId: 'operation-1', certainty: 'submitted' },
    });
    await request(app)
      .post(`/api/media/jobs/${response.body.jobId}/retry`)
      .send({ clientRequestId: 'unsafe-direct-retry' })
      .expect(422);
    expect(posts).toBe(1);
    expect(polls).toBe(0);
  });

  it('resumes Vertex polling after token refresh and lost storage acknowledgment without a second generation', async () => {
    const catalog = mediaCatalogSchema.parse((await request(app).get('/api/media/catalog')).body);
    const response = await submit('vertex-video', {
      operation: 'video.generate',
      selection: { connectionId: 'vertex', modelId: vertexModel, catalogVersion: catalog.version },
      parameters: { count: 1, durationSeconds: 4, resolution: '720p', audio: false },
    });
    expect(response.status).toBe(202);
    const running = await run(response.body.jobId);
    expect(running?.phase).toBe('running');
    expect(running?.provider.operationId).toBe(vertexOperation);
    vertexToken = 'renewed-access-2';
    const commit = repository.commitMediaAssetWrite.bind(repository);
    jest.spyOn(repository, 'commitMediaAssetWrite').mockImplementationOnce(async (input) => {
      await commit(input);
      throw new Error('Lost Vertex video storage acknowledgment');
    });
    expect((await run(response.body.jobId))?.phase).toBe('ingesting');
    config.media = resolveMediaConfig();
    const completed = await run(response.body.jobId);
    expect(completed?.phase).toBe('succeeded');
    const output = completed?.outputs[0];
    expect(output).toMatchObject({
      kind: 'video',
      state: 'ready',
      asset: { type: 'video/mp4', bytes: 32 },
    });
    expect(posts).toBe(1);
    expect(polls).toBe(2);
    expect(vertexAuthorizations).toEqual([
      'Bearer access-1',
      'Bearer renewed-access-2',
      'Bearer renewed-access-2',
    ]);
    expect(
      JSON.stringify(
        (await request(app).get(`/api/media/jobs/${response.body.jobId}`).expect(200)).body,
      ),
    ).not.toMatch(/Bearer|fixture-auth|original-service-account/);
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

  it.each([
    ['unsafe-svg', 'unsupported'],
    ['mislabeled', 'invalid_request'],
  ] as const)(
    'settles a permanently invalid %s output and releases execution capacity',
    async (mode, code) => {
      config.media!.execution = {
        maxActiveTotal: 1,
        maxActivePerIntegration: 1,
        maxActivePerUser: 1,
      };
      const settle = jest.spyOn(accounting, 'settle');
      behavior = mode;
      const response = await submit(`invalid-${mode}`);
      expect(response.status).toBe(202);
      const failed = await run(response.body.jobId);
      expect(failed).toMatchObject({
        phase: 'failed',
        error: { code },
        provider: { certainty: 'terminal' },
      });
      expect(settle).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: response.body.jobId }),
        { inputTokens: 3, outputTokens: 7 },
        expect.anything(),
      );
      expect(posts).toBe(1);
      behavior = 'image';
      const next = await submit(`after-invalid-${mode}`);
      expect(next.status).toBe(202);
      expect((await run(next.body.jobId))?.phase).toBe('succeeded');
      expect(posts).toBe(2);
    },
  );

  it('fails a lost inline output on recovery without replaying inference or blocking the next job', async () => {
    config.media!.execution = {
      maxActiveTotal: 1,
      maxActivePerIntegration: 1,
      maxActivePerUser: 1,
    };
    const settle = jest.spyOn(accounting, 'settle');
    jest
      .spyOn(repository, 'reserveMediaAssetWrite')
      .mockRejectedValueOnce(new Error('Storage temporarily unavailable'));
    const response = await submit('lost-inline-output');
    expect((await run(response.body.jobId))?.phase).toBe('ingesting');
    expect(settle).not.toHaveBeenCalled();
    const failed = await run(response.body.jobId);
    expect(failed).toMatchObject({
      phase: 'failed',
      error: { code: 'output_expired' },
      provider: { certainty: 'terminal' },
    });
    expect(settle).toHaveBeenCalledTimes(1);
    expect(posts).toBe(1);
    const next = await submit('after-lost-inline');
    expect((await run(next.body.jobId))?.phase).toBe('succeeded');
    expect(posts).toBe(2);
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
