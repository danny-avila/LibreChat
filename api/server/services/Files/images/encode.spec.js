const mockRunGuardedEncode = jest.fn((_bytes, task) => task());
const mockGetFileStream = jest.fn();

jest.mock('axios');
jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(({ message }) => message),
  validateImage: jest.fn().mockResolvedValue({ isValid: true }),
  getFileStream: (...args) => mockGetFileStream(...args),
  runGuardedEncode: (...args) => mockRunGuardedEncode(...args),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockPrepareImagePayload = jest.fn();
const mockGetDownloadStream = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    prepareImagePayload: mockPrepareImagePayload,
    getDownloadStream: mockGetDownloadStream,
  })),
}));

const axios = require('axios');
const { FileSources } = require('librechat-data-provider');
const { encodeAndFormat } = require('./encode');

const makeReq = () => ({ body: {}, config: {} });

beforeEach(() => {
  jest.clearAllMocks();
  mockRunGuardedEncode.mockImplementation((_bytes, task) => task());
});

describe('encodeAndFormat - request memory guard', () => {
  it.each([FileSources.s3, FileSources.cloudfront, FileSources.azure_blob, FileSources.firebase])(
    'gates %s byte pulls and returns a base64 data URL',
    async (source) => {
      const expectedBase64 = Buffer.from('blob-image-bytes').toString('base64');
      mockGetFileStream.mockResolvedValue({ content: expectedBase64 });
      const file = {
        source,
        height: 10,
        width: 10,
        type: 'image/png',
        file_id: 'f-blob',
        filepath: 'bucket/a.png',
        filename: 'a.png',
        bytes: 4321,
      };

      const result = await encodeAndFormat(makeReq(), [file], { endpoint: 'openai' });

      expect(mockRunGuardedEncode).toHaveBeenCalledTimes(1);
      expect(mockRunGuardedEncode.mock.calls[0][0]).toBe(4321);
      expect(mockGetFileStream).toHaveBeenCalledWith(
        expect.anything(),
        file,
        expect.anything(),
        expect.any(Function),
      );

      expect(result.image_urls).toHaveLength(1);
      expect(result.image_urls[0].image_url.url).toBe(`data:image/png;base64,${expectedBase64}`);
    },
  );

  it('does not fall back to an external URL when blob storage cannot be read', async () => {
    const failure = new Error('An attached file is no longer available');
    mockGetFileStream.mockRejectedValue(failure);
    const file = {
      source: FileSources.s3,
      height: 10,
      width: 10,
      type: 'image/png',
      file_id: 'f-missing',
      filepath: 'https://minio.example.com/bucket/image.png?X-Amz-Signature=secret',
      storageKey: 'images/user/image.png',
      filename: 'image.png',
      bytes: 100,
    };

    await expect(encodeAndFormat(makeReq(), [file], { endpoint: 'openai' })).rejects.toBe(failure);
    expect(mockPrepareImagePayload).not.toHaveBeenCalled();
  });

  it('gates base64Only URL fetches and returns [file, base64]', async () => {
    mockPrepareImagePayload.mockResolvedValue([
      { source: FileSources.vectordb, type: 'image/png' },
      'https://images.example/x.png',
    ]);
    axios.get.mockResolvedValue({ data: Buffer.from('url-image-bytes') });

    const file = {
      source: FileSources.vectordb,
      height: 10,
      width: 10,
      type: 'image/png',
      file_id: 'f-url',
      filepath: 'remote/x.png',
      filename: 'x.png',
      bytes: 9876,
    };

    const result = await encodeAndFormat(makeReq(), [file], { endpoint: 'anthropic' });

    expect(mockRunGuardedEncode).toHaveBeenCalledTimes(1);
    expect(mockRunGuardedEncode.mock.calls[0][0]).toBe(9876);

    const expectedBase64 = Buffer.from('url-image-bytes').toString('base64');
    expect(result.image_urls).toHaveLength(1);
    expect(result.image_urls[0].source.data).toBe(expectedBase64);
  });

  it('does not gate the non-buffering local prepare path', async () => {
    const localBase64 = Buffer.from('local-image').toString('base64');
    mockPrepareImagePayload.mockResolvedValue([
      { source: FileSources.local, type: 'image/png' },
      localBase64,
    ]);

    const file = {
      source: FileSources.local,
      height: 10,
      width: 10,
      type: 'image/png',
      file_id: 'f-local',
      filepath: 'local/p.png',
      filename: 'p.png',
      bytes: 555,
    };

    const result = await encodeAndFormat(makeReq(), [file], { endpoint: 'openai' });

    expect(mockRunGuardedEncode).not.toHaveBeenCalled();
    expect(result.image_urls).toHaveLength(1);
    expect(result.image_urls[0].image_url.url).toBe(`data:image/png;base64,${localBase64}`);
  });
});

describe('encodeAndFormat - image detail', () => {
  const imageFile = () => ({
    source: FileSources.s3,
    height: 10,
    width: 10,
    type: 'image/png',
    file_id: 'f-detail',
    filepath: 'bucket/a.png',
    filename: 'a.png',
    bytes: 128,
  });

  beforeEach(() => {
    mockGetFileStream.mockResolvedValue({
      content: Buffer.from('image-bytes').toString('base64'),
    });
  });

  it('falls back to auto when no detail is configured anywhere', async () => {
    const result = await encodeAndFormat(makeReq(), [imageFile()], { endpoint: 'openai' });

    expect(result.image_urls[0].image_url.detail).toBe('auto');
  });

  it('uses the conversation-level detail from the request body', async () => {
    const req = makeReq();
    req.body.imageDetail = 'low';

    const result = await encodeAndFormat(req, [imageFile()], { endpoint: 'openai' });

    expect(result.image_urls[0].image_url.detail).toBe('low');
  });

  it('uses the detail resolved by the caller on routes with no body setting', async () => {
    const result = await encodeAndFormat(makeReq(), [imageFile()], {
      endpoint: 'agents',
      imageDetail: 'high',
    });

    expect(result.image_urls[0].image_url.detail).toBe('high');
  });

  it('prefers the caller-resolved detail over the request body', async () => {
    const req = makeReq();
    req.body.imageDetail = 'low';

    const result = await encodeAndFormat(req, [imageFile()], {
      endpoint: 'agents',
      imageDetail: 'high',
    });

    expect(result.image_urls[0].image_url.detail).toBe('high');
  });
});
