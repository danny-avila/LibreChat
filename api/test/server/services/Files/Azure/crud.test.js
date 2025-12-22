require('librechat-data-provider');

jest.mock('@azure/storage-blob', () => ({
  BlobSASPermissions: {
    parse: jest.fn().mockReturnValue({}),
  },
  generateBlobSASQueryParameters: jest.fn().mockReturnValue({
    toString: () => 'sv=2021-06-08&se=2024-01-01T00%3A00%3A00Z&sr=b&sp=r&sig=test',
  }),
  StorageSharedKeyCredential: jest.fn(),
  BlobServiceClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        getBlockBlobClient: jest.fn().mockReturnValue({
          url: 'https://test.blob.core.windows.net/files/images/user123/test.pdf',
        }),
      }),
    }),
  },
}));

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: jest.fn().mockResolvedValue({
    getBlockBlobClient: jest.fn().mockReturnValue({
      url: 'https://test.blob.core.windows.net/files/images/user123/test.pdf',
    }),
  }),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

const { needsRefreshAzure } = require('../../../../../server/services/Files/Azure/crud');

describe('Azure crud.js - URL refresh tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('needsRefreshAzure', () => {
    it('should return false for URLs without SAS token', () => {
      const url = 'https://test.blob.core.windows.net/files/images/user123/test.pdf';
      expect(needsRefreshAzure(url, 3600)).toBe(false);
    });

    it('should return true for expired URLs', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const url = `https://test.blob.core.windows.net/files/test.pdf?se=${encodeURIComponent(pastDate)}&sp=r&sig=test`;
      expect(needsRefreshAzure(url, 3600)).toBe(true);
    });

    it('should return false for URLs that are not close to expiring', () => {
      const futureDate = new Date(Date.now() + 7200000).toISOString();
      const url = `https://test.blob.core.windows.net/files/test.pdf?se=${encodeURIComponent(futureDate)}&sp=r&sig=test`;
      expect(needsRefreshAzure(url, 3600)).toBe(false);
    });

    it('should return true for URLs within buffer time', () => {
      const nearFutureDate = new Date(Date.now() + 1800000).toISOString();
      const url = `https://test.blob.core.windows.net/files/test.pdf?se=${encodeURIComponent(nearFutureDate)}&sp=r&sig=test`;
      expect(needsRefreshAzure(url, 3600)).toBe(true);
    });
  });
});