const express = require('express');
const request = require('supertest');

// --- mock @librechat/api image functions ---
const mockSubmitGeneration = jest.fn();
const mockResolveResult = jest.fn();
const mockGetStorageMetadata = jest.fn(() => ({}));

jest.mock('@librechat/api', () => ({
  submitGeneration: (...args) => mockSubmitGeneration(...args),
  resolveResult: (...args) => mockResolveResult(...args),
  IMAGE_MODELS: [{ id: 'flux-1.1-ultra', label: 'Flux 1.1 Ultra' }],
  DEFAULT_IMAGE_MODEL_ID: 'flux-1.1-ultra',
  ASPECT_RATIOS: ['1:1', '16:9', '9:16', '4:3'],
  getStorageMetadata: (...args) => mockGetStorageMetadata(...args),
}));

// --- mock auth middleware (bypass JWT) ---
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => next(),
}));

// --- mock file strategies ---
const mockSaveBuffer = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({ saveBuffer: mockSaveBuffer })),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn(() => 'local'),
}));

// --- mock app config ---
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(async () => ({ fileStrategy: 'local' })),
}));

// --- mock db ---
const mockCreateFile = jest.fn();
const mockGetFiles = jest.fn();
jest.mock('~/models', () => ({
  createFile: (...args) => mockCreateFile(...args),
  getFiles: (...args) => mockGetFiles(...args),
}));

// --- mock cache ---
const mockCacheSet = jest.fn(async () => true);
const mockCacheGet = jest.fn(async () => null);
const mockCacheDelete = jest.fn(async () => true);
jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    set: mockCacheSet,
    get: mockCacheGet,
    delete: mockCacheDelete,
  })),
}));

const imagesRouter = require('../images');

function createApp(user = { id: 'user-1', role: 'USER' }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/images', imagesRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStorageMetadata.mockReturnValue({});
});

describe('GET /api/images/models', () => {
  it('returns model list, default, and aspect ratios', async () => {
    const app = createApp();
    const res = await request(app).get('/api/images/models');

    expect(res.status).toBe(200);
    expect(res.body.models).toEqual([{ id: 'flux-1.1-ultra', label: 'Flux 1.1 Ultra' }]);
    expect(res.body.default).toBe('flux-1.1-ultra');
    expect(res.body.aspectRatios).toEqual(['1:1', '16:9', '9:16', '4:3']);
  });
});

describe('POST /api/images/generate', () => {
  it('calls submitGeneration and caches ctx, returns predictionId', async () => {
    mockSubmitGeneration.mockResolvedValue({ predictionId: 'pred-abc' });

    const app = createApp();
    const res = await request(app)
      .post('/api/images/generate')
      .send({ prompt: 'a sunset', model: 'flux-1.1-ultra', aspectRatio: '16:9' });

    expect(res.status).toBe(200);
    expect(res.body.predictionId).toBe('pred-abc');

    expect(mockSubmitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'a sunset', model: 'flux-1.1-ultra', aspectRatio: '16:9' }),
      expect.objectContaining({ baseUrl: expect.any(String) }),
    );

    expect(mockCacheSet).toHaveBeenCalledWith(
      'pred-abc',
      expect.objectContaining({ userId: 'user-1', model: 'flux-1.1-ultra', prompt: 'a sunset' }),
      expect.any(Number),
    );
  });

  it('uses default model and 1:1 when not provided', async () => {
    mockSubmitGeneration.mockResolvedValue({ predictionId: 'pred-def' });

    const app = createApp();
    const res = await request(app)
      .post('/api/images/generate')
      .send({ prompt: 'mountains' });

    expect(res.status).toBe(200);
    expect(mockSubmitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'flux-1.1-ultra', aspectRatio: '1:1' }),
      expect.anything(),
    );
  });

  it('returns 400 when submitGeneration throws', async () => {
    mockSubmitGeneration.mockRejectedValue(new Error('prompt is required'));

    const app = createApp();
    const res = await request(app)
      .post('/api/images/generate')
      .send({ model: 'flux-1.1-ultra' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('prompt is required');
  });
});

