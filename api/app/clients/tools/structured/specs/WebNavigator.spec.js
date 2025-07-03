const WebNavigator = require('../WebNavigator');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

// Mock external dependencies
jest.mock('node-fetch');
jest.mock('fs');
jest.mock('path');
jest.mock('uuid');
jest.mock('crypto');

// Mock better-sqlite3
jest.mock(
  'better-sqlite3',
  () => {
    const mockPrepare = jest.fn();
    const mockExec = jest.fn();
    const mockGet = jest.fn();
    const mockRun = jest.fn();

    const mockDb = {
      prepare: mockPrepare.mockReturnValue({
        get: mockGet,
        run: mockRun,
      }),
      exec: mockExec,
    };

    return jest.fn().mockReturnValue(mockDb);
  },
  { virtual: true },
);

describe('WebNavigator', () => {
  let webNavigator;
  let mockResponse;
  let mockDb;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock environment variables
    process.env.FIRECRAWL_API_KEY = 'test-api-key';
    process.env.FIRECRAWL_API_URL = 'https://api.firecrawl.dev';
    process.env.WEB_NAVIGATOR_USE_FIRECRAWL = 'true';

    // Set up mock path.join
    path.join.mockImplementation((...args) => args.join('/'));

    // Set up mock fs functions
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);

    // Set up mock UUID
    uuidv4.mockReturnValue('mocked-uuid');

    // Set up mock crypto
    crypto.createHash.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mocked-hash'),
    });

    // Mock database - if require('better-sqlite3') has been called
    if (require.hasOwnProperty('cache') && require.cache['better-sqlite3']) {
      mockDb = require('better-sqlite3')();
    }

    // Create a standard mock response
    mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([
        ['content-type', 'text/html'],
        ['set-cookie', 'session=123456; Path=/; HttpOnly'],
      ]),
      text: jest
        .fn()
        .mockResolvedValue(
          '<html><body><h1>Test Page</h1><p>Content</p><a href="/link">Link</a></body></html>',
        ),
      json: jest.fn().mockResolvedValue({ success: true }),
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    };

    // Mock fetch implementation
    fetch.mockResolvedValue(mockResponse);

    // Initialize WebNavigator
    webNavigator = new WebNavigator();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.FIRECRAWL_API_KEY;
    delete process.env.FIRECRAWL_API_URL;
    delete process.env.WEB_NAVIGATOR_USE_FIRECRAWL;
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default values', () => {
      expect(webNavigator.name).toBe('WebNavigator');
      expect(webNavigator.firecrawlApiKey).toBe('test-api-key');
      expect(webNavigator.firecrawlApiUrl).toBe('https://api.firecrawl.dev');
      expect(webNavigator.firecrawlAvailable).toBe(true);
      expect(webNavigator.useFirecrawl).toBe(true);
      expect(webNavigator.schema).toBeDefined();
    });

    it('should initialize without Firecrawl when API key is not provided', () => {
      delete process.env.FIRECRAWL_API_KEY;
      const navWithoutFirecrawl = new WebNavigator();

      expect(navWithoutFirecrawl.firecrawlAvailable).toBe(false);
      expect(navWithoutFirecrawl.useFirecrawl).toBe(false);
    });

    it('should initialize with custom fields', () => {
      const customNav = new WebNavigator({
        FIRECRAWL_API_KEY: 'custom-key',
        FIRECRAWL_API_URL: 'https://custom-api.example.com',
      });

      expect(customNav.firecrawlApiKey).toBe('custom-key');
      expect(customNav.firecrawlApiUrl).toBe('https://custom-api.example.com');
    });

    it('should initialize cache if SQLite is available', () => {
      // SQLite is mocked, so this should work
      expect(fs.existsSync).toHaveBeenCalled();

      // If mockDb is defined, then the database was initialized
      if (mockDb) {
        expect(mockDb.exec).toHaveBeenCalledWith(
          expect.stringContaining('CREATE TABLE IF NOT EXISTS requests_cache'),
        );
      }
    });
  });

  describe('Schema Building', () => {
    it('should include Firecrawl options in schema when available', () => {
      const schema = webNavigator.buildSchema();

      expect(schema.shape).toHaveProperty('useFirecrawl');
      expect(schema.shape).toHaveProperty('firecrawlProxy');
      expect(schema.shape).toHaveProperty('firecrawlScrapeOptions');
    });

    it('should not include Firecrawl options in schema when unavailable', () => {
      delete process.env.FIRECRAWL_API_KEY;
      const navWithoutFirecrawl = new WebNavigator();
      const schema = navWithoutFirecrawl.buildSchema();

      expect(schema.shape).not.toHaveProperty('useFirecrawl');
      expect(schema.shape).not.toHaveProperty('firecrawlProxy');
      expect(schema.shape).not.toHaveProperty('firecrawlScrapeOptions');
    });
  });

  describe('Cache Management', () => {
    it('should generate cache key correctly', () => {
      const key = webNavigator.generateCacheKey('GET', 'https://example.com', { q: 'test' }, null);

      expect(crypto.createHash).toHaveBeenCalledWith('md5');
      expect(crypto.createHash().update).toHaveBeenCalledWith(
        'GET|https://example.com|{"q":"test"}|',
      );
      expect(key).toBe('mocked-hash');
    });

    it('should extract auth headers correctly', () => {
      const headers = {
        Authorization: 'Bearer token123',
        'X-API-Key': 'apikey456',
        'Content-Type': 'application/json', // Not an auth header
      };

      const authHeaders = webNavigator.extractAuthHeaders(headers);
      expect(authHeaders).toBe(
        JSON.stringify({
          Authorization: 'Bearer token123',
          'X-API-Key': 'apikey456',
        }),
      );
    });

    it('should return null for empty auth headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const authHeaders = webNavigator.extractAuthHeaders(headers);
      expect(authHeaders).toBeNull();
    });

    it('should get cached response if available and valid', () => {
      if (!mockDb) return; // Skip if SQLite is not available

      const mockCachedResponse = {
        url: 'https://example.com',
        responseStatus: 200,
      };

      // Mock database get to return a recent cached response
      mockDb.prepare().get.mockReturnValue({
        response: JSON.stringify(mockCachedResponse),
        timestamp: Date.now() - 5 * 60 * 1000, // 5 minutes ago (within the 15 minute cache window)
      });

      const result = webNavigator.getCachedResponse('test-key', {});
      expect(result).toEqual(mockCachedResponse);
    });

    it('should not return stale cached responses', () => {
      if (!mockDb) return; // Skip if SQLite is not available

      // Mock database get to return an old cached response
      mockDb.prepare().get.mockReturnValue({
        response: JSON.stringify({ url: 'https://example.com' }),
        timestamp: Date.now() - 20 * 60 * 1000, // 20 minutes ago (exceeds 15 minute cache window)
      });

      const result = webNavigator.getCachedResponse('test-key', {});
      expect(result).toBeNull();
    });

    it('should store response in cache', () => {
      if (!mockDb) return; // Skip if SQLite is not available

      const mockResult = { url: 'https://example.com', responseStatus: 200 };
      const mockHeaders = { Authorization: 'Bearer token123' };

      webNavigator.cacheResponse('test-key', mockResult, mockHeaders);

      expect(mockDb.prepare().run).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(mockResult),
        JSON.stringify({ Authorization: 'Bearer token123' }),
        expect.any(Number),
      );
    });
  });

  describe('Image Handling', () => {
    it('should save images correctly', async () => {
      // Mock a successful image fetch
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      });

      const result = await webNavigator.saveImage('https://example.com/image.jpg', 'test-user');

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result).toEqual({
        filepath: '/images/test-user/image-mocked-uuid.jpg',
        filename: 'image-mocked-uuid.jpg',
        bytes: 100,
        type: 'image/jpg',
      });
    });

    it('should handle image fetch failures', async () => {
      // Mock a failed image fetch
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(webNavigator.saveImage('https://example.com/bad-image.jpg')).rejects.toThrow(
        'Failed to fetch image: 404 Not Found',
      );
    });

    it("should create directories if they don't exist", async () => {
      // Mock directories don't exist
      fs.existsSync.mockReturnValue(false);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      });

      await webNavigator.saveImage('https://example.com/image.jpg');

      expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Firecrawl Integration', () => {
    it('should process requests with Firecrawl when enabled', async () => {
      const options = {
        method: 'GET',
        headers: { 'Custom-Header': 'value' },
        firecrawlProxy: 'stealth',
        returnTextOnly: true,
      };

      // Mock Firecrawl API response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            markdown: '# Test Content',
            links: ['https://example.com/page1', 'https://example.com/page2'],
            metadata: { title: 'Test Page' },
          },
        }),
      });

      const result = await webNavigator.processFirecrawlRequest('https://example.com', options);

      expect(fetch).toHaveBeenCalledWith(
        'https://api.firecrawl.dev/v1/scrape',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
          body: expect.stringContaining('"proxy":"stealth"'),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          requestUrl: 'https://example.com',
          text: '# Test Content',
          firecrawl: {
            used: true,
            proxy: 'stealth',
            metadata: { title: 'Test Page' },
          },
        }),
      );
    });

    it('should handle Firecrawl API errors', async () => {
      // Mock Firecrawl API error
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('Invalid URL'),
      });

      await expect(webNavigator.processFirecrawlRequest('https://example.com', {})).rejects.toThrow(
        'Firecrawl request failed: 400 Bad Request',
      );
    });

    it('should handle Firecrawl API success but error response', async () => {
      // Mock Firecrawl API response with success: false
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: jest.fn().mockResolvedValue({
          success: false,
          error: 'Failed to scrape page',
        }),
      });

      await expect(webNavigator.processFirecrawlRequest('https://example.com', {})).rejects.toThrow(
        'Firecrawl API error: Failed to scrape page',
      );
    });
  });

  describe('_call Method', () => {
    it('should handle help command', async () => {
      const result = await webNavigator._call({ action: 'help' });
      expect(result).toContain('WebNavigator Tool Help');
      expect(result).toContain('OVERVIEW');
      expect(result).toContain('EXAMPLES');
    });

    it('should handle image download requests', async () => {
      // Mock a successful image fetch
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      });

      const result = await webNavigator._call({
        imageDownloadLink: 'https://example.com/image.jpg',
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(
        expect.objectContaining({
          filepath: expect.stringContaining('/images/'),
          filename: expect.stringContaining('image-mocked-uuid.jpg'),
          bytes: 100,
        }),
      );
    });

    it('should make basic GET requests', async () => {
      const result = await webNavigator._call({
        url: 'https://example.com',
        method: 'GET',
        useFirecrawl: false, // Disable Firecrawl for this test
      });

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(
        expect.objectContaining({
          requestUrl: 'https://example.com/',
          responseStatus: 200,
          responseStatusText: 'OK',
        }),
      );

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });

    it('should make POST requests with data', async () => {
      const result = await webNavigator._call({
        url: 'https://example.com/api',
        method: 'POST',
        data: { key: 'value' },
        useFirecrawl: false, // Disable Firecrawl for this test
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          method: 'POST',
          body: '{"key":"value"}',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should handle query parameters', async () => {
      await webNavigator._call({
        url: 'https://example.com/search',
        params: { q: 'test query', page: '2' },
        useFirecrawl: false,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/search?q=test+query&page=2',
        expect.anything(),
      );
    });

    it('should handle browser impersonation', async () => {
      await webNavigator._call({
        url: 'https://example.com/',
        browserImpersonation: 'chrome',
        useFirecrawl: false,
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Chrome'),
          }),
        }),
      );
    });

    it('should return text-only content when requested', async () => {
      mockResponse.text.mockResolvedValueOnce('<div>Hello <span>World</span></div>');

      const result = await webNavigator._call({
        url: 'https://example.com',
        returnTextOnly: true,
        useFirecrawl: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('text', 'Hello World');
      expect(parsed).not.toHaveProperty('responseBody');
    });

    it('should filter tags when returnOnlyTags is provided', async () => {
      mockResponse.text.mockResolvedValueOnce(`
        <html>
          <body>
            <header>Header</header>
            <main>Main Content</main>
            <footer>Footer</footer>
          </body>
        </html>
      `);

      const result = await webNavigator._call({
        url: 'https://example.com',
        returnOnlyTags: ['main'],
        useFirecrawl: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.responseBody).toContain('<main>');
      expect(parsed.responseBody).not.toContain('<header>');
      expect(parsed.responseBody).not.toContain('<footer>');
    });

    it('should exclude tags when excludeTags is provided', async () => {
      mockResponse.text.mockResolvedValueOnce(`
        <html>
          <body>
            <div>Content</div>
            <script>alert('test');</script>
            <style>.test { color: red; }</style>
          </body>
        </html>
      `);

      const result = await webNavigator._call({
        url: 'https://example.com',
        excludeTags: ['script', 'style'],
        useFirecrawl: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.responseBody).toContain('<div>');
      expect(parsed.responseBody).not.toContain('<script>');
      expect(parsed.responseBody).not.toContain('<style>');
    });

    it('should fall back to Firecrawl on 403/404 errors', async () => {
      // First fetch returns 403
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Map(),
        text: jest.fn().mockResolvedValue('Access Denied'),
      });

      // Second fetch (Firecrawl API) returns success
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: jest.fn().mockResolvedValue({
          success: true,
          data: {
            markdown: '# Content accessed via Firecrawl',
            html: '<h1>Content accessed via Firecrawl</h1>',
            links: [],
            metadata: {},
          },
        }),
      });

      const result = await webNavigator._call({
        url: 'https://example.com/protected',
        useFirecrawl: false, // Initially disabled, but should fall back
      });

      const parsed = JSON.parse(result);
      expect(parsed.firecrawl.used).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.firecrawl.dev/v1/scrape',
        expect.anything(),
      );
    });

    it('should check and use cache when available', async () => {
      if (!mockDb) return; // Skip if SQLite is not available

      // Setup mock cached response
      const cachedResponse = {
        requestUrl: 'https://example.com',
        responseStatus: 200,
        responseBody: '<html><body>Cached content</body></html>',
      };

      // Mock the getCachedResponse method
      jest.spyOn(webNavigator, 'getCachedResponse').mockReturnValueOnce(cachedResponse);

      const result = await webNavigator._call({
        url: 'https://example.com',
        useFirecrawl: false,
      });

      const parsed = JSON.parse(result);
      expect(parsed.cached).toBe(true);
      expect(parsed).toEqual(expect.objectContaining(cachedResponse));
      expect(fetch).not.toHaveBeenCalled(); // Should not call fetch when cache hit
    });
  });
});
