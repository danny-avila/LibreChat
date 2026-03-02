const {
  needsRefreshAzure,
  extractBlobPathFromAzureUrl,
  getNewAzureURL,
} = require('../../../../../server/services/Files/Azure/crud');

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: jest.fn(),
  deleteRagFile: jest.fn(),
}));

const { getAzureContainerClient } = require('@librechat/api');

describe('Azure crud.js - URL refresh tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('needsRefreshAzure', () => {
    it('should return false for URLs without SAS token when public access enabled', () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
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

    it('should return true for invalid URLs', () => {
      expect(needsRefreshAzure('not-a-valid-url', 3600)).toBe(true);
    });
  });

  describe('extractBlobPathFromAzureUrl', () => {
    it('should extract blob path from Azure URL', () => {
      const url = 'https://test.blob.core.windows.net/files/images/user123/test.pdf';
      expect(extractBlobPathFromAzureUrl(url)).toBe('images/user123/test.pdf');
    });

    it('should extract blob path from URL with SAS token', () => {
      const url = 'https://test.blob.core.windows.net/files/images/user123/test.pdf?sv=2021&sig=abc';
      expect(extractBlobPathFromAzureUrl(url)).toBe('images/user123/test.pdf');
    });

    it('should return null for URL with only container', () => {
      const url = 'https://test.blob.core.windows.net/files';
      expect(extractBlobPathFromAzureUrl(url)).toBe(null);
    });

    it('should return null for invalid URL', () => {
      expect(extractBlobPathFromAzureUrl('not-a-url')).toBe(null);
    });
  });

  describe('needsRefreshAzure - public to private transition', () => {
    it('should return true for plain URL when private access is required', () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      const plainUrl = 'https://test.blob.core.windows.net/files/images/user123/test.pdf';
      expect(needsRefreshAzure(plainUrl, 3600)).toBe(true);
    });

    it('should return false for plain URL when public access is enabled', () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
      const plainUrl = 'https://test.blob.core.windows.net/files/images/user123/test.pdf';
      expect(needsRefreshAzure(plainUrl, 3600)).toBe(false);
    });
  });

  describe('getNewAzureURL', () => {
    it('should return undefined for a URL with no extractable blob path', async () => {
      const invalidUrl = 'https://test.blob.core.windows.net/files';
      const result = await getNewAzureURL(invalidUrl);
      expect(result).toBeUndefined();
    });

    it('should return a plain blob URL when public access is enabled', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
      const mockBlockBlobClient = { url: 'https://test.blob.core.windows.net/files/images/user123/test.pdf' };
      const mockContainerClient = { getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient) };
      getAzureContainerClient.mockResolvedValue(mockContainerClient);

      const url = 'https://test.blob.core.windows.net/files/images/user123/test.pdf';
      const result = await getNewAzureURL(url);
      expect(result).toBe(mockBlockBlobClient.url);
    });
  });
});