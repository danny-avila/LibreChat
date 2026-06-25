const mockGetAzureContainerClient = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: (...args) => mockGetAzureContainerClient(...args),
  deleteRagFile: jest.fn(),
}));

describe('getAzureFileStream', () => {
  const ACCOUNT_URL = 'https://testaccount.blob.core.windows.net';
  let getAzureFileStream;
  let download;
  let getBlobClient;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.AZURE_CONTAINER_NAME = 'files';

    download = jest.fn().mockResolvedValue({ readableStreamBody: 'stream-body' });
    getBlobClient = jest.fn().mockReturnValue({ download });
    mockGetAzureContainerClient.mockResolvedValue({ getBlobClient });

    ({ getAzureFileStream } = require('../crud'));
  });

  afterEach(() => {
    delete process.env.AZURE_CONTAINER_NAME;
  });

  it('parses the blob path from a fully-qualified URL and downloads via the SDK client', async () => {
    const fileURL = `${ACCOUNT_URL}/files/images/user1/abc.png`;
    const result = await getAzureFileStream({}, fileURL);

    expect(mockGetAzureContainerClient).toHaveBeenCalledWith('files');
    expect(getBlobClient).toHaveBeenCalledWith('images/user1/abc.png');
    expect(download).toHaveBeenCalled();
    expect(result).toBe('stream-body');
  });

  it('parses a bare container/blob path', async () => {
    const result = await getAzureFileStream({}, 'files/images/user1/abc.png');

    expect(getBlobClient).toHaveBeenCalledWith('images/user1/abc.png');
    expect(result).toBe('stream-body');
  });

  it('does not perform an anonymous fetch against the blob URL host', async () => {
    const fileURL = `${ACCOUNT_URL}/files/images/user1/abc.png`;
    await getAzureFileStream({}, fileURL);

    expect(getBlobClient).toHaveBeenCalledTimes(1);
    const requestedPath = getBlobClient.mock.calls[0][0];
    expect(requestedPath).not.toContain('http');
    expect(requestedPath).not.toContain('blob.core.windows.net');
  });

  it('throws when the Azure Blob Service is not initialized', async () => {
    mockGetAzureContainerClient.mockResolvedValue(null);
    await expect(
      getAzureFileStream({}, `${ACCOUNT_URL}/files/images/user1/abc.png`),
    ).rejects.toThrow('Azure Blob Service not initialized');
  });

  it('throws when the blob path cannot be parsed from the URL', async () => {
    await expect(getAzureFileStream({}, 'https://example.com/other/abc.png')).rejects.toThrow(
      'Could not parse blob path from URL',
    );
  });
});
