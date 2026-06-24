import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods } from '@librechat/data-schemas';
import { submitGeneration, resolveResult } from './service';
import type { ImageDeps } from './service';

jest.mock('./client');

import { submitPrediction, getPrediction } from './client';

const mockSubmitPrediction = submitPrediction as jest.MockedFunction<typeof submitPrediction>;
const mockGetPrediction = getPrediction as jest.MockedFunction<typeof getPrediction>;

const cfg = { baseUrl: 'http://localhost', apiKey: 'test-key' };

let mongoServer: MongoMemoryServer;

function buildDeps(): ImageDeps {
  const methods = createMethods(mongoose);
  const fetchImage = jest.fn();
  const saveImageFile = jest.fn();
  return {
    fetchImage,
    saveImageFile,
    createFileRecord: (doc) =>
      methods.createFile(doc as Parameters<typeof methods.createFile>[0], true) as ReturnType<
        ImageDeps['createFileRecord']
      >,
    findFileByPrediction: async (userId, predictionId) => {
      const files = await methods.getFiles(
        { user: userId, 'metadata.imageGen.predictionId': predictionId },
        {},
        {},
      );
      return files && files.length > 0 ? files[0] : null;
    },
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  for (const modelName of Object.keys(mongoose.models)) {
    await mongoose.models[modelName].ensureIndexes();
  }
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// submitGeneration
// ---------------------------------------------------------------------------

describe('submitGeneration', () => {
  test('unknown model throws', async () => {
    await expect(
      submitGeneration({ model: 'bad-model', prompt: 'hi', aspectRatio: '1:1' }, cfg),
    ).rejects.toThrow('Unknown image model: bad-model');
  });

  test('empty prompt throws', async () => {
    await expect(
      submitGeneration(
        { model: 'gemini-3-pro-image-preview', prompt: '  ', aspectRatio: '1:1' },
        cfg,
      ),
    ).rejects.toThrow('prompt is required');
  });

  test('invalid aspect ratio throws', async () => {
    await expect(
      submitGeneration(
        { model: 'gemini-3-pro-image-preview', prompt: 'a cat', aspectRatio: 'bad-ratio' },
        cfg,
      ),
    ).rejects.toThrow('invalid aspect_ratio: bad-ratio');
  });

  test('gpt-image-2 with 4K + 1:1 throws', async () => {
    await expect(
      submitGeneration(
        { model: 'gpt-image-2', prompt: 'a cat', aspectRatio: '1:1', param: '4K' },
        cfg,
      ),
    ).rejects.toThrow('1:1 cannot be 4K');
  });

  test('supportsEdit model passes imageUrls to submitPrediction', async () => {
    mockSubmitPrediction.mockResolvedValueOnce('pred-123');
    const result = await submitGeneration(
      {
        model: 'gemini-3-pro-image-preview',
        prompt: 'a cat',
        aspectRatio: '1:1',
        imageUrls: ['http://img.example.com/1.png'],
      },
      cfg,
    );
    expect(result.predictionId).toBe('pred-123');
    expect(mockSubmitPrediction).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: ['http://img.example.com/1.png'] }),
      cfg,
    );
  });

  test('returns { predictionId } on success', async () => {
    mockSubmitPrediction.mockResolvedValueOnce('pred-abc');
    const result = await submitGeneration(
      { model: 'gemini-3-pro-image-preview', prompt: 'a cat', aspectRatio: '1:1' },
      cfg,
    );
    expect(result).toEqual({ predictionId: 'pred-abc' });
  });
});

// ---------------------------------------------------------------------------
// resolveResult
// ---------------------------------------------------------------------------

