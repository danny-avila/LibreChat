const { Readable } = require('stream');

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/Code/crud', () => ({
  batchUploadCodeEnvFiles: jest.fn(),
}));

const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const {
  primeConversationImages,
  DEFAULT_IMAGE_LIMIT,
} = require('~/server/services/Files/Code/primeImages');

const makeReq = (userId = 'user-1') => ({ user: { id: userId } });

const makeFile = (overrides = {}) => ({
  file_id: 'file-1',
  type: 'image/jpeg',
  filepath: '/uploads/user-1/file-1.jpeg',
  source: 'local',
  metadata: {},
  ...overrides,
});

describe('primeConversationImages', () => {
  let getFiles;
  let updateFile;

  beforeEach(() => {
    jest.clearAllMocks();
    getFiles = jest.fn();
    updateFile = jest.fn().mockResolvedValue({});
    getStrategyFunctions.mockReturnValue({
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from(['bytes'])),
    });
    batchUploadCodeEnvFiles.mockResolvedValue({
      storage_session_id: 'session-abc',
      files: [{ filename: 'file-1.jpeg', fileId: 'code-env-id-1' }],
    });
  });

  it('returns [] without touching the DB when there are no thread files', async () => {
    const result = await primeConversationImages({
      req: makeReq(),
      threadFileIds: [],
      getFiles,
      updateFile,
    });
    expect(result).toEqual([]);
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('returns [] when the request has no user', async () => {
    const result = await primeConversationImages({
      req: {},
      threadFileIds: ['file-1'],
      getFiles,
      updateFile,
    });
    expect(result).toEqual([]);
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('queries only thread images that have no codeEnvRef yet', async () => {
    getFiles.mockResolvedValue([]);
    await primeConversationImages({
      req: makeReq(),
      threadFileIds: ['file-1', 'file-2'],
      getFiles,
      updateFile,
    });
    expect(getFiles).toHaveBeenCalledWith(
      {
        file_id: { $in: ['file-1', 'file-2'] },
        type: { $regex: '^image/' },
        'metadata.codeEnvRef': { $exists: false },
      },
      { createdAt: -1 },
      { text: 0 },
    );
  });

  it('uploads orphan images and persists codeEnvRef in metadata', async () => {
    getFiles.mockResolvedValue([makeFile()]);

    const result = await primeConversationImages({
      req: makeReq(),
      threadFileIds: ['file-1'],
      getFiles,
      updateFile,
    });

    expect(batchUploadCodeEnvFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'user',
        id: 'user-1',
        files: [expect.objectContaining({ filename: 'file-1.jpeg' })],
      }),
    );
    expect(updateFile).toHaveBeenCalledWith({
      file_id: 'file-1',
      metadata: {
        codeEnvRef: {
          kind: 'user',
          id: 'user-1',
          storage_session_id: 'session-abc',
          file_id: 'code-env-id-1',
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].metadata.codeEnvRef.file_id).toBe('code-env-id-1');
  });

  it('caps the number of primed images at the limit', async () => {
    const files = Array.from({ length: DEFAULT_IMAGE_LIMIT + 3 }, (_, i) =>
      makeFile({ file_id: `file-${i}`, filepath: `/uploads/user-1/file-${i}.jpeg` }),
    );
    getFiles.mockResolvedValue(files);
    batchUploadCodeEnvFiles.mockResolvedValue({
      storage_session_id: 'session-abc',
      files: files
        .slice(0, DEFAULT_IMAGE_LIMIT)
        .map((f) => ({ filename: `${f.file_id}.jpeg`, fileId: `env-${f.file_id}` })),
    });

    await primeConversationImages({
      req: makeReq(),
      threadFileIds: files.map((f) => f.file_id),
      getFiles,
      updateFile,
    });

    const uploaded = batchUploadCodeEnvFiles.mock.calls[0][0].files;
    expect(uploaded).toHaveLength(DEFAULT_IMAGE_LIMIT);
  });

  it('skips files whose download stream fails and continues with the rest', async () => {
    getFiles.mockResolvedValue([
      makeFile(),
      makeFile({ file_id: 'file-2', filepath: '/uploads/user-1/file-2.jpeg' }),
    ]);
    const getDownloadStream = jest
      .fn()
      .mockRejectedValueOnce(new Error('stream failed'))
      .mockResolvedValueOnce(Readable.from(['bytes']));
    getStrategyFunctions.mockReturnValue({ getDownloadStream });
    batchUploadCodeEnvFiles.mockResolvedValue({
      storage_session_id: 'session-abc',
      files: [{ filename: 'file-2.jpeg', fileId: 'env-file-2' }],
    });

    const result = await primeConversationImages({
      req: makeReq(),
      threadFileIds: ['file-1', 'file-2'],
      getFiles,
      updateFile,
    });

    expect(batchUploadCodeEnvFiles.mock.calls[0][0].files).toHaveLength(1);
    expect(result).toHaveLength(1);
    expect(result[0].file_id).toBe('file-2');
  });

  it('returns [] and leaves metadata untouched when the batch upload fails', async () => {
    getFiles.mockResolvedValue([makeFile()]);
    batchUploadCodeEnvFiles.mockRejectedValue(new Error('upload failed'));

    const result = await primeConversationImages({
      req: makeReq(),
      threadFileIds: ['file-1'],
      getFiles,
      updateFile,
    });

    expect(result).toEqual([]);
    expect(updateFile).not.toHaveBeenCalled();
  });

  it('does not return a file whose metadata update failed', async () => {
    getFiles.mockResolvedValue([makeFile()]);
    updateFile.mockRejectedValue(new Error('db down'));

    const result = await primeConversationImages({
      req: makeReq(),
      threadFileIds: ['file-1'],
      getFiles,
      updateFile,
    });

    expect(result).toEqual([]);
  });
});
