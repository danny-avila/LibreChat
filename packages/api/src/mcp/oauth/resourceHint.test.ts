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
      bearerChallenge: true,
      headAuthChallenge: true,
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
    // POST's 401 must not set headAuthChallenge — HEAD was 405.
    expect(result?.headAuthChallenge).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
  });

  it('still probes POST when HEAD returned Bearer without a hint', async () => {
    // HEAD 401 with Bearer-but-no-params means the server definitely speaks OAuth, but
    // some implementations surface `resource_metadata` only on POST responses. Letting
    // POST run ensures the authoritative hint isn't dropped just because HEAD was first.
    const hintUrl = 'https://example.com/.well-known/oauth-protected-resource';
    mockFetch
      .mockResolvedValueOnce({
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer' }),
      } as Response)
      .mockResolvedValueOnce({
        status: 401,
        headers: new Headers({
          'www-authenticate': `Bearer resource_metadata="${hintUrl}"`,
        }),
      } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result?.resourceMetadataUrl?.toString()).toBe(hintUrl);
    expect(result?.headAuthChallenge).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('marks bearerChallenge even when no resource_metadata is advertised on either method', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Bearer realm="api"' }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: true,
      headAuthChallenge: true,
    });
    // HEAD Bearer without hint → POST runs too.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a malformed resource_metadata value without throwing', async () => {
    // Defense: if the server advertises garbage in `resource_metadata=`, both the SDK
    // parser and our regex fallback wrap `new URL()` in try/catch and yield `undefined`.
    // Guard this behavior so a future refactor can't silently drop the safety net.
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({
        'www-authenticate': 'Bearer resource_metadata="not-a-url"',
      }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({
        'www-authenticate': 'Bearer resource_metadata="not-a-url"',
      }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: true,
      headAuthChallenge: true,
    });
  });

  it('extracts resource_metadata from multi-scheme challenges where Bearer is not first', async () => {
    // RFC 7235 allows multiple schemes in one header. The SDK's `extractWWWAuthenticateParams`
    // only parses the leading token, so a header like `Basic realm="api", Bearer resource_metadata="..."`
    // would drop the authoritative hint — hence the local regex fallback.
    const hintUrl = 'https://example.com/.well-known/oauth-protected-resource';
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({
        'www-authenticate': `Basic realm="api", Bearer resource_metadata="${hintUrl}"`,
      }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result?.resourceMetadataUrl?.toString()).toBe(hintUrl);
    expect(result?.bearerChallenge).toBe(true);
    expect(result?.headAuthChallenge).toBe(true);
  });

  it('returns a no-challenge result when both probes receive clean 200s', async () => {
    mockFetch.mockResolvedValue({ status: 200, headers: new Headers() } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: false,
      headAuthChallenge: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns null when the probe itself throws (e.g. network error)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toBeNull();
  });

  it('uses the injected fetchFn so admin-configured oauthHeaders reach the probe', async () => {
    // Simulates an MCP endpoint fronted by a gateway that requires a static API key
    // header — without it, the gateway 401s before the MCP app ever sees the request,
    // so the probe needs the OAuth-aware fetch wrapper to attach that header.
    const customFetch = jest.fn(async () => {
      return {
        status: 401,
        headers: new Headers({ 'www-authenticate': 'Bearer' }),
      } as Response;
    }) as unknown as typeof fetch;

    const result = await probeResourceMetadataHint('https://example.com/mcp', customFetch);

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: true,
      headAuthChallenge: true,
    });
    // HEAD + POST both via customFetch (Bearer-no-hint doesn't short-circuit).
    expect(customFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces headAuthChallenge when a non-Bearer 401 is the only response', async () => {
    // Basic-only 401 carries no OAuth hint, but callers still need to know a 401 was
    // seen so the MCP_OAUTH_ON_AUTH_ERROR fallback can fire without a duplicate HEAD.
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
    } as Response);
    mockFetch.mockResolvedValueOnce({
      status: 401,
      headers: new Headers({ 'www-authenticate': 'Basic realm="api"' }),
    } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: false,
      headAuthChallenge: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('surfaces headAuthChallenge when only a 403 is observed on HEAD', async () => {
    mockFetch.mockResolvedValue({ status: 403, headers: new Headers() } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: false,
      headAuthChallenge: true,
    });
  });

  it('returns null when HEAD threw so callers can retry via the fallback', async () => {
    // A transient HEAD failure followed by an uninformative POST used to leak a
    // {bearerChallenge: false, headAuthChallenge: false} result, silently skipping the
    // MCP_OAUTH_ON_AUTH_ERROR retry. Signal "unknown" via `null` instead.
    mockFetch
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValueOnce({ status: 200, headers: new Headers() } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not set headAuthChallenge when only POST returns 401/403 (WAF/CSRF case)', async () => {
    // Classic WAF/CSRF posture: HEAD cleanly returns 200, but a body-less JSON POST
    // trips a rule and gets 403. This is not an OAuth signal and must not flip the
    // `MCP_OAUTH_ON_AUTH_ERROR` fallback, so `headAuthChallenge` stays false.
    mockFetch
      .mockResolvedValueOnce({ status: 200, headers: new Headers() } as Response)
      .mockResolvedValueOnce({ status: 403, headers: new Headers() } as Response);

    const result = await probeResourceMetadataHint('https://example.com/mcp');

    expect(result).toEqual({
      resourceMetadataUrl: undefined,
      bearerChallenge: false,
      headAuthChallenge: false,
    });
  });
});
