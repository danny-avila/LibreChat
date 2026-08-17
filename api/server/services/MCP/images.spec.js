const mockGetFiles = jest.fn();
const mockEncodeAndFormat = jest.fn();

jest.mock('~/models', () => ({ getFiles: (...args) => mockGetFiles(...args) }));
jest.mock('~/server/services/Files/images/encode', () => ({
  encodeAndFormat: (...args) => mockEncodeAndFormat(...args),
}));

const { resolveUploadedImageArguments } = require('./images');
const { VisionModes } = require('librechat-data-provider');

const mib = 1024 * 1024;

function createRequest(fileSizeLimit) {
  return {
    body: {},
    config:
      fileSizeLimit === undefined
        ? {}
        : { fileConfig: { endpoints: { default: { fileSizeLimit } } } },
  };
}

describe('MCP uploaded-image encoding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncodeAndFormat.mockResolvedValue({
      image_urls: [
        {
          type: 'image_url',
          file_id: 'image',
          image_url: { url: 'data:image/png;base64,aW1hZ2U=', detail: 'auto' },
        },
      ],
    });
  });

  it.each([
    ['with zero-byte metadata', 0, 20, 1],
    ['under the configured limit', 20 * mib, 21, 1],
    ['at the configured limit', 20 * mib, 20, 1],
    ['over the configured limit', 21 * mib, 20, 0],
    ['over the default limit without configuration', 512 * mib + 1, undefined, 0],
    ['with negative byte metadata', -1, 20, 0],
    ['with fractional byte metadata', 1.5, 20, 0],
    [
      'with unsafe integer byte metadata',
      Number.MAX_SAFE_INTEGER + 1,
      Number.MAX_SAFE_INTEGER + 2,
      0,
    ],
    ['without byte metadata', undefined, 20, 0],
    ['with NaN byte metadata', Number.NaN, 20, 0],
    ['with infinite byte metadata', Number.POSITIVE_INFINITY, 20, 0],
  ])('encodes images only when %s', async (_name, bytes, fileSizeLimit, expectedEncodeCalls) => {
    const file = { file_id: 'image', bytes, type: 'image/png' };
    mockGetFiles.mockResolvedValue([file]);
    const request = {
      ...createRequest(fileSizeLimit),
      body: { files: [{ file_id: file.file_id, type: file.type }] },
    };

    const resolution = resolveUploadedImageArguments({
      forwardUploadedImages: true,
      request,
      toolArguments: { source: '/mnt/data/0.png' },
      user: { id: 'user-1' },
    });

    if (expectedEncodeCalls === 1) {
      await expect(resolution).resolves.toEqual({ source: 'data:image/png;base64,aW1hZ2U=' });
    } else {
      await expect(resolution).rejects.toThrow('Unable to resolve referenced uploaded image.');
    }
    expect(mockEncodeAndFormat).toHaveBeenCalledTimes(expectedEncodeCalls);
    if (expectedEncodeCalls === 1) {
      expect(mockEncodeAndFormat).toHaveBeenCalledWith(
        request,
        [file],
        { mcpImageSizeLimit: fileSizeLimit === undefined ? 512 * mib : fileSizeLimit * mib },
        VisionModes.mcp,
      );
    }
  });
});
