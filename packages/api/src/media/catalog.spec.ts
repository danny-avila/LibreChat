import { z } from 'zod';
import {
  FileSources,
  resolveMediaConfig,
  mediaSubmissionRequestSchema,
} from 'librechat-data-provider';
import type { MediaIntegration } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { MediaTransport, MediaTransportRequest } from './transport';
import type { MediaConnection, MediaProviderContext } from './provider';
import { createMediaCatalog, validateMediaOffering } from './catalog';
import { createMediaCredentialResolver } from './credentials';
import { createRESTMediaAdapters } from './adapters/rest';

const imageIntegration: MediaIntegration = {
  id: 'images',
  api: 'openrouter.images',
  endpointRef: { kind: 'custom', name: 'OpenRouter' },
  catalog: { kind: 'configured', models: ['google/image'] },
  operations: ['image.generate', 'image.edit'],
};
const videoIntegration: MediaIntegration = {
  id: 'videos',
  api: 'openrouter.videos',
  endpointRef: { kind: 'custom', name: 'OpenRouter' },
  catalog: {
    kind: 'configured',
    models: ['google/video', 'bfl/edit', 'bfl/upscale', 'heygen/avatar'],
  },
  operations: ['video.generate'],
};
const imageEndpoints = {
  id: 'google/image',
  endpoints: [
    {
      provider_tag: 'google-ai-studio',
      supported_parameters: {
        size: { type: 'enum', values: ['1024x1024'] },
        n: { type: 'range', min: 1, max: 10 },
        quality: { type: 'enum', values: ['high'] },
        input_references: { type: 'range', min: 0, max: 3 },
      },
    },
    {
      provider_tag: 'google-vertex/global',
      supported_parameters: {
        resolution: { type: 'enum', values: ['1K', '2K'] },
        n: { type: 'enum', values: [1, 2, 4] },
        input_references: { type: 'range', min: 0, max: 14 },
        seed: { type: 'boolean' },
        output_format: { type: 'enum', values: ['png', 'webp'] },
      },
    },
  ],
};
const videoModels = {
  data: [
    {
      id: 'google/video',
      supported_durations: [4, 6, 8],
      supported_resolutions: ['720p', '1080p'],
      supported_frame_images: ['first_frame', 'last_frame'],
      generate_audio: true,
    },
    { id: 'bfl/edit', supported_durations: null, supported_resolutions: null },
    { id: 'bfl/upscale', supported_durations: null, upscale_factor: { min: 1.5, max: 3 } },
    { id: 'heygen/avatar', supported_durations: null, supported_resolutions: ['720p'] },
  ],
};

function fixtureTransport(response: (request: MediaTransportRequest) => string | Promise<string>) {
  const calls: MediaTransportRequest[] = [];
  const transport: MediaTransport = {
    async json<T>(request: MediaTransportRequest, schema: z.ZodType<T>): Promise<T> {
      calls.push(request);
      return schema.parse(JSON.parse(await response(request)));
    },
    async stream() {
      throw new Error('Unexpected download');
    },
  };
  return { calls, transport };
}

function connection(integration: MediaIntegration): MediaConnection {
  return {
    id: integration.id,
    api: integration.api,
    baseURL: 'https://openrouter.example/api/v1',
    headers: { Authorization: 'Bearer fixture' },
    binding: 'revision',
  };
}

