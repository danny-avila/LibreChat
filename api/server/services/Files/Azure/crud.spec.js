const { getAzureFileStream, getAzureDownloadURL } = require('./crud');
const { getAzureContainerClient, initializeAzureBlobService } = require('@librechat/api');

jest.mock('@librechat/api', () => ({
  deleteRagFile: jest.fn(),
  assertRemoteFileURL: jest.fn((url) => url),
  getAzureContainerClient: jest.fn(),
  initializeAzureBlobService: jest.fn(),
  getRemoteFileFetchMaxBytes: jest.fn(() => 1024),
  getRemoteFileFetchTimeoutMs: jest.fn(() => 1000),
  assertRemoteFileContentLength: jest.fn(),
  sanitizeContentDispositionFilename: jest.fn((name) => name),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('~/models', () => ({ updateUser: jest.fn(), updateFile: jest.fn() }), {
  virtual: true,
});

const BLOB_URL =
  'https://acct.blob.core.windows.net/files/images/507f1f77bcf86cd799439011/a%20file.png';

/** @returns {{ containerClient: object, blobClient: object }} */
function mockContainer(blobClient) {
  const containerClient = {
    containerName: 'files',
    accountName: 'acct',
    getBlobClient: jest.fn(() => blobClient),
  };
  getAzureContainerClient.mockResolvedValue(containerClient);
  return containerClient;
}

describe('getAzureFileStream', () => {
  beforeEach(() => jest.clearAllMocks());

  it('downloads through the authenticated client, so private containers work', async () => {
    const readableStreamBody = { pipe: jest.fn() };
    const blobClient = { download: jest.fn().mockResolvedValue({ readableStreamBody }) };
    const containerClient = mockContainer(blobClient);

    const stream = await getAzureFileStream({}, BLOB_URL);

    expect(stream).toBe(readableStreamBody);
    expect(blobClient.download).toHaveBeenCalled();
    /** container prefix stripped, path decoded */
    expect(containerClient.getBlobClient).toHaveBeenCalledWith(
      'images/507f1f77bcf86cd799439011/a file.png',
    );
  });

  it('accepts a container-relative path', async () => {
    const blobClient = { download: jest.fn().mockResolvedValue({ readableStreamBody: {} }) };
    const containerClient = mockContainer(blobClient);

    await getAzureFileStream({}, '/images/507f1f77bcf86cd799439011/file.png');

    expect(containerClient.getBlobClient).toHaveBeenCalledWith(
      'images/507f1f77bcf86cd799439011/file.png',
    );
  });

  it('throws when the service is not initialized', async () => {
    getAzureContainerClient.mockResolvedValue(null);
    await expect(getAzureFileStream({}, BLOB_URL)).rejects.toThrow(
      'Azure Blob Service not initialized',
    );
  });
});

describe('getAzureDownloadURL', () => {
  beforeEach(() => jest.clearAllMocks());

  it('signs a read-only URL with the account key', async () => {
    const blobClient = {
      url: 'https://acct.blob.core.windows.net/files/images/u/f.png',
      generateSasUrl: jest.fn().mockResolvedValue('https://signed.example/f.png?sig=abc'),
    };
    mockContainer(blobClient);

    const url = await getAzureDownloadURL({
      file: { filepath: BLOB_URL },
      customFilename: 'report.png',
      contentType: 'image/png',
    });

    expect(url).toBe('https://signed.example/f.png?sig=abc');
    const options = blobClient.generateSasUrl.mock.calls[0][0];
    expect(options.permissions.read).toBe(true);
    expect(options.permissions.write).toBeFalsy();
    expect(options.contentDisposition).toBe('attachment; filename="report.png"');
    expect(options.contentType).toBe('image/png');
    /** starts in the past, so host clock drift cannot invalidate the signature */
    expect(options.startsOn.getTime()).toBeLessThan(Date.now());
    expect(options.expiresOn.getTime()).toBeGreaterThan(Date.now());
  });

  it('falls back to a user delegation key when no account key is configured', async () => {
    const blobClient = {
      url: 'https://acct.blob.core.windows.net/files/images/u/f.png',
      generateSasUrl: jest.fn().mockRejectedValue(new Error('Cannot generate SAS')),
    };
    mockContainer(blobClient);
    const getUserDelegationKey = jest.fn().mockResolvedValue({ value: 'delegation-key' });
    initializeAzureBlobService.mockResolvedValue({ getUserDelegationKey });

    const url = await getAzureDownloadURL({ file: { filepath: BLOB_URL } });

    expect(getUserDelegationKey).toHaveBeenCalled();
    expect(url.startsWith(`${blobClient.url}?`)).toBe(true);
  });
});
