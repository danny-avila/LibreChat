import type { ImageGenConfig, SubmitArgs, PredictionResult } from './client';
import { getImageModel } from './models';

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('~/utils/axios', () => ({
  createAxiosInstance: () => ({ post: mockPost, get: mockGet }),
  logAxiosError: ({ message }: { message: string }) => message,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { submitPrediction, getPrediction } = require('./client') as {
  submitPrediction: (args: SubmitArgs, cfg: ImageGenConfig) => Promise<string>;
  getPrediction: (id: string, cfg: ImageGenConfig) => Promise<PredictionResult>;
};

const cfg: ImageGenConfig = { baseUrl: 'https://api.gptsapi.net', apiKey: 'test-key' };

describe('submitPrediction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('text-to-image: hits correct URL with prompt/aspect_ratio/output_format', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'pred-123' } } });
    const model = getImageModel('gemini-3-pro-image-preview');
    const id = await submitPrediction(
      { model, prompt: 'a cat', aspectRatio: '1:1', paramValue: 'png' },
      cfg,
    );
    expect(id).toBe('pred-123');
    expect(mockPost).toHaveBeenCalledTimes(1);
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe(
      'https://api.gptsapi.net/api/v3/google/gemini-3-pro-image-preview/text-to-image',
    );
    expect(body).toEqual({ prompt: 'a cat', aspect_ratio: '1:1', output_format: 'png' });
  });

  test('image-edit (google): hits image-edit URL and sets images key', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'pred-456' } } });
    const model = getImageModel('gemini-3-pro-image-preview');
    const id = await submitPrediction(
      {
        model,
        prompt: 'add a hat',
        aspectRatio: '16:9',
        paramValue: 'jpeg',
        imageUrls: ['https://example.com/img.jpg'],
      },
      cfg,
    );
    expect(id).toBe('pred-456');
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe('https://api.gptsapi.net/api/v3/google/gemini-3-pro-image-preview/image-edit');
    expect(body).toMatchObject({ images: ['https://example.com/img.jpg'] });
  });

  test('image-edit (openai): sets input_urls key', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'pred-789' } } });
    const model = getImageModel('gpt-image-2');
    await submitPrediction(
      {
        model,
        prompt: 'change background',
        aspectRatio: '1:1',
        paramValue: '1K',
        imageUrls: ['https://example.com/photo.png'],
      },
      cfg,
    );
    const [, body] = mockPost.mock.calls[0];
    expect(body).toMatchObject({ input_urls: ['https://example.com/photo.png'] });
    expect(body).not.toHaveProperty('images');
  });

  test('throws when response has no id', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    const model = getImageModel('gemini-3-pro-image-preview');
    await expect(
      submitPrediction({ model, prompt: 'x', aspectRatio: 'auto', paramValue: 'png' }, cfg),
    ).rejects.toThrow('gptsapi image submit failed');
  });
});

describe('getPrediction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('maps data.data to PredictionResult', async () => {
    mockGet.mockResolvedValue({
      data: { data: { status: 'succeeded', outputs: ['https://img.url/1.png'], error: null } },
    });
    const result = await getPrediction('pred-123', cfg);
    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url] = mockGet.mock.calls[0];
    expect(url).toBe('https://api.gptsapi.net/api/v3/predictions/pred-123/result');
    expect(result).toEqual({
      status: 'succeeded',
      outputs: ['https://img.url/1.png'],
      error: null,
    });
  });

  test('returns defaults when data.data is missing fields', async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    const result = await getPrediction('pred-empty', cfg);
    expect(result).toEqual({ status: 'unknown', outputs: [], error: null });
  });

  test('throws on get error', async () => {
    mockGet.mockRejectedValue(new Error('network fail'));
    await expect(getPrediction('pred-err', cfg)).rejects.toThrow('gptsapi image poll failed');
  });
});
