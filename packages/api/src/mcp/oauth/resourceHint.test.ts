import { probeResourceMetadataHint } from './resourceHint';

jest.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
  ...jest.requireActual('@modelcontextprotocol/sdk/client/auth.js'),
}));

describe('probeResourceMetadataHint', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn() as unknown as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the resource_metadata URL from a HEAD 401 challenge', async () => {
    const hintUrl = 'https://example.com/.well-known/oauth-protected-resource';
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({
        'www-authenticate': `Bearer resource_metadata="${hintUrl}"`,
      }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: new URL(hintUrl),
      scope: undefined,
      bearerChallenge: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'HEAD' }));
  });

  it('falls back to POST when HEAD does not return 401', async () => {
    const hintUrl = 'https://example.com/.well-known/oauth-protected-resource';
    mockFetch
      .mockResolvedValueOnce({ status: 405, headers: new Headers() } as Response)
      .mockResolvedValueOnce({
        status: 401,
        headers: new Headers({
          'www-authenticate': `Bearer resource_metadata="${hintUrl}"`,
        }),
      } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result?.resourceMetadataUrl?.toString()).toBe(hintUrl);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
  });

  it('marks bearerChallenge even when no resource_metadata is advertised', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Bearer realm="api"' }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      scope: undefined,
      bearerChallenge: true,
    });
  });

  it('returns null when no 401 challenge was observed on either method', async () => {
    mockFetch.mockResolvedValue({ status: 200, headers: new Headers() } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when the probe itself throws (e.g. network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toBeNull();
  });

  it('treats a non-Bearer 401 as uninformative and keeps probing', async () => {
    // Basic auth challenges carry no OAuth signal: fall through to the POST probe so
    // MCP servers that require a body before emitting their Bearer challenge still work.
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
