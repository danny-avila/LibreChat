jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockGetStrategyFunctions = jest.fn();
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: (...args) => mockGetStrategyFunctions(...args),
}));

jest.mock('@librechat/api', () => ({
  validateImage: jest.fn().mockResolvedValue({ isValid: true }),
  logAxiosError: jest.fn(({ message }) => message),
}));

const { FileSources } = require('librechat-data-provider');
const { encodeAndFormat } = require('../../../../../server/services/Files/images/encode');

const req = { body: {}, config: {} };

function makeImageFile(source) {
  return {
    file_id: `f-${source}`,
    filepath: `https://test.blob.core.windows.net/files/images/u/${source}.png`,
    filename: `${source}.png`,
    type: 'image/png',
    source,
    height: 100,
    width: 100,
  };
}

function failingStrategy() {
  return {
    prepareImagePayload: jest.fn().mockResolvedValue([{}, 'https://example.test/fallback.png']),
    getDownloadStream: jest.fn().mockRejectedValue(new Error('403 PublicAccessNotPermitted')),
  };
}

describe('encodeAndFormat — azure_blob fail-closed', () => {
  beforeEach(() => mockGetStrategyFunctions.mockReset());

  it('throws for azure_blob when the server-side download fails', async () => {
    mockGetStrategyFunctions.mockReturnValue(failingStrategy());
    await expect(
      encodeAndFormat(req, [makeImageFile(FileSources.azure_blob)], { endpoint: 'openAI' }),
    ).rejects.toThrow();
  });

  it('falls through (does not throw) for s3 when the download fails', async () => {
    mockGetStrategyFunctions.mockReturnValue(failingStrategy());
    await expect(
      encodeAndFormat(req, [makeImageFile(FileSources.s3)], { endpoint: 'openAI' }),
    ).resolves.toBeDefined();
  });

  it('falls through (does not throw) for firebase when the download fails', async () => {
    mockGetStrategyFunctions.mockReturnValue(failingStrategy());
    await expect(
      encodeAndFormat(req, [makeImageFile(FileSources.firebase)], { endpoint: 'openAI' }),
    ).resolves.toBeDefined();
  });

  it('returns a base64 image_url on the azure_blob happy path', async () => {
    const { Readable } = require('stream');
    mockGetStrategyFunctions.mockReturnValue({
      prepareImagePayload: jest.fn(),
      getDownloadStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('imgdata')])),
    });
    const result = await encodeAndFormat(req, [makeImageFile(FileSources.azure_blob)], {
      endpoint: 'openAI',
    });
    expect(result.image_urls[0].image_url.url).toMatch(/^data:image\/png;base64,/);
  });
});
