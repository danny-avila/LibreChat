import type { AxiosInstance } from 'axios';
import { createAxiosInstance } from '~/utils/axios';
import { createSoraVideoTool, generateSoraVideo } from './video';

jest.mock('~/utils/axios', () => ({ createAxiosInstance: jest.fn() }));

const mp4 = Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex');

describe('generateSoraVideo', () => {
  it('creates and polls a Sora job before downloading the generated MP4', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 'job/1', status: 'running' } });
    const get = jest
      .fn()
      .mockResolvedValueOnce({
        data: { id: 'job/1', status: 'succeeded', generations: [{ id: 'generation/1' }] },
      })
      .mockResolvedValueOnce({ data: mp4 });
    const client = { post, get } as AxiosInstance;

    const result = await generateSoraVideo({
      apiKey: 'azure-key',
      apiVersion: 'preview',
      baseURL: 'https://example.openai.azure.com/openai/v1/',
      model: 'sora-deployment',
      input: { prompt: 'A paper airplane in flight' },
      client,
      sleep: jest.fn().mockResolvedValue(undefined),
    });

    expect(post).toHaveBeenCalledWith(
      'https://example.openai.azure.com/openai/v1/video/generations/jobs',
      {
        model: 'sora-deployment',
        prompt: 'A paper airplane in flight',
        width: '1920',
        height: '1080',
        n_seconds: '5',
        n_variants: '1',
      },
      expect.objectContaining({
        headers: { 'api-key': 'azure-key', 'Content-Type': 'application/json' },
        params: { 'api-version': 'preview' },
      }),
    );
    expect(get.mock.calls[0][0]).toBe(
      'https://example.openai.azure.com/openai/v1/video/generations/jobs/job%2F1',
    );
    expect(get.mock.calls[1][0]).toBe(
      'https://example.openai.azure.com/openai/v1/video/generations/generation%2F1/content/video',
    );
    expect(result).toEqual(mp4);
  });

  it('surfaces a failed Sora job without requesting video content', async () => {
    const client = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'job-1', status: 'failed', failure_reason: 'content policy' },
      }),
      get: jest.fn(),
    } as AxiosInstance;

    await expect(
      generateSoraVideo({
        apiKey: 'azure-key',
        apiVersion: 'preview',
        baseURL: 'https://example.openai.azure.com/openai/v1',
        model: 'sora',
        input: { prompt: 'test' },
        client,
      }),
    ).rejects.toThrow('content policy');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('aborts a stalled create request when the overall deadline expires', async () => {
    const post = jest.fn((_url, _body, config) => {
      return new Promise((_resolve, reject) => {
        config.signal.addEventListener('abort', () => reject(config.signal.reason), {
          once: true,
        });
      });
    });
    const client = { post, get: jest.fn() } as unknown as AxiosInstance;

    await expect(
      generateSoraVideo({
        apiKey: 'azure-key',
        apiVersion: 'preview',
        baseURL: 'https://example.openai.azure.com/openai/v1',
        model: 'sora',
        input: { prompt: 'test' },
        client,
        timeoutMs: 5,
      }),
    ).rejects.toThrow('Sora video generation timed out');

    expect(client.get).not.toHaveBeenCalled();
  });

  it('sets an Axios download limit and rejects oversized responses from injected clients', async () => {
    const post = jest.fn().mockResolvedValue({
      data: { id: 'job-1', status: 'succeeded', generations: [{ id: 'generation-1' }] },
    });
    const get = jest.fn().mockResolvedValue({ data: Uint8Array.from([1, 2, 3, 4]).buffer });
    const client = { post, get } as unknown as AxiosInstance;

    await expect(
      generateSoraVideo({
        apiKey: 'azure-key',
        apiVersion: 'preview',
        baseURL: 'https://example.openai.azure.com/openai/v1',
        model: 'sora',
        input: { prompt: 'test' },
        client,
        maxVideoBytes: 3,
      }),
    ).rejects.toThrow('size limit');

    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('/content/video'),
      expect.objectContaining({ maxContentLength: 3, maxBodyLength: 3 }),
    );
  });

  it('rejects downloaded content that is not an MP4 container', async () => {
    const client = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'job-1', status: 'succeeded', generations: [{ id: 'generation-1' }] },
      }),
      get: jest.fn().mockResolvedValue({ data: Buffer.from('<html>not a video</html>') }),
    } as unknown as AxiosInstance;

    await expect(
      generateSoraVideo({
        apiKey: 'azure-key',
        apiVersion: 'preview',
        baseURL: 'https://example.openai.azure.com/openai/v1',
        model: 'sora',
        input: { prompt: 'test' },
        client,
      }),
    ).rejects.toThrow('not a valid MP4');
  });
});

describe('createSoraVideoTool', () => {
  const mockedCreateAxiosInstance = createAxiosInstance as jest.MockedFunction<
    typeof createAxiosInstance
  >;
  const previousBaseURL = process.env.VIDEO_GEN_OAI_BASEURL;

  beforeEach(() => {
    process.env.VIDEO_GEN_OAI_BASEURL = 'https://example.openai.azure.com/openai/v1';
    mockedCreateAxiosInstance.mockReset();
  });

  afterAll(() => {
    if (previousBaseURL == null) {
      delete process.env.VIDEO_GEN_OAI_BASEURL;
    } else {
      process.env.VIDEO_GEN_OAI_BASEURL = previousBaseURL;
    }
  });

  it('returns a video artifact for a successful tool call', async () => {
    const client = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'job-1', status: 'succeeded', generations: [{ id: 'generation-1' }] },
      }),
      get: jest.fn().mockResolvedValue({ data: mp4 }),
    } as unknown as AxiosInstance;
    mockedCreateAxiosInstance.mockReturnValue(client);
    const videoTool = createSoraVideoTool({ VIDEO_GEN_OAI_API_KEY: 'azure-key', isAgent: true });

    const result = await videoTool.invoke({
      name: 'video_gen_oai',
      args: { prompt: 'A paper airplane' },
      id: 'tool-call-1',
      type: 'tool_call',
    });

    expect(result.content).toContain('generated_video_id');
    expect(result.artifact).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            type: 'video_url',
            video_url: { url: `data:video/mp4;base64,${mp4.toString('base64')}` },
          }),
        ],
      }),
    );
  });

  it('returns the renderer error prefix and no artifact on provider failure', async () => {
    const client = {
      post: jest.fn().mockRejectedValue(new Error('provider unavailable')),
      get: jest.fn(),
    } as unknown as AxiosInstance;
    mockedCreateAxiosInstance.mockReturnValue(client);
    const videoTool = createSoraVideoTool({ VIDEO_GEN_OAI_API_KEY: 'azure-key', isAgent: true });

    const result = await videoTool.invoke({
      name: 'video_gen_oai',
      args: { prompt: 'A paper airplane' },
      id: 'tool-call-2',
      type: 'tool_call',
    });

    expect(result.content).toBe(
      'Error: tool call failed: Video generation failed: provider unavailable',
    );
    expect(result.artifact).toEqual({});
  });
});
