const mockGetBlockBlobClient = jest.fn();

jest.mock('@librechat/api', () => ({
  deleteRagFile: jest.fn(),
  assertRemoteFileURL: jest.fn((url) => url),
  getAzureContainerClient: jest.fn(async () => ({
    getBlockBlobClient: mockGetBlockBlobClient,
  })),
  getRemoteFileFetchMaxBytes: jest.fn(() => 1024),
  getRemoteFileFetchTimeoutMs: jest.fn(() => 1000),
  assertRemoteFileContentLength: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

process.env.AZURE_CONTAINER_NAME = 'librechat';

const { Readable } = require('stream');
const { getAzureFileStream } = require('../crud');

describe('getAzureFileStream', () => {
  let readableStreamBody;

  beforeEach(() => {
    readableStreamBody = Readable.from(['blob-bytes']);
    mockGetBlockBlobClient.mockReturnValue({
      download: jest.fn(async () => ({ readableStreamBody })),
    });
  });

  test('downloads through the authenticated client instead of fetching the URL', async () => {
    const stream = await getAzureFileStream(
      {},
      'https://account.blob.core.windows.net/librechat/images/user-1/pic.webp',
    );

    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('images/user-1/pic.webp');
    expect(stream).toBe(readableStreamBody);
  });

  test('resolves the blob path when the account name matches the container name', async () => {
    await getAzureFileStream(
      {},
      'https://librechat.blob.core.windows.net/librechat/images/user-1/pic.webp',
    );

    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('images/user-1/pic.webp');
  });

  test('decodes escaped segments and ignores a SAS query string', async () => {
    await getAzureFileStream(
      {},
      'https://account.blob.core.windows.net/librechat/images/user-1/my%20file%20%231.webp?sv=2024-11-04&sig=abc',
    );

    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('images/user-1/my file #1.webp');
  });

  test('throws when the URL carries no blob path under the container', async () => {
    await expect(
      getAzureFileStream({}, 'https://account.blob.core.windows.net/other/images/user-1/pic.webp'),
    ).rejects.toThrow('Blob path could not be derived from the file URL');
    expect(mockGetBlockBlobClient).not.toHaveBeenCalled();
  });
});
