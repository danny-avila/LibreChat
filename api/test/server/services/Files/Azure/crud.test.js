const {
  needsRefreshAzure,
  extractBlobPathFromAzureUrl,
  getNewAzureURL,
  getSignedAzureURL,
} = require('../../../../../server/services/Files/Azure/crud');

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: jest.fn(),
  deleteRagFile: jest.fn(),
}));

const { getAzureContainerClient } = require('@librechat/api');

// A syntactically-valid connection string accepted by BlobServiceClient.fromConnectionString.
// AccountKey is the base64-encoding of 32 zero bytes, which is the minimum valid shape
// for StorageSharedKeyCredential. No real account is contacted by these tests.
const FAKE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=https;' +
  'AccountName=testaccount;' +
  'AccountKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;' +
  'EndpointSuffix=core.windows.net';

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

  describe('getSignedAzureURL - configuration errors', () => {
    it('throws when neither AZURE_STORAGE_CONNECTION_STRING nor AZURE_STORAGE_ACCOUNT_NAME is set', async () => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
      delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
      await expect(getSignedAzureURL({ blobPath: 'images/u/test.pdf' })).rejects.toThrow(
        /Azure storage not configured/,
      );
    });

    it('throws (not silently returns unsigned URL) when AccountName/AccountKey cannot be parsed', async () => {
      // In normal operation, BlobServiceClient.fromConnectionString already rejects
      // any connection string lacking AccountName/AccountKey before our regex runs.
      // The regex check is defense-in-depth against a future SDK regression. To
      // exercise that branch directly we stub fromConnectionString so our regex
      // is the gating check. The invariant under test: this path MUST throw, never
      // return blockBlobClient.url (the prior behavior was a silent unsigned-URL leak).
      const storageBlob = require('@azure/storage-blob');
      const spy = jest.spyOn(storageBlob.BlobServiceClient, 'fromConnectionString').mockReturnValue({
        getContainerClient: () => ({
          getBlockBlobClient: () => ({
            url: 'https://test.blob.core.windows.net/files/images/u/test.pdf',
          }),
        }),
      });
      try {
        process.env.AZURE_STORAGE_CONNECTION_STRING =
          'DefaultEndpointsProtocol=https;BlobEndpoint=https://test.blob.core.windows.net;';
        delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
        await expect(getSignedAzureURL({ blobPath: 'images/u/test.pdf' })).rejects.toThrow(
          /missing AccountName or AccountKey/,
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('getSignedAzureURL - SAS token contents', () => {
    beforeEach(() => {
      process.env.AZURE_STORAGE_CONNECTION_STRING = FAKE_CONNECTION_STRING;
      delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    });

    it('produces a SAS URL pinned to https (spr=https)', async () => {
      const signed = await getSignedAzureURL({
        blobPath: 'images/u/test.pdf',
        containerName: 'files',
      });
      const url = new URL(signed);
      // SAS "Protocol" param is `spr`. We require https-only — no `https,http`.
      expect(url.searchParams.get('spr')).toBe('https');
    });

    it('produces a read-only SAS (sp=r)', async () => {
      const signed = await getSignedAzureURL({
        blobPath: 'images/u/test.pdf',
        containerName: 'files',
      });
      expect(new URL(signed).searchParams.get('sp')).toBe('r');
    });

    it('uses the 300s default expiry when AZURE_URL_EXPIRY_SECONDS is unset', async () => {
      // crud.js reads AZURE_URL_EXPIRY_SECONDS at module load. Re-require the module
      // in an isolated registry with the env var cleared so we exercise the default.
      delete process.env.AZURE_URL_EXPIRY_SECONDS;
      let signed;
      const before = Date.now();
      await jest.isolateModulesAsync(async () => {
        const fresh = require('../../../../../server/services/Files/Azure/crud');
        signed = await fresh.getSignedAzureURL({
          blobPath: 'images/u/test.pdf',
          containerName: 'files',
        });
      });
      const after = Date.now();
      const url = new URL(signed);
      const expiresAt = new Date(url.searchParams.get('se')).getTime();
      const startsAt = new Date(url.searchParams.get('st')).getTime();
      // Allow ±2s slack vs. the 300-second target.
      expect(expiresAt - startsAt).toBeGreaterThanOrEqual(298_000);
      expect(expiresAt - startsAt).toBeLessThanOrEqual(302_000);
      // And `se` should be roughly 300s after "now".
      expect(expiresAt - before).toBeGreaterThanOrEqual(298_000);
      expect(expiresAt - after).toBeLessThanOrEqual(302_000);
    });
  });
});