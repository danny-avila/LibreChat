const { Readable } = require('stream');

const mockRunGuardedEncode = jest.fn((_bytes, task) => task());

jest.mock('axios');
jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(({ message }) => message),
  validateImage: jest.fn().mockResolvedValue({ isValid: true }),
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
const { FileSources, VisionModes } = require('librechat-data-provider');
const { encodeAndFormat } = require('./encode');

const makeReq = () => ({ body: {}, config: {} });

beforeEach(() => {
  jest.clearAllMocks();
  mockRunGuardedEncode.mockImplementation((_bytes, task) => task());
});

describe('encodeAndFormat - request memory guard', () => {
  const mcpImageSizeLimit = 1024 * 1024;

  function createLocalImage({ bytes, metadataBytes }) {
    const file = {
      source: FileSources.local,
      height: 10,
      width: 10,
      type: 'image/png',
      file_id: 'mcp-image',
      filepath: 'local/mcp.png',
      filename: 'mcp.png',
      bytes: metadataBytes,
    };
    const imageContent = Buffer.alloc(bytes, 65).toString('base64');
    mockPrepareImagePayload.mockResolvedValue([file, imageContent]);
    return { file, imageContent };
  }

  it('gates blob-storage byte pulls and returns [file, base64]', async () => {
    mockGetDownloadStream.mockResolvedValue(Readable.from([Buffer.from('blob-image-bytes')]));
    const file = {
      source: FileSources.s3,
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

    const expectedBase64 = Buffer.from('blob-image-bytes').toString('base64');
    expect(result.image_urls).toHaveLength(1);
    expect(result.image_urls[0].image_url.url).toBe(`data:image/png;base64,${expectedBase64}`);
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

  it('returns an image URL with the persisted file identity only for MCP forwarding', async () => {
    const localBase64 = Buffer.from('mcp-image').toString('base64');
    const file = {
      source: FileSources.local,
      height: 10,
      width: 10,
      type: 'image/png',
      file_id: 'mcp-file',
      filepath: 'local/mcp.png',
      filename: 'mcp.png',
      bytes: 555,
    };
    mockPrepareImagePayload.mockResolvedValue([file, localBase64]);

    const result = await encodeAndFormat(makeReq(), [file], {}, VisionModes.mcp);

    expect(result.image_urls).toEqual([
      expect.objectContaining({
        file_id: file.file_id,
        image_url: { url: `data:image/png;base64,${localBase64}`, detail: 'auto' },
      }),
    ]);
  });

  it.each([
    ['zero metadata', 0],
    ['stale-low metadata', 1],
  ])('rejects an actual over-limit local MCP image with %s', async (_name, metadataBytes) => {
    const { file, imageContent } = createLocalImage({
      bytes: mcpImageSizeLimit + 1,
      metadataBytes,
    });

    const result = encodeAndFormat(makeReq(), [file], { mcpImageSizeLimit }, VisionModes.mcp);

    await expect(result).rejects.toThrow('Image validation failed for mcp.png');
    await result.catch((error) => expect(error.message).not.toContain(imageContent));
  });

  it('forwards a local MCP image at the configured actual-byte limit', async () => {
    const { file, imageContent } = createLocalImage({
      bytes: mcpImageSizeLimit,
      metadataBytes: 0,
    });

    const result = await encodeAndFormat(makeReq(), [file], { mcpImageSizeLimit }, VisionModes.mcp);

    expect(result.image_urls).toEqual([
      expect.objectContaining({
        file_id: file.file_id,
        image_url: { url: `data:image/png;base64,${imageContent}`, detail: 'auto' },
      }),
    ]);
  });

  it('forwards an ordinary under-limit local MCP image', async () => {
    const { file, imageContent } = createLocalImage({ bytes: 20, metadataBytes: 1 });

    const result = await encodeAndFormat(makeReq(), [file], { mcpImageSizeLimit }, VisionModes.mcp);

    expect(result.image_urls).toEqual([
      expect.objectContaining({
        file_id: file.file_id,
        image_url: { url: `data:image/png;base64,${imageContent}`, detail: 'auto' },
      }),
    ]);
  });
});
