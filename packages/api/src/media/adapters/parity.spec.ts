import { z } from 'zod';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { mediaSubmissionRequestSchema, resolveMediaConfig } from 'librechat-data-provider';
import type { MediaProviderContext, MediaProviderInput } from '../provider';
import type { MediaTransport, MediaTransportRequest } from '../transport';
import { createOpenAIMediaAdapters, openAIImageCapabilities } from './openai';
import { createGoogleMediaAdapters, googleImageCapabilities } from './google';
import { createMicrosoftImageAdapter } from './microsoft';

function fixture(api: MediaProviderContext['connection']['api'], responses: unknown[] = []) {
  const calls: MediaTransportRequest[] = [];
  const downloads: MediaTransportRequest[] = [];
  const transport: MediaTransport = {
    async json<T>(input: MediaTransportRequest, schema: z.ZodType<T>) {
      calls.push(input);
      return schema.parse(responses.shift());
    },
    async stream(input) {
      downloads.push(input);
      return Readable.from(Buffer.from('video'));
    },
  };
  const context: MediaProviderContext = {
    transport,
    connection: {
      id: 'native',
      api,
      baseURL: 'https://provider.example/v1/',
      headers: { Authorization: 'Bearer fixture' },
      binding: 'account',
    },
    config: resolveMediaConfig(),
    signal: new AbortController().signal,
  };
  return { calls, downloads, context };
}

function request(
  modelId: string,
  operation: 'image.generate' | 'image.edit' | 'video.generate' = 'image.generate',
  parameters = {},
) {
  return mediaSubmissionRequestSchema.parse({
    clientRequestId: 'request',
    operation,
    prompt: 'A red ceramic teapot',
    inputs: operation === 'image.edit' ? [{ role: 'reference', file_id: 'original' }] : [],
    selection: { connectionId: 'native', modelId, catalogVersion: 'catalog' },
    parameters,
  });
}

const reference: MediaProviderInput = {
  role: 'reference',
  file_id: 'original',
  type: 'image/png',
  data: Buffer.from('original-image'),
};
const imageResponse = { data: [{ b64_json: Buffer.from('complete-image').toString('base64') }] };

describe('native OpenAI model mappings', () => {
  const [images, videos] = createOpenAIMediaAdapters();

  it.each(['openai/gpt-image-2.5-flare', 'gpt-image-2.5-flare', 'gpt-image-1.5'])(
    'uses the Image API for %s and preserves output controls',
    async (model) => {
      const { context, calls } = fixture('openai.images', [imageResponse]);
      const result = await images.submit(
        request(model, 'image.generate', {
          count: 1,
          format: 'webp',
          outputCompression: 70,
          quality: 'high',
        }),
        [],
        context,
      );
      expect(result.status).toBe('completed');
      expect(calls[0].url).toBe('https://provider.example/v1/images/generations');
      expect(JSON.parse(calls[0].body as string)).toMatchObject({
        model: model.replace('openai/', ''),
        output_format: 'webp',
        output_compression: 70,
        quality: 'high',
      });
      expect(calls[0].signal).toBe(context.signal);
    },
  );

  it('keeps image edits multipart with references and a separate mask', async () => {
    const { context, calls } = fixture('openai.images', [imageResponse]);
    await images.submit(
      request('openai/gpt-image-2.5-sunburst', 'image.edit'),
      [reference, { ...reference, role: 'mask', file_id: 'mask' }],
      context,
    );
    expect(calls[0].url).toContain('/images/edits');
    const body = calls[0].body as FormData;
    expect(body.get('model')).toBe('gpt-image-2.5-sunburst');
    expect(body.getAll('image[]')).toHaveLength(1);
    expect(body.get('mask')).toBeInstanceOf(Blob);
    expect(calls[0].headers?.['Content-Type']).toBeUndefined();
  });

  it.each([
    ['openai/gpt-5-image', 'gpt-5', 'gpt-image-1'],
    ['openai/gpt-5.4-image-2', 'gpt-5.4', 'gpt-image-2'],
  ])('maps %s to the documented Responses tool composition', async (id, model, image) => {
    const { context, calls } = fixture('openai.images', [
      {
        status: 'completed',
        output: [
          { type: 'reasoning' },
          { type: 'image_generation_call', result: imageResponse.data[0].b64_json },
        ],
        usage: { input_tokens: 12, output_tokens: 24 },
      },
    ]);
    const result = await images.submit(request(id, 'image.edit'), [reference], context);
    expect(calls[0].url).toBe('https://provider.example/v1/responses');
    expect(JSON.parse(calls[0].body as string)).toMatchObject({
      model,
      store: false,
      tool_choice: { type: 'image_generation' },
      max_tool_calls: 1,
      tools: [{ type: 'image_generation', model: image }],
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text' },
            {
              type: 'input_image',
              image_url: `data:image/png;base64,${reference.data.toString('base64')}`,
            },
          ],
        },
      ],
    });
    expect(result).toMatchObject({
      status: 'completed',
      parts: [{ kind: 'image', data: Buffer.from('complete-image') }],
      usage: { inputTokens: 12, outputTokens: 24 },
    });
  });

  it('exposes verified canonical profiles and leaves the undocumented Mini composition unavailable', () => {
    const profiles = images.catalog!(resolveMediaConfig());
    expect(profiles).toHaveLength(8);
    expect(new Set(profiles.map((model) => model.modelId)).size).toBe(8);
    expect(profiles.find((model) => model.modelId === 'openai/gpt-5-image-mini')).toMatchObject({
      unavailableReason: 'unsupported',
      capabilities: [],
    });
    expect(openAIImageCapabilities('gpt-image-2.5-flare', resolveMediaConfig())).toEqual(
      openAIImageCapabilities('openai/gpt-image-2.5-flare', resolveMediaConfig()),
    );
  });

  it('restores existing Sora jobs and authenticates only the bound content endpoint', async () => {
    const { context, calls, downloads } = fixture('openai.videos', [
      { id: 'video-1', status: 'queued' },
      { id: 'video-1', status: 'completed' },
    ]);
    await expect(
      videos.submit(
        request('openai/sora-2-pro', 'video.generate', {
          durationSeconds: 20,
          resolution: '1920x1080',
        }),
        [],
        context,
      ),
    ).resolves.toMatchObject({ status: 'running', operationId: 'video-1' });
    const completed = await videos.poll!('video-1', context);
    expect((calls[0].body as FormData).get('seconds')).toBe('20');
    if (completed.status !== 'completed' || completed.parts[0].kind === 'text')
      throw new Error('Expected video');
    await videos.download(completed.parts[0], context);
    expect(downloads[0].headers).toEqual(context.connection.headers);
    await expect(
      videos.download(
        { kind: 'video', ordinal: 0, type: 'video/mp4', url: 'https://other.example/video' },
        context,
      ),
    ).rejects.toThrow();
    expect(downloads).toHaveLength(1);
  });
});

