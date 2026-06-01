import type { BlobServiceClient as TBlobServiceClient } from '@azure/storage-blob';

const mockLogger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: jest.fn(),
}));

jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({ kind: 'default' })),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: mockLogger,
}));

describe('initializeAzureBlobService — Managed Identity endpoint', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    process.env.AZURE_STORAGE_ACCOUNT_NAME = 'testaccount';
    delete process.env.AZURE_STORAGE_BLOB_ENDPOINT;
  });

  afterEach(() => {
    delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    delete process.env.AZURE_STORAGE_BLOB_ENDPOINT;
  });

  async function load() {
    const { BlobServiceClient } = jest.requireMock('@azure/storage-blob') as {
      BlobServiceClient: jest.MockedClass<typeof TBlobServiceClient>;
    };
    const { initializeAzureBlobService } = await import('../azure');
    return { BlobServiceClient, initializeAzureBlobService };
  }

  it('defaults to the public-cloud blob endpoint when no override is set', async () => {
    const { BlobServiceClient, initializeAzureBlobService } = await load();
    await initializeAzureBlobService();
    expect(BlobServiceClient).toHaveBeenCalledWith(
      'https://testaccount.blob.core.windows.net',
      expect.anything(),
    );
  });

  it('honours AZURE_STORAGE_BLOB_ENDPOINT for sovereign cloud / custom domains', async () => {
    process.env.AZURE_STORAGE_BLOB_ENDPOINT = 'https://testaccount.blob.core.usgovcloudapi.net';
    const { BlobServiceClient, initializeAzureBlobService } = await load();
    await initializeAzureBlobService();
    expect(BlobServiceClient).toHaveBeenCalledWith(
      'https://testaccount.blob.core.usgovcloudapi.net',
      expect.anything(),
    );
  });
});
