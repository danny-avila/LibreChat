import { z } from 'zod';
import { resolveMediaConfig, mediaSubmissionRequestSchema } from 'librechat-data-provider';
import type { MediaTransport, MediaTransportRequest } from '../transport';
import type { MediaProviderContext } from '../provider';
import { createMediaCatalog, validateMediaOffering } from '../catalog';
import { createVertexVideoAdapter } from './vertexVideo';
import { createRESTMediaAdapters } from './rest';

const model = 'veo-3.1-fast-generate-001';
const baseURL =
  'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/';
const operation = `projects/test-project/locations/us-central1/publishers/google/models/${model}/operations/job-1`;
const request = mediaSubmissionRequestSchema.parse({
  clientRequestId: 'request',
  operation: 'video.generate',
  prompt: 'A sailboat on calm water',
  selection: { connectionId: 'vertex', modelId: model, catalogVersion: 'catalog' },
  parameters: {
    count: 1,
    durationSeconds: 4,
    resolution: '720p',
    aspectRatio: '16:9',
    audio: false,
  },
});

function fixture(responses: unknown[] = []) {
  const calls: MediaTransportRequest[] = [];
  const transport: MediaTransport = {
    async json<T>(input: MediaTransportRequest, schema: z.ZodType<T>) {
      calls.push(input);
      return schema.parse(responses.shift());
    },
    async stream() {
      throw new Error('Unexpected external download');
    },
  };
  const context: MediaProviderContext = {
    transport,
    connection: {
      id: 'vertex',
      api: 'google.vertex.videos',
      baseURL,
      headers: { Authorization: 'Bearer access-token' },
      binding: 'service-account',
    },
    config: resolveMediaConfig(),
    signal: new AbortController().signal,
  };
  return { context, calls, transport };
}

