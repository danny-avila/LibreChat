const axios = require('axios');
const { createAxiosInstance } = require('./index');

// Mock axios
jest.mock('axios', () => ({
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  create: jest.fn().mockReturnValue({
    defaults: {
      proxy: null,
    },
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  }),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  reset: jest.fn().mockImplementation(function () {
    this.get.mockClear();
    this.post.mockClear();
    this.put.mockClear();
    this.delete.mockClear();
    this.create.mockClear();
  }),
}));

describe('createAxiosInstance', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    // Create a clean copy of process.env
    process.env = { ...originalEnv };
    // Default: no proxy
    delete process.env.proxy;
  });

  afterAll(() => {
    // Restore original process.env
    process.env = originalEnv;
  });

  test('creates an axios instance without proxy when no proxy env is set', () => {
    const instance = createAxiosInstance();

    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(instance.defaults.proxy).toBeNull();
  });

  test('configures proxy correctly with hostname and protocol', () => {
    process.env.proxy = 'http://example.com';

    const instance = createAxiosInstance();

    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(instance.defaults.proxy).toEqual({
      host: 'example.com',
      protocol: 'http',
    });
  });

  test('configures proxy correctly with hostname, protocol and port', () => {
    process.env.proxy = 'https://proxy.example.com:8080';

    const instance = createAxiosInstance();

    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(instance.defaults.proxy).toEqual({
      host: 'proxy.example.com',
      protocol: 'https',
      port: 8080,
    });
  });

  test('handles proxy URLs with authentication', () => {
    process.env.proxy = 'http://user:pass@proxy.example.com:3128';

    const instance = createAxiosInstance();

    expect(axios.create).toHaveBeenCalledTimes(1);
    expect(instance.defaults.proxy).toEqual({
      host: 'proxy.example.com',
      protocol: 'http',
      port: 3128,
      // Note: The current implementation doesn't handle auth - if needed, add this functionality
    });
  });

  test('throws error when proxy URL is invalid', () => {
    process.env.proxy = 'invalid-url';

    expect(() => createAxiosInstance()).toThrow('Invalid proxy URL');
    expect(axios.create).toHaveBeenCalledTimes(1);
  });

  // If you want to test the actual URL parsing more thoroughly
  test('handles edge case proxy URLs correctly', () => {
    // IPv6 address
    process.env.proxy = 'http://[::1]:8080';

    let instance = createAxiosInstance();

    expect(instance.defaults.proxy).toEqual({
      host: '::1',
      protocol: 'http',
      port: 8080,
    });

    // URL with path (which should be ignored for proxy config)
    process.env.proxy = 'http://proxy.example.com:8080/some/path';

    instance = createAxiosInstance();

    expect(instance.defaults.proxy).toEqual({
      host: 'proxy.example.com',
      protocol: 'http',
      port: 8080,
    });
  });
});