describe('media catalog provider conformance', () => {
  const adapters = createRESTMediaAdapters();
  const config = resolveMediaConfig({
    enabled: true,
    integrations: [imageIntegration],
    limits: { maxOutputs: 3, maxInputs: 5 },
  });
  const request = (parameters = {}) =>
    mediaSubmissionRequestSchema.parse({
      clientRequestId: 'request',
      operation: 'image.generate',
      prompt: 'A forest',
      parameters,
      selection: { connectionId: 'images', modelId: 'google/image', catalogVersion: 'v1' },
    });

  it('uses the official endpoint envelope and one policy-compatible parameter intersection', async () => {
    const fixture = fixtureTransport(() => JSON.stringify(imageEndpoints));
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
    const result = await catalog.read(
      config,
      async (integration) => ({
        ...connection(integration),
        routing: { only: ['google-vertex'], ignore: ['google-ai-studio'], zdr: true },
      }),
      'owner',
    );
    const offering = result.catalog.offerings[0];
    expect(offering.available).toBe(true);
    expect(result.resolved.get('images:google/image')?.providerTag).toBe('google-vertex/global');
    expect(offering.capabilities[0].controls).toMatchObject({
      count: { min: 1, max: 3, values: [1, 2] },
      resolution: { values: ['1K', '2K'] },
      seed: { min: 0 },
    });
    expect(offering.capabilities[0].inputs.max).toBe(5);
    expect(() =>
      validateMediaOffering(request({ resolution: '2K', seed: 0, count: 2 }), offering),
    ).not.toThrow();
    expect(() => validateMediaOffering(request({ quality: 'high' }), offering)).toThrow();
    expect(() => validateMediaOffering(request({ size: '1024x1024' }), offering)).toThrow();
    expect(() => validateMediaOffering(request({ count: 3 }), offering)).toThrow();
    expect(fixture.calls[0].url).toContain('/images/models/google/image/endpoints');
    expect(JSON.stringify(result.catalog)).not.toContain('Bearer');
    expect(JSON.stringify(result.catalog)).not.toContain('google-vertex');
  });

  it('honors ordering without routing outside a no-fallback policy', async () => {
    const fixture = fixtureTransport(() => JSON.stringify(imageEndpoints));
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
    const result = await catalog.read(
      config,
      async (integration) => ({
        ...connection(integration),
        routing: { order: ['unavailable', 'google-vertex'], allow_fallbacks: false },
      }),
      'owner',
    );
    expect(result.resolved.get('images:google/image')?.providerTag).toBe('google-vertex/global');
    const denied = await catalog.read(
      config,
      async (integration) => ({
        ...connection(integration),
        routing: { only: ['another-provider'] },
      }),
      'owner',
    );
    expect(denied.catalog.offerings[0].available).toBe(false);
  });

  it.each([
    {
      id: 'google/image',
      endpoints: [
        {
          provider_tag: 'vector',
          supported_parameters: { output_format: { type: 'enum', values: ['svg'] } },
        },
      ],
    },
    {
      id: 'google/image',
      endpoints: [
        { provider_tag: null, supported_parameters: {} },
        { provider_tag: null, supported_parameters: {} },
      ],
    },
    { id: 'another-model', endpoints: imageEndpoints.endpoints },
    { data: imageEndpoints.endpoints },
  ])(
    'does not offer vector-only, ambiguous, mismatched, or malformed discovery',
    async (payload) => {
      const fixture = fixtureTransport(() => JSON.stringify(payload));
      const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
      const result = await catalog.read(
        config,
        async (integration) => connection(integration),
        'owner',
      );
      expect(result.catalog.offerings[0].available).toBe(false);
    },
  );

  it('admits video generation durations while excluding edit, upscale, and avatar models', async () => {
    const fixture = fixtureTransport(() => JSON.stringify(videoModels));
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
    const videoConfig = resolveMediaConfig({ enabled: true, integrations: [videoIntegration] });
    const result = await catalog.read(
      videoConfig,
      async (integration) => connection(integration),
      'owner',
    );
    expect(result.catalog.offerings.map((offering) => offering.available)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    const videoRequest = mediaSubmissionRequestSchema.parse({
      clientRequestId: 'video',
      operation: 'video.generate',
      prompt: 'A forest',
      selection: { connectionId: 'videos', modelId: 'google/video', catalogVersion: 'v1' },
      parameters: { durationSeconds: 5 },
    });
    expect(() => validateMediaOffering(videoRequest, result.catalog.offerings[0])).toThrow();
  });

  it.each([
    { zdr: true },
    { data_collection: 'deny' as const },
    { only: ['google'] },
    { allow_fallbacks: false },
  ])('blocks video when required routing/privacy cannot be honored: %j', async (routing) => {
    const fixture = fixtureTransport(() => JSON.stringify(videoModels));
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
    const videoConfig = resolveMediaConfig({ enabled: true, integrations: [videoIntegration] });
    const result = await catalog.read(
      videoConfig,
      async (integration) => ({ ...connection(integration), routing }),
      'owner',
    );
    expect(result.catalog.offerings.every((offering) => !offering.available)).toBe(true);
  });

  it('evicts least recently used credential-bound entries and expires cached capabilities', async () => {
    let time = 0;
    const fixture = fixtureTransport(() => JSON.stringify(imageEndpoints));
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => time });
    const bounded = resolveMediaConfig({
      ...config,
      catalog: { ...config.catalog, maxCacheEntries: 2 },
    });
    const read = (binding: string) =>
      catalog.read(
        bounded,
        async (integration) => ({ ...connection(integration), binding }),
        'owner',
      );
    await read('a');
    await read('b');
    await read('a');
    await read('c');
    await read('b');
    expect(fixture.calls).toHaveLength(4);
    time = config.catalog.refreshMs + 1;
    await read('b');
    expect(fixture.calls).toHaveLength(5);
  });

  it('shares in-flight reads and bounds discovery concurrency across integrations', async () => {
    let active = 0;
    let peak = 0;
    const fixture = fixtureTransport(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return JSON.stringify(imageEndpoints);
    });
    const catalog = createMediaCatalog({ ...fixture, adapters, now: () => 0 });
    const bounded = resolveMediaConfig({
      enabled: true,
      catalog: { maxConcurrentRequests: 2 },
      integrations: ['a', 'b', 'c'].map((id) => ({ ...imageIntegration, id })),
    });
    const resolve = async (integration: MediaIntegration) => connection(integration);
    await Promise.all([
      catalog.read(bounded, resolve, 'owner'),
      catalog.read(bounded, resolve, 'owner'),
    ]);
    expect(fixture.calls).toHaveLength(3);
    expect(peak).toBe(2);
  });
});