describe('Vertex Veo adapter', () => {
  const adapter = createVertexVideoAdapter();

  it('submits once to Vertex and retains the complete operation resource for recovery', async () => {
    const { context, calls } = fixture([{ name: operation }]);
    expect(await adapter.submit(request, [], context)).toEqual({
      status: 'running',
      operationId: operation,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${baseURL}models/${model}:predictLongRunning`);
    expect(calls[0].headers).toEqual({
      Authorization: 'Bearer access-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(calls[0].body as string)).toEqual({
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: 1,
        durationSeconds: 4,
        resolution: '720p',
        aspectRatio: '16:9',
        generateAudio: false,
      },
    });
  });

  it('polls the original operation and decodes all complete video bytes', async () => {
    const bytes = Buffer.from('complete-video-fixture');
    const { context, calls } = fixture([
      { name: operation },
      {
        name: operation,
        done: true,
        response: {
          videos: [{ bytesBase64Encoded: bytes.toString('base64'), mimeType: 'video/mp4' }],
        },
      },
    ]);
    expect(await adapter.poll!(operation, context)).toEqual({
      status: 'running',
      operationId: operation,
    });
    const result = await adapter.poll!(operation, context);
    expect(result).toEqual({
      status: 'completed',
      parts: [{ kind: 'video', ordinal: 0, type: 'video/mp4', data: bytes }],
    });
    expect(
      calls.every((call) => call.url === `${baseURL}models/${model}:fetchPredictOperation`),
    ).toBe(true);
    expect(calls.every((call) => JSON.parse(call.body as string).operationName === operation)).toBe(
      true,
    );
    expect(calls[1].timeoutMs).toBe(context.config.timeouts.pollRequestMs);
  });

  it.each([
    operation.replace('test-project', 'another-project'),
    operation.replace('us-central1', 'europe-west1'),
    operation.replace(model, 'unconfigured-model'),
    operation.replace('job-1', '../elsewhere'),
    'https://untrusted.example/operation',
  ])(
    'rejects an operation outside the original Vertex scope before making a request: %s',
    async (id) => {
      const { context, calls } = fixture();
      await expect(adapter.poll!(id, context)).rejects.toMatchObject({ certainty: 'uncertain' });
      expect(calls).toHaveLength(0);
    },
  );

  it('does not accept a response naming another operation', async () => {
    const { context } = fixture([{ name: operation.replace('job-1', 'job-2'), done: false }]);
    await expect(adapter.poll!(operation, context)).rejects.toMatchObject({
      certainty: 'uncertain',
    });
  });

  it.each([
    { error: { code: 8, message: 'Quota exceeded' } },
    { response: { raiMediaFilteredCount: 1, videos: [] } },
  ])('records confirmed terminal provider failures without re-submitting', async (result) => {
    const { context, calls } = fixture([{ name: operation, done: true, ...result }]);
    expect(await adapter.poll!(operation, context)).toEqual({ status: 'failed' });
    expect(calls).toHaveLength(1);
  });

  it.each(['not base64', 'YWJj'])(
    'rejects malformed or oversized inline video output: %s',
    async (encoded) => {
      const { context } = fixture([
        {
          name: operation,
          done: true,
          response: { videos: [{ bytesBase64Encoded: encoded, mimeType: 'video/mp4' }] },
        },
      ]);
      context.config.transfers.maxVideoBytes = 2;
      await expect(adapter.poll!(operation, context)).rejects.toThrow();
    },
  );

  it('does not advertise or submit an unimplemented frame-input workflow', async () => {
    const { context, calls } = fixture();
    await expect(
      adapter.submit(
        request,
        [{ role: 'start_frame', file_id: 'frame', type: 'image/png', data: Buffer.from('image') }],
        context,
      ),
    ).rejects.toMatchObject({ certainty: 'rejected' });
    expect(calls).toHaveLength(0);
  });

  it('never forwards Vertex credentials to a supplied download URL', async () => {
    const { context, calls } = fixture();
    await expect(
      adapter.download(
        { kind: 'video', ordinal: 0, type: 'video/mp4', url: 'https://untrusted.example/video' },
        context,
      ),
    ).rejects.toMatchObject({ certainty: 'uncertain' });
    expect(calls).toHaveLength(0);
  });

  it('exposes native Vertex video controls in the catalog without exposing credentials', async () => {
    const { context, calls, transport } = fixture();
    const config = resolveMediaConfig({
      enabled: true,
      limits: { maxOutputs: 2 },
      integrations: [
        {
          id: 'vertex',
          label: 'Google (Vertex AI)',
          api: 'google.vertex.videos',
          endpointRef: { kind: 'vertex', keyFile: '/secret/auth.json' },
          catalog: {
            kind: 'configured',
            models: [model, 'veo-3.1-generate-001', 'unimplemented-model'],
          },
          operations: ['video.generate'],
        },
      ],
    });
    const catalog = createMediaCatalog({
      transport,
      adapters: createRESTMediaAdapters(),
      now: () => 0,
    });
    const snapshot = await catalog.read(config, async () => context.connection, 'owner');
    expect(
      snapshot.catalog.offerings.map((o) => ({ name: o.modelName, available: o.available })),
    ).toEqual([
      { name: 'Veo 3.1 Fast', available: true },
      { name: 'Veo 3.1', available: true },
      { name: 'unimplemented-model', available: false },
    ]);
    const offering = snapshot.catalog.offerings[0];
    expect(offering.connectionName).toBe('Google (Vertex AI)');
    expect(offering.capabilities[0].controls.count).toEqual({ min: 1, max: 2 });
    expect(() => validateMediaOffering(request, offering)).not.toThrow();
    expect(() =>
      validateMediaOffering({ ...request, parameters: { count: 3 } }, offering),
    ).toThrow();
    expect(calls).toHaveLength(0);
    expect(JSON.stringify(snapshot.catalog)).not.toMatch(
      /auth\.json|access-token|service-account|test-project/,
    );
  });
});
