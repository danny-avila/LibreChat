/**
 * Tests for the WaveSpeed image generation tool — verifies the submit + poll
 * flow against the WaveSpeed prediction API and that agent mode returns a
 * ToolMessage with base64 in artifact.content rather than serialized into
 * content (mirrors the FluxAPI coverage in imageTools-agent.spec.js).
 */

import axios from 'axios';
import fetch from 'node-fetch';
import { ContentTypes, RetentionMode } from 'librechat-data-provider';
import { ToolMessage } from '@librechat/agents/langchain/messages';

import type { TFile } from 'librechat-data-provider';
import type { ProcessFileURL } from './wavespeed';

import { WaveSpeedAPI } from './wavespeed';

jest.mock('axios');
jest.mock('node-fetch');
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockedAxios = jest.mocked(axios);
const mockedFetch = jest.mocked(fetch);

const FAKE_BASE64 = 'aGVsbG8=';

type ToolCall = {
  id: string;
  name: string;
  args: Record<string, string>;
  type: 'tool_call';
};

const makeToolCall = (name: string, args: Record<string, string>): ToolCall => ({
  id: 'call_test_123',
  name,
  args,
  type: 'tool_call',
});

type ImageContent = Array<{ type: string; image_url: { url: string } }>;

const artifactContentOf = (message: ToolMessage): ImageContent =>
  (message.artifact as { content: ImageContent })?.content;

const contentStringOf = (message: ToolMessage): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