describe('media provider routing and continuation', () => {
  const config = resolveMediaConfig({
    enabled: true,
    integrations: [imageIntegration, videoIntegration],
  });
  const adapters = createRESTMediaAdapters();
  const appConfig: AppConfig = {
    config: {},
    fileStrategy: FileSources.local,
    imageOutputType: 'png',
    endpoints: {
      custom: [
        {
          name: 'OpenRouter',
          baseURL: 'https://openrouter.example/api/v1',
          apiKey: '${ROUTER_KEY}',
          addParams: {
            temperature: 0.2,
            provider: { only: ['google-vertex'], zdr: true, data_collection: 'deny' },
          },
        },
      ],
    },
  };

  it.each([
    { maxNativeParts: 1, maxOutputs: 2 },
    { maxNativeParts: 4, maxOutputs: 1 },
  ])('bounds Gemini parts after the final image is appended: %j', async (limits) => {
    const fixture = fixtureTransport(() =>
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Two images', inlineData: { mimeType: 'image/png', data: 'YQ==' } },
                { inlineData: { mimeType: 'image/png', data: 'Yg==' } },
              ],
            },
          },
        ],
      }),
    );
    const adapter = adapters.find((entry) => entry.api === 'google.generateContent');
    if (!adapter) {
      throw new Error('Missing adapter');
    }
    await expect(
      adapter.submit(
        mediaSubmissionRequestSchema.parse({
          clientRequestId: 'bounded',
          operation: 'image.generate',
          prompt: 'A forest',
          selection: { connectionId: 'google', modelId: 'gemini-image', catalogVersion: 'v1' },
        }),
        [],
        {
          ...fixture,
          config: resolveMediaConfig({ ...config, limits: { ...config.limits, ...limits } }),
          signal: new AbortController().signal,
          connection: { ...connection(imageIntegration), api: 'google.generateContent' },
        },
      ),
    ).rejects.toMatchObject({ certainty: 'uncertain' });
  });

  it('extracts only validated policy and invalidates binding when policy changes', async () => {
    const resolver = createMediaCredentialResolver({
      environment: { ROUTER_KEY: 'test-key' },
      repository: { getStoredMediaCredential: async () => null },
      decrypt: async (value) => value,
      now: () => 0,
    });
    const args = {
      scope: { ownerId: 'owner', tenantId: null },
      integration: imageIntegration,
      appConfig,
      minValidityMs: 0,
    };
    const resolved = await resolver(args);
    expect(resolved.routing).toEqual({
      only: ['google-vertex'],
      zdr: true,
      data_collection: 'deny',
    });
    expect(resolved.headers).toEqual({ Authorization: 'Bearer test-key' });
    const endpoint = appConfig.endpoints?.custom?.[0];
    const changed: AppConfig = {
      ...appConfig,
      endpoints: { custom: [{ ...endpoint, addParams: { provider: { zdr: false } } }] },
    };
    expect((await resolver({ ...args, appConfig: changed })).binding).not.toBe(resolved.binding);
    const unsupported: AppConfig = {
      ...appConfig,
      endpoints: {
        custom: [{ ...endpoint, addParams: { provider: { max_price: { image: 0.1 } } } }],
      },
    };
    await expect(resolver({ ...args, appConfig: unsupported })).rejects.toMatchObject({
      code: 'not_ready',
    });
  });

  it('preserves image privacy policy while narrowing the endpoint and maps resolution correctly', async () => {
    const fixture = fixtureTransport(() => JSON.stringify({ data: [{ b64_json: 'YQ==' }] }));
    const context: MediaProviderContext = {
      ...fixture,
      config,
      signal: new AbortController().signal,
      connection: {
        ...connection(imageIntegration),
        routing: {
          only: ['google-vertex'],
          ignore: ['google-ai-studio'],
          zdr: true,
          data_collection: 'deny',
          allow_fallbacks: true,
        },
      },
      providerTag: 'google-vertex/global',
    };
    const adapter = adapters.find((entry) => entry.api === 'openrouter.images');
    if (!adapter) {
      throw new Error('Missing adapter');
    }
    await adapter.submit(
      mediaSubmissionRequestSchema.parse({
        clientRequestId: 'image',
        operation: 'image.generate',
        prompt: 'A forest',
        selection: { connectionId: 'images', modelId: 'google/image', catalogVersion: 'v1' },
        parameters: { resolution: '2K' },
      }),
      [],
      context,
    );
    expect(JSON.parse(String(fixture.calls[0].body))).toMatchObject({
      resolution: '2K',
      provider: {
        only: ['google-vertex/global'],
        ignore: ['google-ai-studio'],
        zdr: true,
        data_collection: 'deny',
        allow_fallbacks: false,
      },
    });
    expect(JSON.parse(String(fixture.calls[0].body)).size).toBeUndefined();
  });

  it('refuses video transport before a paid call when ZDR is required', async () => {
    const fixture = fixtureTransport(() => JSON.stringify({ id: 'job', status: 'queued' }));
    const adapter = adapters.find((entry) => entry.api === 'openrouter.videos');
    if (!adapter) {
      throw new Error('Missing adapter');
    }
    await expect(
      adapter.submit(
        mediaSubmissionRequestSchema.parse({
          clientRequestId: 'video',
          operation: 'video.generate',
          prompt: 'A forest',
          selection: { connectionId: 'videos', modelId: 'google/video', catalogVersion: 'v1' },
        }),
        [],
        {
          ...fixture,
          config,
          signal: new AbortController().signal,
          connection: { ...connection(videoIntegration), routing: { zdr: true } },
        },
      ),
    ).rejects.toMatchObject({ certainty: 'rejected' });
    expect(fixture.calls).toHaveLength(0);
  });

  it('replays ordered Gemini text and images with signatures and preserves returned signatures privately', async () => {
    const fixture = fixtureTransport(() =>
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: 'Here is the revision', thoughtSignature: 'text-signature' },
                {
                  inlineData: { mimeType: 'image/png', data: 'Yg==' },
                  thoughtSignature: 'image-signature',
                },
              ],
            },
          },
        ],
      }),
    );
    const adapter = adapters.find((entry) => entry.api === 'google.generateContent');
    if (!adapter) {
      throw new Error('Missing adapter');
    }
    const result = await adapter.submit(
      mediaSubmissionRequestSchema.parse({
        clientRequestId: 'revision',
        operation: 'image.generate',
        prompt: 'Make it blue',
        selection: { connectionId: 'google', modelId: 'gemini-image', catalogVersion: 'v1' },
      }),
      [],
      {
        ...fixture,
        config,
        signal: new AbortController().signal,
        connection: { ...connection(imageIntegration), api: 'google.generateContent' },
        continuation: {
          prompt: 'Draw a red cube',
          inputs: [],
          parts: [
            { kind: 'text', ordinal: 0, text: 'A red cube', thoughtSignature: 'previous-text' },
            {
              kind: 'image',
              ordinal: 1,
              type: 'image/png',
              data: Buffer.from('a'),
              thoughtSignature: 'previous-image',
            },
          ],
        },
      },
    );
    const sent = JSON.parse(String(fixture.calls[0].body));
    expect(sent.contents.map((item: { role: string }) => item.role)).toEqual([
      'user',
      'model',
      'user',
    ]);
    expect(sent.contents[1].parts).toEqual([
      { text: 'A red cube', thoughtSignature: 'previous-text' },
      { inlineData: { mimeType: 'image/png', data: 'YQ==' }, thoughtSignature: 'previous-image' },
    ]);
    expect(result).toMatchObject({
      status: 'completed',
      parts: [
        { kind: 'text', ordinal: 0, thoughtSignature: 'text-signature' },
        { kind: 'image', ordinal: 1, thoughtSignature: 'image-signature' },
      ],
    });
  });
});
