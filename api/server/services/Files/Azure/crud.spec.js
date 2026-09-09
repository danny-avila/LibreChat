const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockGetBlockBlobClient = jest.fn(() => ({ download: mockDownload, delete: mockDelete }));
const mockGetAzureContainerClient = jest.fn(async () => ({
  url: 'https://account.blob.core.windows.net/files',
  getBlockBlobClient: mockGetBlockBlobClient,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  deleteRagFile: jest.fn(),
  assertRemoteFileURL: jest.fn((url) => url),
  getAzureContainerClient: (...args) => mockGetAzureContainerClient(...args),
  getRemoteFileFetchMaxBytes: jest.fn(() => 1024),
  getRemoteFileFetchTimeoutMs: jest.fn(() => 1000),
  assertRemoteFileContentLength: jest.fn(),
}));

const { deleteFileFromAzure, getAzureFileStream } = require('./crud');

describe('getAzureFileStream', () => {
  it('downloads private blobs through the authenticated Azure client', async () => {
    const stream = { pipe: jest.fn() };
    mockDownload.mockResolvedValue({ readableStreamBody: stream });

    await expect(
      getAzureFileStream(
        {},
        'https://account.blob.core.windows.net/private-files/uploads/user/report%20one.pdf',
      ),
    ).resolves.toBe(stream);

    expect(mockGetAzureContainerClient).toHaveBeenCalledWith('private-files');
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('uploads/user/report one.pdf');
  });

  it('resolves Azurite blobs relative to the configured account and container path', async () => {
    const stream = { pipe: jest.fn() };
    mockDownload.mockResolvedValue({ readableStreamBody: stream });
    mockGetAzureContainerClient.mockResolvedValueOnce({
      url: 'http://127.0.0.1:10000/devstoreaccount1/files',
      getBlockBlobClient: mockGetBlockBlobClient,
    });

    await expect(
      getAzureFileStream(
        {},
        'http://127.0.0.1:10000/devstoreaccount1/files/uploads/user/report%20one.pdf',
      ),
    ).resolves.toBe(stream);

    expect(mockGetAzureContainerClient).toHaveBeenCalledWith();
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('uploads/user/report one.pdf');
  });
});

describe('deleteFileFromAzure', () => {
  it('removes cache-busting query parameters from the blob key', async () => {
    mockDelete.mockResolvedValue(undefined);

    await deleteFileFromAzure(
      { user: { id: 'user-1' } },
      {
        filepath: 'https://account.blob.core.windows.net/files/uploads/user-1/generated.webp?v=123',
      },
    );

    expect(mockGetBlockBlobClient).toHaveBeenCalledWith('uploads/user-1/generated.webp');
    expect(mockDelete).toHaveBeenCalled();
  });
});
