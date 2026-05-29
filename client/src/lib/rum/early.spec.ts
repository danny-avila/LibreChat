describe('RUM early interceptor', () => {
  const originalFetch = window.fetch;
  const OriginalXMLHttpRequest = window.XMLHttpRequest;

  beforeEach(() => {
    jest.resetModules();
    window.fetch = jest.fn(() => Promise.resolve({} as Response)) as unknown as typeof fetch;
    window.XMLHttpRequest = OriginalXMLHttpRequest;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXMLHttpRequest;
    window.__libreChatRumInterceptor?.clear();
    delete window.__libreChatRumInterceptor;
  });

  it('adds auth only to the configured RUM origin and path', async () => {
    await import('./early');

    window.__libreChatRumInterceptor?.configure({
      url: 'https://rum.example.com/ingest',
      authHeaderScheme: 'Bearer',
      tokenProvider: () => 'token-123',
    });

    await fetch('https://rum.example.com/ingest/v1/traces');
    await fetch('https://rum.example.com.attacker.com/ingest/v1/traces');
    await fetch('https://rum.example.com/other');

    const calls = (window.fetch as jest.MockedFunction<typeof fetch>).mock.calls;
    expect(new Headers(calls[0][1]?.headers).get('authorization')).toBe('Bearer token-123');
    expect(calls[1][1]?.headers).toBeUndefined();
    expect(calls[2][1]?.headers).toBeUndefined();
  });

  it('supports Basic auth when configured', async () => {
    await import('./early');

    window.__libreChatRumInterceptor?.configure({
      url: 'https://rum.example.com',
      authHeaderScheme: 'Basic',
      tokenProvider: () => 'token-123',
    });

    await fetch('https://rum.example.com/v1/traces');

    const calls = (window.fetch as jest.MockedFunction<typeof fetch>).mock.calls;
    expect(new Headers(calls[0][1]?.headers).get('authorization')).toBe('Basic token-123');
  });

  it('leaves requests unchanged when token is unavailable', async () => {
    await import('./early');

    window.__libreChatRumInterceptor?.configure({
      url: 'https://rum.example.com',
      tokenProvider: () => undefined,
    });

    await fetch('https://rum.example.com/v1/traces');

    const calls = (window.fetch as jest.MockedFunction<typeof fetch>).mock.calls;
    expect(calls[0][1]?.headers).toBeUndefined();
  });

  it('preserves XMLHttpRequest constructor constants', async () => {
    await import('./early');

    expect(window.XMLHttpRequest.DONE).toBe(OriginalXMLHttpRequest.DONE);
    expect(window.XMLHttpRequest.prototype).toBe(OriginalXMLHttpRequest.prototype);
  });

  it('falls back to SDK-set XHR auth when the token provider is empty', async () => {
    const instances: Array<{ headers: Map<string, string> }> = [];

    class FakeXMLHttpRequest {
      static DONE = 4;
      headers = new Map<string, string>();

      constructor() {
        instances.push(this);
      }

      open() {
        return undefined;
      }

      setRequestHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
      }

      send() {
        return undefined;
      }
    }

    window.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    await import('./early');

    window.__libreChatRumInterceptor?.configure({
      url: 'https://rum.example.com/ingest',
      tokenProvider: () => undefined,
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://rum.example.com/ingest/v1/traces');
    xhr.setRequestHeader('authorization', 'Bearer sdk-key');
    xhr.send();

    expect(instances[0].headers.get('authorization')).toBe('Bearer sdk-key');
  });

  it('preserves XHR credentials when async is omitted', async () => {
    const openCalls: unknown[][] = [];

    class FakeXMLHttpRequest {
      static DONE = 4;

      open(...args: unknown[]) {
        openCalls.push(args);
      }

      setRequestHeader() {
        return undefined;
      }

      send() {
        return undefined;
      }
    }

    window.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    await import('./early');

    const xhr = new XMLHttpRequest();
    (xhr.open as unknown as (...args: unknown[]) => void)(
      'GET',
      'https://api.example.com/resource',
      undefined,
      'user',
      'password',
    );

    expect(openCalls[0]).toEqual([
      'GET',
      'https://api.example.com/resource',
      true,
      'user',
      'password',
    ]);
  });
});