describe('resolveResult', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const predictionId = 'pred-resolve-001';

  test('processing status returns { status: "processing" } with no File created', async () => {
    mockGetPrediction.mockResolvedValueOnce({ status: 'processing', outputs: [], error: null });
    const deps = buildDeps();
    const result = await resolveResult(
      { predictionId, userId, model: 'gemini-3-pro-image-preview', prompt: 'a cat' },
      deps,
      cfg,
    );
    expect(result).toEqual({ status: 'processing' });
    expect(deps.fetchImage).not.toHaveBeenCalled();
  });

  test('completed status downloads image and creates File with correct fields', async () => {
    mockGetPrediction.mockResolvedValueOnce({
      status: 'completed',
      outputs: ['http://result.example.com/out.png'],
      error: null,
    });
    const deps = buildDeps();
    (deps.fetchImage as jest.Mock).mockResolvedValueOnce({
      buffer: Buffer.from('fake-image'),
      contentType: 'image/png',
      width: 1024,
      height: 1024,
    });
    (deps.saveImageFile as jest.Mock).mockResolvedValueOnce({
      filepath: '/storage/out.png',
      source: 'r2',
      bytes: 10,
      filename: 'out.png',
      storageMetadata: { storageKey: 'gen/out.png', storageRegion: 'auto' },
    });

    const result = await resolveResult(
      { predictionId, userId, model: 'gemini-3-pro-image-preview', prompt: 'a cat' },
      deps,
      cfg,
    );

    expect(result.status).toBe('completed');
    expect(result.file).toBeDefined();
    expect(result.file!.context).toBe('image_generation');
    expect(result.file!.model).toBe('gemini-3-pro-image-preview');
    expect(result.file!.metadata?.imageGen?.prompt).toBe('a cat');
    expect(result.file!.metadata?.imageGen?.predictionId).toBe(predictionId);
    expect(deps.fetchImage).toHaveBeenCalledWith('http://result.example.com/out.png');
    expect(deps.saveImageFile).toHaveBeenCalledWith(expect.objectContaining({ userId }));
  });

  test('failed status throws', async () => {
    mockGetPrediction.mockResolvedValueOnce({
      status: 'failed',
      outputs: [],
      error: 'out of memory',
    });
    const deps = buildDeps();
    await expect(
      resolveResult(
        { predictionId: 'pred-fail', userId, model: 'gemini-3-pro-image-preview', prompt: 'x' },
        deps,
        cfg,
      ),
    ).rejects.toThrow('out of memory');
  });

  test('idempotent: second call with same predictionId returns existing File without duplicate', async () => {
    mockGetPrediction.mockResolvedValueOnce({
      status: 'completed',
      outputs: ['http://result.example.com/out.png'],
      error: null,
    });
    const deps = buildDeps();
    (deps.fetchImage as jest.Mock).mockResolvedValueOnce({
      buffer: Buffer.from('fake-image'),
      contentType: 'image/png',
      width: 512,
      height: 512,
    });
    (deps.saveImageFile as jest.Mock).mockResolvedValueOnce({
      filepath: '/storage/idem.png',
      source: 'r2',
      bytes: 5,
      filename: 'idem.png',
      storageMetadata: {},
    });

    const pidIdem = 'pred-idempotent-001';
    const first = await resolveResult(
      { predictionId: pidIdem, userId, model: 'gemini-3-pro-image-preview', prompt: 'dog' },
      deps,
      cfg,
    );
    expect(first.status).toBe('completed');

    // second call — mock should NOT be called again; returns existing record
    const second = await resolveResult(
      { predictionId: pidIdem, userId, model: 'gemini-3-pro-image-preview', prompt: 'dog' },
      deps,
      cfg,
    );
    expect(second.status).toBe('completed');
    expect(mockGetPrediction).toHaveBeenCalledTimes(1);
    expect(deps.fetchImage).toHaveBeenCalledTimes(1);

    // Verify only one File record exists in DB
    const methods = createMethods(mongoose);
    const files = await methods.getFiles({ 'metadata.imageGen.predictionId': pidIdem }, {}, {});
    expect(files?.length).toBe(1);
  });
});
