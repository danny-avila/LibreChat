/**
 * @jest-environment jsdom
 */

/**
 * Tests for buildLoginRedirectUrl and apiBaseUrl under subdirectory deployments.
 *
 * Uses jest.isolateModules to re-import api-endpoints with a <base href="/chat/">
 * element present, simulating a subdirectory deployment where BASE_URL = '/chat'.
 *
 * Tests that need to override window.location use explicit function arguments
 * instead of mocking the global, since jsdom 26+ does not allow redefining it.
 */

function loadModuleWithBase(baseHref: string) {
  const base = document.createElement('base');
  base.setAttribute('href', baseHref);
  document.head.appendChild(base);

  const proc = process as typeof process & { browser?: boolean };
  const originalBrowser = proc.browser;

  let mod: typeof import('../src/api-endpoints');
  try {
    proc.browser = true;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- static import not usable inside isolateModules
      mod = require('../src/api-endpoints');
    });
    return mod!;
  } finally {
    proc.browser = originalBrowser;
    document.head.removeChild(base);
  }
}

describe('buildLoginRedirectUrl — subdirectory deployment (BASE_URL = /chat)', () => {
  let buildLoginRedirectUrl: typeof import('../src/api-endpoints').buildLoginRedirectUrl;
  let apiBaseUrl: typeof import('../src/api-endpoints').apiBaseUrl;

  beforeAll(() => {
    const mod = loadModuleWithBase('/chat/');
    buildLoginRedirectUrl = mod.buildLoginRedirectUrl;
    apiBaseUrl = mod.apiBaseUrl;
  });

  it('sets BASE_URL to "/chat" (trailing slash stripped)', () => {
    expect(apiBaseUrl()).toBe('/chat');
  });

  it('returns "/login" without base prefix (compatible with React Router navigate)', () => {
    const result = buildLoginRedirectUrl('/chat/c/new', '', '');
    expect(result).toMatch(/^\/login/);
    expect(result).not.toMatch(/^\/chat/);
  });

  it('strips base prefix from redirect_to when pathname includes base', () => {
    const result = buildLoginRedirectUrl('/chat/c/abc123', '?model=gpt-4', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/c/abc123?model=gpt-4');
    expect(redirectTo).not.toContain('/chat/');
  });

  it('works with pathnames that do not include the base prefix', () => {
    const result = buildLoginRedirectUrl('/c/new', '', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/c/new');
  });

  it('returns plain /login for base-prefixed login path', () => {
    expect(buildLoginRedirectUrl('/chat/login', '', '')).toBe('/login');
  });

  it('returns plain /login for base-prefixed login sub-path', () => {
    expect(buildLoginRedirectUrl('/chat/login/2fa', '', '')).toBe('/login');
  });

  it('returns plain /login when stripped path is root (no pointless redirect_to=/)', () => {
    const result = buildLoginRedirectUrl('/chat', '', '');
    expect(result).toBe('/login');
    expect(result).not.toContain('redirect_to');
  });

  it('composes correct full URL for window.location.href (apiBaseUrl + buildLoginRedirectUrl)', () => {
    const fullUrl = apiBaseUrl() + buildLoginRedirectUrl('/chat/c/abc123', '', '');
    expect(fullUrl).toBe('/chat/login?redirect_to=%2Fc%2Fabc123');
    expect(fullUrl).not.toContain('/chat/chat/');
  });

  it('encodes query params and hash correctly after stripping base', () => {
    const result = buildLoginRedirectUrl('/chat/c/deep', '?q=hello&submit=true', '#section');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/c/deep?q=hello&submit=true#section');
  });

  it('does not strip base when path shares a prefix but is not a segment match', () => {
    const result = buildLoginRedirectUrl('/chatroom/c/abc123', '', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/chatroom/c/abc123');
  });

  it('does not strip base from /chatbot path', () => {
    const result = buildLoginRedirectUrl('/chatbot', '', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/chatbot');
  });
});

describe('buildLoginRedirectUrl — deep subdirectory (BASE_URL = /app/chat)', () => {
  let buildLoginRedirectUrl: typeof import('../src/api-endpoints').buildLoginRedirectUrl;
  let apiBaseUrl: typeof import('../src/api-endpoints').apiBaseUrl;

  beforeAll(() => {
    const mod = loadModuleWithBase('/app/chat/');
    buildLoginRedirectUrl = mod.buildLoginRedirectUrl;
    apiBaseUrl = mod.apiBaseUrl;
  });

  it('sets BASE_URL to "/app/chat"', () => {
    expect(apiBaseUrl()).toBe('/app/chat');
  });

  it('strips deep base prefix from redirect_to', () => {
    const result = buildLoginRedirectUrl('/app/chat/c/abc123', '', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/c/abc123');
  });

  it('full URL does not double the base prefix', () => {
    const fullUrl = apiBaseUrl() + buildLoginRedirectUrl('/app/chat/c/abc123', '', '');
    expect(fullUrl).toBe('/app/chat/login?redirect_to=%2Fc%2Fabc123');
    expect(fullUrl).not.toContain('/app/chat/app/chat/');
  });

  it('does not strip from /app/chatroom (segment boundary check)', () => {
    const result = buildLoginRedirectUrl('/app/chatroom/page', '', '');
    const redirectTo = decodeURIComponent(result.split('redirect_to=')[1]);
    expect(redirectTo).toBe('/app/chatroom/page');
  });
});
