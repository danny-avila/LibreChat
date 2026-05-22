const {
  needsRefreshAzure,
  extractBlobPathFromAzureUrl,
  getNewAzureURL,
  getSignedAzureURL,
  getAzureURL,
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

    it('extracts blob path from a path-style URL (Azurite emulator)', () => {
      // Azurite serves blobs at <host>/<account>/<container>/<path>, so the
      // legacy "drop the first segment" extraction would have leaked the
      // container name into the blob path. The container-anchored extraction
      // skips both <account> and <container> segments.
      const url = 'http://127.0.0.1:10000/devstoreaccount1/files/images/user123/test.pdf';
      expect(extractBlobPathFromAzureUrl(url)).toBe('images/user123/test.pdf');
    });

    it('extracts using an explicit container name override', () => {
      const url = 'https://test.blob.core.windows.net/my-container/images/u/x.pdf';
      expect(extractBlobPathFromAzureUrl(url, 'my-container')).toBe('images/u/x.pdf');
    });

    it('falls back to legacy extraction when the container segment is absent', () => {
      // For URLs stored under a previous container name (e.g. after renaming
      // AZURE_CONTAINER_NAME), we still return *something* so legacy records
      // can be refreshed — but we log a warning at the call site.
      const url = 'https://test.blob.core.windows.net/old-container/images/u/x.pdf';
      expect(extractBlobPathFromAzureUrl(url)).toBe('images/u/x.pdf');
    });
  });

  describe('getNewAzureURL - path-parts guard', () => {
    it('returns undefined for blob paths shallower than basePath/userId/fileName', async () => {
      // Mirrors S3 getNewS3URL's keyParts.length < 3 guard. A blob path of
      // `images/foo.pdf` is missing the userId segment and shouldn't be re-signed.
      const url = 'https://test.blob.core.windows.net/files/images/foo.pdf';
      const result = await getNewAzureURL(url);
      expect(result).toBeUndefined();
    });
  });

  describe('getAzureURL - signs URL when private (S3 parity)', () => {
    it('returns a SAS URL when AZURE_STORAGE_PUBLIC_ACCESS is not "true"', async () => {
      // Regression guard: getAzureURL is exposed as the strategy's `getFileURL`
      // and its return value is persisted as the file's filepath by processFileURL.
      // S3's getS3URL always signs; Azure must match — previously it returned an
      // unsigned blob URL, which 401'd until the next refresh cycle.
      delete process.env.AZURE_STORAGE_PUBLIC_ACCESS;
      process.env.AZURE_STORAGE_CONNECTION_STRING = FAKE_CONNECTION_STRING;
      const url = await getAzureURL({
        fileName: 'test.pdf',
        basePath: 'images',
        userId: 'user123',
        containerName: 'files',
      });
      const parsed = new URL(url);
      expect(parsed.searchParams.has('sig')).toBe(true);
      expect(parsed.searchParams.get('sp')).toBe('r');
      expect(parsed.searchParams.get('spr')).toBe('https');
    });

    it('returns the plain blob URL when AZURE_STORAGE_PUBLIC_ACCESS=true', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
      const mockBlockBlobClient = {
        url: 'https://test.blob.core.windows.net/files/images/user123/test.pdf',
      };
      const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      };
      getAzureContainerClient.mockResolvedValue(mockContainerClient);

      const url = await getAzureURL({
        fileName: 'test.pdf',
        basePath: 'images',
        userId: 'user123',
      });
      expect(url).toBe(mockBlockBlobClient.url);
      expect(new URL(url).searchParams.has('sig')).toBe(false);
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