describe('GET /api/images/result/:predictionId', () => {
  it('returns resolveResult output and deletes cache on completed', async () => {
    const fileRecord = { _id: 'file-1', filepath: '/images/test.png', context: 'image_generation' };
    mockCacheGet.mockResolvedValue({ userId: 'user-1', model: 'flux-1.1-ultra', prompt: 'a sunset' });
    mockResolveResult.mockResolvedValue({ status: 'completed', file: fileRecord });

    const app = createApp();
    const res = await request(app).get('/api/images/result/pred-abc');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.file).toBeDefined();

    expect(mockResolveResult).toHaveBeenCalledWith(
      expect.objectContaining({ predictionId: 'pred-abc', userId: 'user-1' }),
      expect.objectContaining({ fetchImage: expect.any(Function), saveImageFile: expect.any(Function) }),
      expect.objectContaining({ baseUrl: expect.any(String) }),
    );

    expect(mockCacheDelete).toHaveBeenCalledWith('pred-abc');
  });

  it('does NOT delete cache when status is still processing', async () => {
    mockCacheGet.mockResolvedValue({ userId: 'user-1', model: 'flux-1.1-ultra', prompt: 'test' });
    mockResolveResult.mockResolvedValue({ status: 'processing' });

    const app = createApp();
    const res = await request(app).get('/api/images/result/pred-xyz');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processing');
    expect(mockCacheDelete).not.toHaveBeenCalled();
  });

  it('returns 502 when resolveResult throws', async () => {
    mockCacheGet.mockResolvedValue({});
    mockResolveResult.mockRejectedValue(new Error('image generation failed'));

    const app = createApp();
    const res = await request(app).get('/api/images/result/pred-bad');

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('failed');
    expect(res.body.message).toBe('image generation failed');
  });

  it('uses fallback model/prompt when ctx is missing from cache', async () => {
    mockCacheGet.mockResolvedValue(null);
    mockResolveResult.mockResolvedValue({ status: 'processing' });

    const app = createApp();
    await request(app).get('/api/images/result/pred-nocache');

    expect(mockResolveResult).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'unknown', prompt: '' }),
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('GET /api/images/', () => {
  it('paginates files by context=image_generation and user', async () => {
    const files = [
      { _id: 'f1', context: 'image_generation', createdAt: new Date('2025-01-02T00:00:00Z') },
      { _id: 'f2', context: 'image_generation', createdAt: new Date('2025-01-01T00:00:00Z') },
    ];
    mockGetFiles.mockResolvedValue(files);

    const app = createApp();
    const res = await request(app).get('/api/images/');

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
    expect(mockGetFiles).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user-1', context: 'image_generation' }),
      { createdAt: -1 },
      null,
    );
  });

  it('applies cursor filter when cursor query param provided', async () => {
    mockGetFiles.mockResolvedValue([]);

    const app = createApp();
    const cursor = '2025-06-01T00:00:00.000Z';
    await request(app).get(`/api/images/?cursor=${cursor}`);

    const call = mockGetFiles.mock.calls[0][0];
    expect(call).toMatchObject({ user: 'user-1', context: 'image_generation' });
    expect(call.createdAt).toBeDefined();
    expect(call.createdAt.$lt).toEqual(new Date(cursor));
  });

  it('caps limit at 100', async () => {
    const files = Array.from({ length: 100 }, (_, i) => ({
      _id: `f${i}`,
      context: 'image_generation',
      createdAt: new Date(Date.now() - i * 1000),
    }));
    mockGetFiles.mockResolvedValue(files);

    const app = createApp();
    const res = await request(app).get('/api/images/?limit=200');

    expect(res.status).toBe(200);
    expect(res.body.images).toHaveLength(100);
    expect(res.body.nextCursor).not.toBeNull();
  });
});