describe('native Gemini models and continuation', () => {
  const [adapter] = createGoogleMediaAdapters();
  it.each([
    'google/gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image-preview',
  ])('sends resolution and image references to %s', async (model) => {
    const { context, calls } = fixture('google.generateContent', [
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { mimeType: 'image/png', data: imageResponse.data[0].b64_json },
                  thoughtSignature: 'next-signature',
                },
              ],
            },
          },
        ],
      },
    ]);
    context.continuation = {
      prompt: 'Original image',
      inputs: [],
      parts: [
        {
          kind: 'image',
          ordinal: 0,
          type: 'image/png',
          data: reference.data,
          thoughtSignature: 'original-signature',
        },
      ],
    };
    await adapter.submit(
      request(model, 'image.edit', { resolution: '1K', aspectRatio: '3:2' }),
      [reference],
      context,
    );
    expect(calls[0].url).toBe(
      `https://provider.example/v1/models/${model.replace('google/', '')}:generateContent`,
    );
    const body = JSON.parse(calls[0].body as string);
    expect(body.generationConfig).toEqual({
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { imageSize: '1K', aspectRatio: '3:2' },
    });
    expect(body.contents[1]).toMatchObject({
      role: 'model',
      parts: [{ thoughtSignature: 'original-signature' }],
    });
    expect(body.contents[2]).toMatchObject({
      role: 'user',
      parts: [{ text: 'A red ceramic teapot' }, { inlineData: { mimeType: 'image/png' } }],
    });
  });

  it('advertises the native model reference counts and Lite resolution limit', () => {
    const config = resolveMediaConfig();
    expect(googleImageCapabilities('google/gemini-3.1-flash-lite-image', config)[1]).toMatchObject({
      inputs: { max: 14 },
      controls: { resolution: { values: ['1K'] } },
    });
    expect(googleImageCapabilities('gemini-2.5-flash-image', config)[1].inputs.max).toBe(3);
    expect(adapter.catalog!(config)).toHaveLength(6);
  });
});

describe('Microsoft MAI native API', () => {
  const adapter = createMicrosoftImageAdapter();
  it('uses the resource-specific MAI route and documented generation parameters', async () => {
    const { context, calls } = fixture('microsoft.images', [imageResponse]);
    context.connection.baseURL = 'https://resource.services.ai.azure.com/mai/v1/';
    context.connection.headers = { 'api-key': 'fixture' };
    context.connection.options = { 'deployment.MAI-Image-2.6': 'production-image' };
    await adapter.submit(
      request('microsoft/mai-image-2.6', 'image.generate', {
        aspectRatio: '16:9',
        providerOptions: { web_grounding: true },
      }),
      [],
      context,
    );
    expect(calls[0].url).toBe('https://resource.services.ai.azure.com/mai/v1/images/generations');
    const body = JSON.parse(calls[0].body as string);
    expect(body).toMatchObject({
      model: 'production-image',
      width: 1365,
      height: 768,
      web_grounding: true,
    });
    expect(body.width * body.height).toBeLessThanOrEqual(1_048_576);
    expect(calls[0].headers?.['api-key']).toBe('fixture');
    expect(adapter.configuration!.baseURL).toBe('');
  });

  it('converts WebP references to the documented PNG multipart image format', async () => {
    const { context, calls } = fixture('microsoft.images', [imageResponse]);
    const data = await sharp({ create: { width: 24, height: 16, channels: 3, background: 'red' } })
      .webp()
      .toBuffer();
    await adapter.submit(
      request('microsoft/mai-image-2.5', 'image.edit'),
      [{ ...reference, type: 'image/webp', data }],
      context,
    );
    const image = (calls[0].body as FormData).get('image') as Blob;
    expect(image.type).toBe('image/png');
    expect(await sharp(Buffer.from(await image.arrayBuffer())).metadata()).toMatchObject({
      format: 'png',
      width: 24,
      height: 16,
    });
  });
});
