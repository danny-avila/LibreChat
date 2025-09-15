const axios = require('axios');
const deriveBaseURL = require('./deriveBaseURL');
jest.mock('@librechat/api', () => {
  const originalUtils = jest.requireActual('@librechat/api');
  return {
    ...originalUtils,
    processModelData: jest.fn((...args) => {
      return originalUtils.processModelData(...args);
    }),
  };
});

jest.mock('axios');
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(true),
  })),
);
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

axios.get.mockResolvedValue({
  data: {
    data: [{ id: 'model-1' }, { id: 'model-2' }],
  },
});

describe('deriveBaseURL', () => {
  it('should extract the base URL correctly from a full URL with a port', () => {
    const fullURL = 'https://example.com:8080/path?query=123';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('https://example.com:8080');
  });

  it('should extract the base URL correctly from a full URL without a port', () => {
    const fullURL = 'https://example.com/path?query=123';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('https://example.com');
  });

  it('should handle URLs using the HTTP protocol', () => {
    const fullURL = 'http://example.com:3000/path?query=123';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('http://example.com:3000');
  });

  it('should return only the protocol and hostname if no port is specified', () => {
    const fullURL = 'http://example.com/path?query=123';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('http://example.com');
  });

  it('should handle URLs with uncommon protocols', () => {
    const fullURL = 'ftp://example.com:2121/path?query=123';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('ftp://example.com:2121');
  });

  it('should handle edge case where URL ends with a slash', () => {
    const fullURL = 'https://example.com/';
    const baseURL = deriveBaseURL(fullURL);
    expect(baseURL).toEqual('https://example.com');
  });

  it('should return the original URL if the URL is invalid', () => {
    const invalidURL = 'htp:/example.com:8080';
    const result = deriveBaseURL(invalidURL);
    expect(result).toBe(invalidURL);
  });
});
