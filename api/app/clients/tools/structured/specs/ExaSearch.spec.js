const { fetch } = require('undici');
const ExaSearch = require('../ExaSearch');
const { getEnvProxyDispatcher } = require('@librechat/api');

jest.mock('undici');
jest.mock('@librechat/api', () => ({
  getEnvProxyDispatcher: jest.fn(),
}));

describe('ExaSearch', () => {
  let originalEnv;
  const mockApiKey = 'mock_api_key';
  const createInstance = () => new ExaSearch({ EXA_API_KEY: mockApiKey });
  const requestBody = () => JSON.parse(fetch.mock.calls[0][1].body);

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EXA_API_KEY: mockApiKey,
    };
    fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ results: [] }),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error if EXA_API_KEY is missing', () => {
    delete process.env.EXA_API_KEY;
    expect(() => new ExaSearch()).toThrow('Missing EXA_API_KEY environment variable.');
  });

  it('should use mockApiKey when EXA_API_KEY is not set in the environment', () => {
    const instance = new ExaSearch({
      EXA_API_KEY: mockApiKey,
    });
    expect(instance.apiKey).toBe(mockApiKey);
  });

  it('should send the API key as a header and request highlights by default', async () => {
    await createInstance()._call({ query: 'test query' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': mockApiKey }),
      }),
    );
    expect(requestBody()).toEqual({
      query: 'test query',
      type: 'auto',
      contents: { highlights: true },
    });
  });

  it('should nest content options and pass remaining parameters through', async () => {
    await createInstance()._call({
      query: 'test query',
      text: true,
      maxAgeHours: 24,
      numResults: 3,
      type: 'deep',
    });

    expect(requestBody()).toEqual({
      query: 'test query',
      type: 'deep',
      numResults: 3,
      contents: { text: true, maxAgeHours: 24 },
    });
  });

  it('should throw an error when the request fails', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({ message: 'Invalid API key' }),
    });

    await expect(createInstance()._call({ query: 'test query' })).rejects.toThrow(
      'Request failed with status 401: Invalid API key',
    );
  });

  describe('proxy support', () => {
    it('should use a shared proxy dispatcher when configured', async () => {
      const mockProxyDispatcher = { type: 'proxy-dispatcher' };
      getEnvProxyDispatcher.mockReturnValue(mockProxyDispatcher);

      await createInstance()._call({ query: 'test query' });

      expect(getEnvProxyDispatcher).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.exa.ai/search',
        expect.objectContaining({
          dispatcher: mockProxyDispatcher,
        }),
      );
    });

    it('should not attach a dispatcher when no proxy is configured', async () => {
      getEnvProxyDispatcher.mockReturnValue(undefined);

      await createInstance()._call({ query: 'test query' });

      expect(getEnvProxyDispatcher).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.exa.ai/search',
        expect.not.objectContaining({
          dispatcher: expect.anything(),
        }),
      );
    });
  });
});
