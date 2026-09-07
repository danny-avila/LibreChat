const { Readable } = require('stream');

jest.mock('axios', () => jest.fn());
jest.mock('node-fetch', () => jest.fn());
jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  deleteRagFile: jest.fn(),
  assertRemoteFileURL: jest.fn((url) => url),
  getAzureContainerClient: jest.fn(),
  getRemoteFileFetchMaxBytes: jest.fn(() => 1024),
  getRemoteFileFetchTimeoutMs: jest.fn(() => 1000),
  assertRemoteFileContentLength: jest.fn(),
}));

const axios = require('axios');
const { getAzureContainerClient } = require('@librechat/api');
const {
  getAzureURL,
  getAzureBlobPath,
  saveBufferToAzure,
  getAzureFileStream,
  deleteFileFromAzure,
} = require('../crud');

const ACCOUNT_URL = 'https://acct.blob.core.windows.net';
const CONTAINER = 'ai-chat-uploads';

function mockContainer() {
  const blobClient = {
    download: jest.fn(),
  };
  const blockBlobClient = {
    url: '',
    uploadData: jest.fn(),
    delete: jest.fn(),
  };
  const containerClient = {
    createIfNotExists: jest.fn(),
    getBlobClient: jest.fn(() => blobClient),
    getBlockBlobClient: jest.fn((blobPath) => {
      blockBlobClient.url = `${ACCOUNT_URL}/${CONTAINER}/${blobPath}`;
      return blockBlobClient;
    }),
  };
  getAzureContainerClient.mockResolvedValue(containerClient);
  return { containerClient, blobClient, blockBlobClient };
}

describe('Azure Blob crud – private vs public containers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AZURE_CONTAINER_NAME = CONTAINER;
    delete process.env.AZURE_STORAGE_PUBLIC_ACCESS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getAzureBlobPath', () => {
    it('resolves the blob path from an absolute blob URL (query stripped, container prefix removed)', () => {
      expect(
        getAzureBlobPath(
          `${ACCOUNT_URL}/${CONTAINER}/images/user1/avatar.png?manual=true`,
          CONTAINER,
        ),
      ).toBe('images/user1/avatar.png');
    });

    it('resolves the blob path from a root-relative stored path', () => {
      expect(getAzureBlobPath('/images/user1/file.png', CONTAINER)).toBe('images/user1/file.png');
    });

    it('rejects URLs from another container and traversal segments', () => {
      expect(() => getAzureBlobPath(`${ACCOUNT_URL}/other/images/u/f.png`, CONTAINER)).toThrow(
        /not in container/,
      );
      expect(() => getAzureBlobPath('/images/../secrets', CONTAINER)).toThrow(/Invalid/);
      expect(() => getAzureBlobPath('', CONTAINER)).toThrow(/Invalid/);
    });
  });

  describe('getAzureFileStream', () => {
    it('fetches the blob anonymously when the container is public (default)', async () => {
      const stream = Readable.from(['x']);
      axios.mockResolvedValue({ data: stream });
      const { blobClient } = mockContainer();
      const url = `${ACCOUNT_URL}/${CONTAINER}/images/user1/file.png`;

      const result = await getAzureFileStream({}, url);

      expect(result).toBe(stream);
      expect(axios).toHaveBeenCalledWith({ method: 'get', url, responseType: 'stream' });
      expect(blobClient.download).not.toHaveBeenCalled();
    });

    it('downloads through the authenticated client when the container is private', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      const stream = Readable.from(['x']);
      const { containerClient, blobClient } = mockContainer();
      blobClient.download.mockResolvedValue({ readableStreamBody: stream });

      const result = await getAzureFileStream(
        {},
        `${ACCOUNT_URL}/${CONTAINER}/images/user1/file.png`,
      );

      expect(result).toBe(stream);
      expect(axios).not.toHaveBeenCalled();
      expect(getAzureContainerClient).toHaveBeenCalledWith(CONTAINER);
      expect(containerClient.getBlobClient).toHaveBeenCalledWith('images/user1/file.png');
    });

    it('accepts the root-relative path stored for private blobs', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      const stream = Readable.from(['x']);
      const { containerClient, blobClient } = mockContainer();
      blobClient.download.mockResolvedValue({ readableStreamBody: stream });

      await expect(getAzureFileStream({}, '/images/user1/file.png')).resolves.toBe(stream);
      expect(containerClient.getBlobClient).toHaveBeenCalledWith('images/user1/file.png');
    });

    it('rethrows download errors in private mode', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      const { blobClient } = mockContainer();
      blobClient.download.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 404 }));

      await expect(getAzureFileStream({}, '/images/user1/missing.png')).rejects.toThrow('nope');
    });

    it('fails when the Azure client is not initialized in private mode', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      getAzureContainerClient.mockResolvedValue(null);

      await expect(getAzureFileStream({}, '/images/user1/file.png')).rejects.toThrow(
        /not initialized/,
      );
    });
  });

  describe('stored file paths', () => {
    it('returns the blob URL and requests public blob access when the container is public', async () => {
      const { containerClient } = mockContainer();

      const result = await saveBufferToAzure({
        userId: 'user1',
        buffer: Buffer.from('data'),
        fileName: 'file.png',
      });

      expect(result).toBe(`${ACCOUNT_URL}/${CONTAINER}/images/user1/file.png`);
      expect(containerClient.createIfNotExists).toHaveBeenCalledWith({ access: 'blob' });
    });

    it('returns a root-relative /images path served by the app when the container is private', async () => {
      process.env.AZURE_STORAGE_PUBLIC_ACCESS = 'false';
      const { containerClient } = mockContainer();

      const result = await saveBufferToAzure({
        userId: 'user1',
        buffer: Buffer.from('data'),
        fileName: 'file.png',
      });

      expect(result).toBe('/images/user1/file.png');
      expect(containerClient.createIfNotExists).toHaveBeenCalledWith({ access: undefined });
      await expect(getAzureURL({ userId: 'user1', fileName: 'file.png' })).resolves.toBe(
        '/images/user1/file.png',
      );
    });
  });

  describe('deleteFileFromAzure', () => {
    it('deletes by blob path for both stored path shapes', async () => {
      const req = { user: { id: 'user1' } };
      const { containerClient, blockBlobClient } = mockContainer();

      await deleteFileFromAzure(req, {
        filepath: `${ACCOUNT_URL}/${CONTAINER}/images/user1/a.png`,
      });
      await deleteFileFromAzure(req, { filepath: '/images/user1/b.png' });

      expect(containerClient.getBlockBlobClient).toHaveBeenNthCalledWith(1, 'images/user1/a.png');
      expect(containerClient.getBlockBlobClient).toHaveBeenNthCalledWith(2, 'images/user1/b.png');
      expect(blockBlobClient.delete).toHaveBeenCalledTimes(2);
    });

    it("refuses to delete a blob outside the user's directory", async () => {
      const { blockBlobClient } = mockContainer();

      await expect(
        deleteFileFromAzure({ user: { id: 'user1' } }, { filepath: '/images/user2/c.png' }),
      ).rejects.toThrow('User ID not found in blob path');
      expect(blockBlobClient.delete).not.toHaveBeenCalled();
    });
  });
});
