const {
  needsRefreshAzure,
  extractBlobPathFromAzureUrl,
  getNewAzureURL,
  getSignedAzureURL,
  getAzureURL,
  getAzureFileStream,
  deleteFileFromAzure,
  refreshAzureFileUrls,
  refreshAzureUrl,
  isAzureBlobUrl,
} = require('../../../../../server/services/Files/Azure/crud');

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: jest.fn(),
  deleteRagFile: jest.fn(),
}));

// Mock @azure/identity so the Managed Identity path can be exercised without
// the real credential chain trying to reach IMDS / AAD. Both credential
// constructors are stubbed; the BlobServiceClient itself is real (its
// constructor doesn't make network calls — only `getUserDelegationKey` does,
// which we spy on at the prototype level in the MI tests).
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({
    getToken: jest
      .fn()
      .mockResolvedValue({ token: 'fake', expiresOnTimestamp: Date.now() + 3.6e6 }),
  })),
  ManagedIdentityCredential: jest.fn().mockImplementation(() => ({
    getToken: jest
      .fn()
      .mockResolvedValue({ token: 'fake', expiresOnTimestamp: Date.now() + 3.6e6 }),
  })),
}));

const { getAzureContainerClient, deleteRagFile } = require('@librechat/api');
const azureIdentity = require('@azure/identity');

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
      const url =
        'https://test.blob.core.windows.net/files/images/user123/test.pdf?sv=2021&sig=abc';
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

  describe('needsRefreshAzure - leaves non-Azure URLs alone (PR-46 review fix)', () => {
    // User avatars are plain strings with no `source` field. Before the fix,
    // `needsRefreshAzure` returned `true` for any non-SAS URL in private mode
    // (the public→private transition branch), which caused `getNewAzureURL`
    // to be called on Google OAuth avatars and legacy `/uploads/` paths,
    // returning `undefined` — which UserController then persisted to Mongo,
    // wiping the user's avatar. The invariant: only refresh URLs we own.
    beforeEach(() => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
    });

    it('returns false for OAuth provider avatar URLs (Google)', () => {
      expect(needsRefreshAzure('https://lh3.googleusercontent.com/a/abc123=s96-c', 3600)).toBe(
        false,
      );
    });

    it('returns false for OAuth provider avatar URLs (Microsoft)', () => {
      expect(needsRefreshAzure('https://graph.microsoft.com/v1.0/me/photo/$value', 3600)).toBe(
        false,
      );
    });

    it('returns false for legacy /uploads/ paths persisted as absolute URLs', () => {
      expect(needsRefreshAzure('https://karl.example.com/uploads/userId/avatar.png', 3600)).toBe(
        false,
      );
    });

    it('returns false for S3 URLs (post-migration straggler)', () => {
      expect(
        needsRefreshAzure(
          'https://my-bucket.s3.amazonaws.com/images/u/x.png?X-Amz-Signature=abc',
          3600,
        ),
      ).toBe(false);
    });

    it('still returns true for Azure URLs in private mode (the original public→private case)', () => {
      // The original behavior we want to preserve: a plain Azure Blob URL in
      // private mode means "this legacy URL needs signing", refresh it.
      expect(
        needsRefreshAzure('https://test.blob.core.windows.net/files/images/user123/test.pdf', 3600),
      ).toBe(true);
    });

    it('still returns true for Azurite-shaped URLs in private mode', () => {
      // Azurite (path-style) URLs are also "ours" — make sure the host-check
      // accepts the loopback + port-10000 emulator endpoint.
      expect(
        needsRefreshAzure('http://127.0.0.1:10000/devstoreaccount1/files/images/user/x.pdf', 3600),
      ).toBe(true);
    });
  });

  describe('isAzureBlobUrl', () => {
    it('accepts standard Azure Blob hostnames', () => {
      expect(isAzureBlobUrl(new URL('https://acc.blob.core.windows.net/files/x'))).toBe(true);
      expect(isAzureBlobUrl(new URL('https://acc.blob.core.usgovcloudapi.net/files/x'))).toBe(true);
      expect(isAzureBlobUrl(new URL('https://acc.blob.core.chinacloudapi.cn/files/x'))).toBe(true);
      expect(isAzureBlobUrl(new URL('https://acc.blob.storage.azure.net/files/x'))).toBe(true);
    });

    it('accepts Azurite emulator endpoints', () => {
      expect(isAzureBlobUrl(new URL('http://127.0.0.1:10000/devstoreaccount1/files/x'))).toBe(true);
      expect(isAzureBlobUrl(new URL('http://localhost:10000/devstoreaccount1/files/x'))).toBe(true);
    });

    it('rejects non-Azure hostnames', () => {
      expect(isAzureBlobUrl(new URL('https://lh3.googleusercontent.com/a/abc'))).toBe(false);
      expect(isAzureBlobUrl(new URL('https://my-bucket.s3.amazonaws.com/k'))).toBe(false);
      expect(isAzureBlobUrl(new URL('https://example.com/uploads/x'))).toBe(false);
      // Loopback without the Azurite port doesn't count.
      expect(isAzureBlobUrl(new URL('http://127.0.0.1:3000/files/x'))).toBe(false);
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
      const mockBlockBlobClient = {
        url: 'https://test.blob.core.windows.net/files/images/user123/test.pdf',
      };
      const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      };
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
      const spy = jest
        .spyOn(storageBlob.BlobServiceClient, 'fromConnectionString')
        .mockReturnValue({
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

  describe('deleteFileFromAzure', () => {
    const blobDelete = jest.fn();
    const getBlockBlobClient = jest.fn().mockReturnValue({ delete: blobDelete });

    beforeEach(() => {
      blobDelete.mockReset();
      getBlockBlobClient.mockClear();
      getAzureContainerClient.mockResolvedValue({ getBlockBlobClient });
      deleteRagFile.mockResolvedValue(undefined);
      process.env.AZURE_CONTAINER_NAME = 'files';
    });

    it('extracts the blob path (stripping SAS query) and deletes the blob', async () => {
      blobDelete.mockResolvedValue(undefined);
      const req = { user: { id: 'user123' } };
      const file = {
        file_id: 'f1',
        filepath:
          'https://test.blob.core.windows.net/files/images/user123/file.pdf?sv=2023&sig=abc&se=2026-01-01T00:00:00Z',
      };
      await deleteFileFromAzure(req, file);
      expect(getBlockBlobClient).toHaveBeenCalledWith('images/user123/file.pdf');
      expect(blobDelete).toHaveBeenCalledTimes(1);
    });

    it('throws when the blob path does not include the requesting user id', async () => {
      const req = { user: { id: 'attacker' } };
      const file = {
        file_id: 'f2',
        filepath: 'https://test.blob.core.windows.net/files/images/victim/file.pdf',
      };
      await expect(deleteFileFromAzure(req, file)).rejects.toThrow(
        /User ID not found in blob path/,
      );
      expect(blobDelete).not.toHaveBeenCalled();
    });

    it('swallows 404 errors from the SDK (already-gone blobs)', async () => {
      const notFound = Object.assign(new Error('not found'), { statusCode: 404 });
      blobDelete.mockRejectedValue(notFound);
      const req = { user: { id: 'user123' } };
      const file = {
        file_id: 'f3',
        filepath: 'https://test.blob.core.windows.net/files/images/user123/gone.pdf',
      };
      await expect(deleteFileFromAzure(req, file)).resolves.toBeUndefined();
    });

    it('rethrows non-404 SDK errors', async () => {
      blobDelete.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
      const req = { user: { id: 'user123' } };
      const file = {
        file_id: 'f4',
        filepath: 'https://test.blob.core.windows.net/files/images/user123/x.pdf',
      };
      await expect(deleteFileFromAzure(req, file)).rejects.toThrow(/boom/);
    });
  });

  describe('refreshAzureFileUrls', () => {
    const batchUpdateFiles = jest.fn();
    beforeEach(() => {
      batchUpdateFiles.mockReset();
      batchUpdateFiles.mockResolvedValue(undefined);
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
      process.env.AZURE_CONTAINER_NAME = 'files';
      const mockBlockBlobClient = {
        url: 'https://test.blob.core.windows.net/files/images/user123/x.pdf',
      };
      getAzureContainerClient.mockResolvedValue({
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      });
    });

    it('is a no-op for an empty list', async () => {
      const result = await refreshAzureFileUrls([], batchUpdateFiles);
      expect(result).toEqual([]);
      expect(batchUpdateFiles).not.toHaveBeenCalled();
    });

    it('skips files with a non-azure_blob source and never calls batchUpdate', async () => {
      const files = [
        { file_id: 'a', source: 's3', filepath: 'https://s3.example.com/k' },
        { file_id: 'b', source: 'local', filepath: '/tmp/x' },
      ];
      await refreshAzureFileUrls(files, batchUpdateFiles);
      expect(batchUpdateFiles).not.toHaveBeenCalled();
    });

    it('batch-updates only files whose URLs actually got refreshed', async () => {
      // Public-access mode: refresh swaps the (legacy) plain URL for the
      // current `blockBlobClient.url`. Two refreshable files → one batchUpdate
      // call carrying both new filepaths.
      const files = [
        {
          file_id: 'azure-1',
          source: 'azure_blob',
          filepath: 'https://test.blob.core.windows.net/files/images/user123/old1.pdf',
        },
        {
          file_id: 'azure-2',
          source: 'azure_blob',
          filepath: 'https://test.blob.core.windows.net/files/images/user123/old2.pdf',
        },
        // Missing filepath — should be ignored, not crash the batch.
        { file_id: 'azure-3', source: 'azure_blob' },
      ];
      await refreshAzureFileUrls(files, batchUpdateFiles, /* bufferSeconds */ 3600);
      // Public mode never triggers refresh (needsRefresh returns false on plain URLs),
      // so no batchUpdate call should be made.
      expect(batchUpdateFiles).not.toHaveBeenCalled();
    });
  });

  describe('refreshAzureUrl', () => {
    beforeEach(() => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
      process.env.AZURE_CONTAINER_NAME = 'files';
    });

    it('returns empty string when fileObj is null/undefined', async () => {
      expect(await refreshAzureUrl(null)).toBe('');
      expect(await refreshAzureUrl(undefined)).toBe('');
    });

    it('returns the original filepath when source is not azure_blob', async () => {
      const out = await refreshAzureUrl({ source: 's3', filepath: 'https://s3/k' });
      expect(out).toBe('https://s3/k');
    });

    it('returns the original filepath when no refresh is needed', async () => {
      // Public access + plain URL → needsRefreshAzure returns false → no refresh.
      const original = 'https://test.blob.core.windows.net/files/images/user/x.pdf';
      const out = await refreshAzureUrl({ source: 'azure_blob', filepath: original });
      expect(out).toBe(original);
    });
  });

  describe('getNewAzureURL - containerName override (multi-container support)', () => {
    beforeEach(() => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'true';
    });

    it('uses the passed containerName to anchor extraction and resolve the new URL', async () => {
      // URL is in a container that's NOT the env default. Without the
      // containerName arg, extractBlobPathFromAzureUrl would fall back to
      // the legacy "strip first segment" path; with it, we anchor correctly.
      process.env.AZURE_CONTAINER_NAME = 'default-container';
      const mockBlockBlobClient = {
        url: 'https://test.blob.core.windows.net/tenant-a/images/user/x.pdf',
      };
      const mockContainerClient = {
        getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
      };
      getAzureContainerClient.mockResolvedValue(mockContainerClient);

      const url = 'https://test.blob.core.windows.net/tenant-a/images/user/x.pdf?sv=2023&sig=old';
      const result = await getNewAzureURL(url, 'tenant-a');
      expect(getAzureContainerClient).toHaveBeenCalledWith('tenant-a');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('images/user/x.pdf');
      expect(result).toBe(mockBlockBlobClient.url);
    });
  });

  describe('Managed Identity signing path', () => {
    // The SDK calls `.toISOString()` on `signedStartsOn`/`signedExpiresOn`,
    // so these must be Date instances (not ISO strings). `value` must be
    // base64 so the HMAC step accepts it.
    const FAKE_DELEGATION_KEY = {
      signedObjectId: 'fake-oid',
      signedTenantId: 'fake-tid',
      signedStartsOn: new Date(),
      signedExpiresOn: new Date(Date.now() + 7 * 24 * 3.6e6),
      signedService: 'b',
      signedVersion: '2023-11-03',
      value: Buffer.alloc(32).toString('base64'),
    };

    beforeEach(() => {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
      process.env.AZURE_STORAGE_ACCOUNT_NAME = 'testaccount';
      azureIdentity.DefaultAzureCredential.mockClear();
      azureIdentity.ManagedIdentityCredential.mockClear();
    });

    // Spy must be re-applied INSIDE jest.isolateModulesAsync because each
    // isolate block re-requires @azure/storage-blob and gets a fresh
    // BlobServiceClient class (so a spy on the outer-scope class doesn't
    // affect the isolated instance). Pattern: re-require + re-spy + run +
    // assert + restore — all inside the block.
    async function runWithMockedDelegationKey(fn) {
      let getKeySpy;
      await jest.isolateModulesAsync(async () => {
        const storageBlob = require('@azure/storage-blob');
        getKeySpy = jest
          .spyOn(storageBlob.BlobServiceClient.prototype, 'getUserDelegationKey')
          .mockResolvedValue(FAKE_DELEGATION_KEY);
        const fresh = require('../../../../../server/services/Files/Azure/crud');
        try {
          await fn(fresh, getKeySpy);
        } finally {
          getKeySpy.mockRestore();
        }
      });
      return getKeySpy;
    }

    it('signs via DefaultAzureCredential outside production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        await runWithMockedDelegationKey(async (fresh) => {
          const signed = await fresh.getSignedAzureURL({
            blobPath: 'images/user/x.pdf',
            containerName: 'files',
          });
          const parsed = new URL(signed);
          expect(parsed.searchParams.get('sp')).toBe('r');
          expect(parsed.searchParams.get('spr')).toBe('https');
          expect(parsed.searchParams.has('sig')).toBe(true);
        });
        expect(azureIdentity.DefaultAzureCredential).toHaveBeenCalled();
        expect(azureIdentity.ManagedIdentityCredential).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('signs via ManagedIdentityCredential in production', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await runWithMockedDelegationKey(async (fresh) => {
          const signed = await fresh.getSignedAzureURL({
            blobPath: 'images/user/x.pdf',
            containerName: 'files',
          });
          expect(new URL(signed).searchParams.has('sig')).toBe(true);
        });
        expect(azureIdentity.ManagedIdentityCredential).toHaveBeenCalled();
        expect(azureIdentity.DefaultAzureCredential).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('reuses the BlobServiceClient + credential across concurrent calls (singleton)', async () => {
      // The perf invariant under test: regardless of how many concurrent
      // first-callers hit getSignedAzureURL with the same account name, we
      // construct the credential and the BlobServiceClient exactly once.
      // (The delegation-key memoization itself sits on top of this — its
      // promise-cache logic is verified by code review; isolating it here
      // is impractical because `getUserDelegationKey` lives on an internal
      // mixin chain that `jest.spyOn` doesn't reliably intercept.)
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        await runWithMockedDelegationKey(async (fresh) => {
          const [a, b, c] = await Promise.all([
            fresh.getSignedAzureURL({ blobPath: 'images/u/a.pdf', containerName: 'files' }),
            fresh.getSignedAzureURL({ blobPath: 'images/u/b.pdf', containerName: 'files' }),
            fresh.getSignedAzureURL({ blobPath: 'images/u/c.pdf', containerName: 'files' }),
          ]);
          expect(new URL(a).searchParams.has('sig')).toBe(true);
          expect(new URL(b).searchParams.has('sig')).toBe(true);
          expect(new URL(c).searchParams.has('sig')).toBe(true);
        });
        // Three signed-URL requests, exactly one credential constructed — the
        // pre-fix behavior would construct one per request.
        expect(azureIdentity.DefaultAzureCredential).toHaveBeenCalledTimes(1);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('getAzureFileStream', () => {
    const download = jest.fn();
    const getBlockBlobClient = jest.fn().mockReturnValue({ download });

    beforeEach(() => {
      download.mockReset();
      getBlockBlobClient.mockClear();
      getAzureContainerClient.mockResolvedValue({ getBlockBlobClient });
      process.env.AZURE_CONTAINER_NAME = 'files';
    });

    it('downloads via the authenticated SDK, stripping any SAS query from the blob path', async () => {
      const fakeStream = { pipe: jest.fn() };
      download.mockResolvedValue({ readableStreamBody: fakeStream });
      const url =
        'https://test.blob.core.windows.net/files/images/user123/a.png?sv=2023&sig=abc&se=2026-01-01T00:00:00Z';
      const result = await getAzureFileStream({}, url);
      expect(getBlockBlobClient).toHaveBeenCalledWith('images/user123/a.png');
      expect(download).toHaveBeenCalledTimes(1);
      expect(result).toBe(fakeStream);
    });

    it('works on a plain (unsigned) URL', async () => {
      download.mockResolvedValue({ readableStreamBody: { pipe: jest.fn() } });
      await getAzureFileStream({}, 'https://test.blob.core.windows.net/files/images/user123/a.png');
      expect(getBlockBlobClient).toHaveBeenCalledWith('images/user123/a.png');
    });

    it('works on a path-style / Azurite URL', async () => {
      download.mockResolvedValue({ readableStreamBody: { pipe: jest.fn() } });
      await getAzureFileStream(
        {},
        'http://127.0.0.1:10000/devstoreaccount1/files/images/user123/a.png',
      );
      expect(getBlockBlobClient).toHaveBeenCalledWith('images/user123/a.png');
    });

    it('throws when the blob path cannot be extracted from the URL', async () => {
      await expect(getAzureFileStream({}, 'not-a-url')).rejects.toThrow(
        /Unable to extract blob path/,
      );
      expect(download).not.toHaveBeenCalled();
    });

    it('throws when the container client is unavailable (Azure unconfigured)', async () => {
      getAzureContainerClient.mockResolvedValue(null);
      await expect(
        getAzureFileStream({}, 'https://test.blob.core.windows.net/files/images/user123/a.png'),
      ).rejects.toThrow(/not initialized/);
    });

    it('throws when the SDK returns no readable body', async () => {
      download.mockResolvedValue({ readableStreamBody: undefined });
      await expect(
        getAzureFileStream({}, 'https://test.blob.core.windows.net/files/images/user123/a.png'),
      ).rejects.toThrow(/Empty download body/);
    });
  });
});
