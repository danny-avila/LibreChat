const { FileSources } = require('librechat-data-provider');

const mockGetStrategyFunctions = jest.fn();

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(({ message }) => message),
  validateImage: jest.fn().mockResolvedValue({ isValid: true }),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));

const { encodeAndFormat } = require('../encode');

describe('encodeAndFormat blob storage fail-closed behavior', () => {
  const req = { body: {} };
  const file = {
    file_id: 'file-1',
    filename: 'image.png',
    filepath: 'https://testaccount.blob.core.windows.net/files/images/user1/image.png',
    type: 'image/png',
    height: 512,
    width: 512,
    source: FileSources.azure_blob,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws and does not fall back to a URL payload when the blob download fails', async () => {
    const prepareImagePayload = jest.fn();
    const getDownloadStream = jest.fn().mockRejectedValue(new Error('403 Forbidden'));
    mockGetStrategyFunctions.mockReturnValue({ prepareImagePayload, getDownloadStream });

    await expect(
      encodeAndFormat(req, [file], { endpoint: 'azureOpenAI' }),
    ).rejects.toThrow(/Failed to encode image from azure_blob/);

    expect(getDownloadStream).toHaveBeenCalled();
    expect(prepareImagePayload).not.toHaveBeenCalled();
  });
});
