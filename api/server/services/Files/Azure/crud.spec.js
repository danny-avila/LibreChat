jest.mock('node-fetch', () => jest.fn());

jest.mock('@librechat/data-schemas', () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  getAzureContainerClient: jest.fn(),
  deleteRagFile: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  getBufferMetadata: jest.fn(),
}));

const fetch = require('node-fetch');
const { getAzureContainerClient } = require('@librechat/api');
const { getBufferMetadata } = require('~/server/utils');
const { saveURLToAzure } = require('./crud');

describe('saveURLToAzure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns byte metadata for URL uploads so storage limits can be enforced', async () => {
    const buffer = Buffer.from('azure-url-upload');
    const uploadData = jest.fn().mockResolvedValue(undefined);
    getAzureContainerClient.mockResolvedValue({
      createIfNotExists: jest.fn().mockResolvedValue(undefined),
      getBlockBlobClient: jest.fn().mockReturnValue({
        uploadData,
        url: 'https://storage.example.com/files/images/user-123/image.png',
      }),
    });
    fetch.mockResolvedValue({
      buffer: jest.fn().mockResolvedValue(buffer),
    });
    getBufferMetadata.mockResolvedValue({
      bytes: buffer.byteLength,
      type: 'image/png',
      dimensions: { width: 16, height: 16 },
    });

    const result = await saveURLToAzure({
      userId: 'user-123',
      URL: 'https://example.com/image.png',
      fileName: 'image.png',
      basePath: 'images',
    });

    expect(uploadData).toHaveBeenCalledWith(buffer);
    expect(result).toEqual({
      filepath: 'https://storage.example.com/files/images/user-123/image.png',
      bytes: buffer.byteLength,
      type: 'image/png',
      dimensions: { width: 16, height: 16 },
    });
  });
});