describe('WaveSpeedAPI', () => {
  const ENV_KEYS = ['WAVESPEED_API_KEY', 'WAVESPEED_API_BASE_URL', 'PROXY'];
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.WAVESPEED_API_KEY = 'test-wavespeed-key';
    delete process.env.WAVESPEED_API_BASE_URL;
    delete process.env.PROXY;

    mockedAxios.post.mockResolvedValue({ data: { code: 200, data: { id: 'prediction-123' } } });
    mockedAxios.get.mockResolvedValue({
      data: {
        code: 200,
        data: {
          id: 'prediction-123',
          status: 'completed',
          outputs: ['https://example.com/image.png'],
        },
      },
    });
    mockedFetch.mockResolvedValue({
      /** Real node-fetch responses always carry `ok`; the download path checks it. */
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(Buffer.from(FAKE_BASE64, 'base64')),
      headers: { get: () => 'image/png' },
    } as unknown as Awaited<ReturnType<typeof fetch>>);
  });

  afterEach(() => {
    jest.useRealTimers();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    savedEnv = {};
  });

  it('throws when WAVESPEED_API_KEY is missing and override is not set', () => {
    delete process.env.WAVESPEED_API_KEY;
    expect(() => new WaveSpeedAPI()).toThrow('Missing WAVESPEED_API_KEY environment variable.');
  });

  it('sets responseFormat to content_and_artifact when isAgent is true', () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    expect(wavespeed.responseFormat).toBe('content_and_artifact');
  });

  it('does not set responseFormat when isAgent is false', () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: false, processFileURL: jest.fn() });
    expect(wavespeed.responseFormat).not.toBe('content_and_artifact');
  });

  it('keeps tenant context without retaining the request object', () => {
    const req = {
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { conversationId: 'convo-1', isTemporary: true },
      config: { interfaceConfig: { retentionMode: RetentionMode.ALL } },
    };
    const wavespeed = new WaveSpeedAPI({ isAgent: false, processFileURL: jest.fn(), req });

    expect(wavespeed.tenantId).toBe('tenant-a');
    expect('req' in wavespeed).toBe(false);
    expect(wavespeed.retentionRequest).toEqual({
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { conversationId: 'convo-1', isTemporary: true },
      config: { interfaceConfig: { retentionMode: RetentionMode.ALL } },
    });
  });

  it('submits to the default model with a Bearer token and polls the prediction result', async () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    await invokePromise;

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.wavespeed.ai/api/v3/bytedance/seedream-v5.0-pro',
      { prompt: 'a box' },
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-wavespeed-key' }),
      }),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.wavespeed.ai/api/v3/predictions/prediction-123/result',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-wavespeed-key' }),
      }),
    );
  });

  it('submits to a custom model and forwards the size parameter', async () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(
      makeToolCall('wavespeed', {
        prompt: 'a box',
        model: 'wavespeed-ai/flux-dev',
        size: '1024*1024',
      }),
    );
    await jest.runAllTimersAsync();
    await invokePromise;

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-dev',
      { prompt: 'a box', size: '1024*1024' },
      expect.anything(),
    );
  });

  it('keeps polling while the prediction is in progress', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { code: 200, data: { status: 'created' } } })
      .mockResolvedValueOnce({ data: { code: 200, data: { status: 'processing' } } })
      .mockResolvedValueOnce({
        data: {
          code: 200,
          data: { status: 'completed', outputs: ['https://example.com/image.png'] },
        },
      });

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = (await invokePromise) as ToolMessage;

    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    expect(result).toBeInstanceOf(ToolMessage);
    expect(artifactContentOf(result)?.[0].type).toBe(ContentTypes.IMAGE_URL);
  });

  it('invoke() returns ToolMessage with base64 in artifact, not serialized in content', async () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = (await invokePromise) as ToolMessage;

    expect(result).toBeInstanceOf(ToolMessage);
    expect(contentStringOf(result)).not.toContain(FAKE_BASE64);

    expect(result.artifact).toBeDefined();
    const artifactContent = artifactContentOf(result);
    expect(Array.isArray(artifactContent)).toBe(true);
    expect(artifactContent[0].type).toBe(ContentTypes.IMAGE_URL);
    expect(artifactContent[0].image_url.url).toContain('base64');
  });

  it('passes minimal retention context when saving generated images', async () => {
    const processFileURL = jest
      .fn<ReturnType<ProcessFileURL>, Parameters<ProcessFileURL>>()
      .mockResolvedValue({ filepath: '/images/generated.png' } as TFile);
    const req = {
      user: { id: 'user-1', tenantId: 'tenant-a' },
      body: { conversationId: 'convo-1', isTemporary: true },
      config: { interfaceConfig: { retentionMode: RetentionMode.ALL } },
    };
    const wavespeed = new WaveSpeedAPI({
      isAgent: false,
      processFileURL,
      req,
      userId: 'user-1',
      fileStrategy: 'local',
    });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    await invokePromise;

    expect(processFileURL).toHaveBeenCalledWith(
      expect.objectContaining({
        URL: 'https://example.com/image.png',
        req: {
          user: { id: 'user-1', tenantId: 'tenant-a' },
          body: { conversationId: 'convo-1', isTemporary: true },
          config: { interfaceConfig: { retentionMode: RetentionMode.ALL } },
        },
      }),
    );
  });

  it('rejects a model id that could escape the request path', async () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    await expect(
      wavespeed.invoke(
        makeToolCall('wavespeed', { prompt: 'a box', model: '../../predictions/other/result' }),
      ),
    ).rejects.toThrow('Invalid model id');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects a size that is not width*height', async () => {
    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    await expect(
      wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box', size: 'huge' })),
    ).rejects.toThrow('Invalid size');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('reports a poll timeout as a timeout rather than missing image data', async () => {
    mockedAxios.get.mockResolvedValue({ data: { data: { status: 'processing' } } });

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = await invokePromise;

    expect(JSON.stringify(result)).toContain('Timed out');
  });

  it('does not encode a failed image download as an image artifact', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'application/xml' },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as unknown as Awaited<ReturnType<typeof fetch>>);

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = await invokePromise;

    const serialized = JSON.stringify(result);
    expect(serialized).toContain('Failed to download');
    expect(serialized).not.toContain('data:application/xml;base64');
  });

  it('invoke() returns ToolMessage with error string in content when task submission fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = (await invokePromise) as ToolMessage;

    expect(result).toBeInstanceOf(ToolMessage);
    expect(contentStringOf(result)).toContain('Something went wrong');
    expect(result.artifact).toBeDefined();
  });

  it('invoke() returns ToolMessage with error string in content when the prediction fails', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { code: 200, data: { status: 'failed', error: 'NSFW content detected' } },
    });

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = (await invokePromise) as ToolMessage;

    expect(result).toBeInstanceOf(ToolMessage);
    expect(contentStringOf(result)).toContain('failed');
    expect(contentStringOf(result)).toContain('NSFW content detected');
  });

  it('invoke() returns ToolMessage with error string when the prediction completes without outputs', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { code: 200, data: { status: 'completed', outputs: [] } },
    });

    const wavespeed = new WaveSpeedAPI({ isAgent: true });
    const invokePromise = wavespeed.invoke(makeToolCall('wavespeed', { prompt: 'a box' }));
    await jest.runAllTimersAsync();
    const result = (await invokePromise) as ToolMessage;

    expect(result).toBeInstanceOf(ToolMessage);
    expect(contentStringOf(result)).toContain('No image data received');
  });
});
