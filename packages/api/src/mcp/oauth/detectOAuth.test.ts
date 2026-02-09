import { detectOAuthRequirement } from './detectOAuth';

jest.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  discoverOAuthProtectedResourceMetadata: jest.fn(),
}));

import { discoverOAuthProtectedResourceMetadata } from '@modelcontextprotocol/sdk/client/auth.js';

const mockDiscoverOAuthProtectedResourceMetadata =
  discoverOAuthProtectedResourceMetadata as jest.MockedFunction<
    typeof discoverOAuthProtectedResourceMetadata
  >;

describe('detectOAuthRequirement', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
    mockDiscoverOAuthProtectedResourceMetadata.mockRejectedValue(
      new Error('No protected resource metadata'),
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('POST fallback when HEAD fails', () => {
    it('should try POST when HEAD returns 405 Method Not Allowed', async () => {
      // HEAD returns 405 (Method Not Allowed)
      mockFetch.mockResolvedValueOnce({
        status: 405,
        headers: new Headers(),
      } as Response);

      // POST returns 401 with Bearer
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      expect(result.method).toBe('401-challenge-metadata');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify HEAD was called first
      expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'HEAD' }));

      // Verify POST was called second with proper headers and body
      expect(mockFetch.mock.calls[1][1]).toEqual(
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
    });

    it('should try POST when HEAD returns non-401 status', async () => {
      // HEAD returns 200 OK (no auth required for HEAD)
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Headers(),
      } as Response);

      // POST returns 401 with Bearer
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not try POST if HEAD returns 401', async () => {
      // HEAD returns 401 with Bearer
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      // Only HEAD should be called since it returned 401
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bearer detection without resource_metadata URL', () => {
    it('should detect OAuth when 401 has WWW-Authenticate: Bearer (case insensitive)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'bearer' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      expect(result.method).toBe('401-challenge-metadata');
      expect(result.metadata).toBeNull();
    });

    it('should detect OAuth when 401 has WWW-Authenticate: BEARER (uppercase)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'BEARER' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      expect(result.method).toBe('401-challenge-metadata');
    });

    it('should detect OAuth when Bearer is part of a larger header value', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer realm="api"' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
    });

    it('should not detect OAuth when 401 has no WWW-Authenticate header', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers(),
      } as Response);

      // POST also returns 401 without header
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers(),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(false);
      expect(result.method).toBe('no-metadata-found');
    });

    it('should not detect OAuth when 401 has non-Bearer auth scheme', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
      } as Response);

      // POST also returns 401 with Basic
      mockFetch.mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
      } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(false);
    });
  });

  describe('resource_metadata URL in WWW-Authenticate', () => {
    it('should prefer resource_metadata URL when provided with Bearer', async () => {
      const metadataUrl = 'https://auth.example.com/.well-known/oauth-protected-resource';

      mockFetch
        // HEAD request - 401 with resource_metadata URL
        .mockResolvedValueOnce({
          status: 401,
          headers: new Headers({
            'www-authenticate': `Bearer resource_metadata="${metadataUrl}"`,
          }),
        } as Response)
        // Metadata fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            authorization_servers: ['https://auth.example.com'],
          }),
        } as Response);

      const result = await detectOAuthRequirement('https://mcp.example.com');

      expect(result.requiresOAuth).toBe(true);
      expect(result.method).toBe('401-challenge-metadata');
      expect(result.metadata).toEqual({
        authorization_servers: ['https://auth.example.com'],
      });
    });

    it('should fall back to Bearer detection if metadata fetch fails', async () => {
      const metadataUrl = 'https://auth.example.com/.well-known/oauth-protected-resource';

      mockFetch
        // HEAD request - 401 with resource_metadata URL
        .mockResolvedValueOnce({
          status: 401,
          headers: new Headers({
            'www-authenticate': `Bearer resource_metadata="${metadataUrl}"`,
          }),
        } as Response)
        // Metadata fetch fails
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await detectOAuthRequirement('https://mcp.example.com');

      // Should still detect OAuth via Bearer
      expect(result.requiresOAuth).toBe(true);
      expect(result.metadata).toBeNull();
    });
  });

  describe('StackOverflow-like server behavior', () => {
    it('should detect OAuth for servers that return 405 for HEAD and 401+Bearer for POST', async () => {
      // This mimics StackOverflow's actual behavior:
      // HEAD -> 405 Method Not Allowed
      // POST -> 401 with WWW-Authenticate: Bearer

      mockFetch
        // HEAD returns 405
        .mockResolvedValueOnce({
          status: 405,
          headers: new Headers(),
        } as Response)
        // POST returns 401 with Bearer
        .mockResolvedValueOnce({
          status: 401,
          headers: new Headers({ 'www-authenticate': 'Bearer' }),
        } as Response);

      const result = await detectOAuthRequirement('https://mcp.stackoverflow.com');

      expect(result.requiresOAuth).toBe(true);
      expect(result.method).toBe('401-challenge-metadata');
      expect(result.metadata).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return no OAuth required when all checks fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await detectOAuthRequirement('https://unreachable.example.com');

      expect(result.requiresOAuth).toBe(false);
      expect(result.method).toBe('no-metadata-found');
    });

    it('should handle timeout gracefully', async () => {
      mockFetch.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100)),
      );

      const result = await detectOAuthRequirement('https://slow.example.com');

      expect(result.requiresOAuth).toBe(false);
    });
  });
});
