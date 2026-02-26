import {
  isSafeRedirect,
  buildLoginRedirectUrl,
  getPostLoginRedirect,
  persistRedirectToSession,
  SESSION_KEY,
} from '../redirect';

describe('isSafeRedirect', () => {
  it('accepts a simple relative path', () => {
    expect(isSafeRedirect('/c/new')).toBe(true);
  });

  it('accepts a path with query params and hash', () => {
    expect(isSafeRedirect('/c/new?q=hello&submit=true#section')).toBe(true);
  });

  it('accepts a nested path', () => {
    expect(isSafeRedirect('/dashboard/settings/profile')).toBe(true);
  });

  it('rejects an absolute http URL', () => {
    expect(isSafeRedirect('https://evil.com')).toBe(false);
  });

  it('rejects an absolute http URL with path', () => {
    expect(isSafeRedirect('https://evil.com/phishing')).toBe(false);
  });

  it('rejects a protocol-relative URL', () => {
    expect(isSafeRedirect('//evil.com')).toBe(false);
  });

  it('rejects a bare domain', () => {
    expect(isSafeRedirect('evil.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeRedirect('')).toBe(false);
  });

  it('rejects /login to prevent redirect loops', () => {
    expect(isSafeRedirect('/login')).toBe(false);
  });

  it('rejects /login with query params', () => {
    expect(isSafeRedirect('/login?redirect_to=/c/new')).toBe(false);
  });

  it('rejects /login sub-paths', () => {
    expect(isSafeRedirect('/login/2fa')).toBe(false);
  });

  it('rejects /login with hash', () => {
    expect(isSafeRedirect('/login#foo')).toBe(false);
  });

  it('accepts the root path', () => {
    expect(isSafeRedirect('/')).toBe(true);
  });
});

describe('buildLoginRedirectUrl', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/c/abc123', search: '?model=gpt-4', hash: '#msg-5' },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('builds a login URL from explicit args', () => {
    const result = buildLoginRedirectUrl('/c/new', '?q=hello', '');
    expect(result).toBe('/login?redirect_to=%2Fc%2Fnew%3Fq%3Dhello');
  });

  it('encodes complex paths with query and hash', () => {
    const result = buildLoginRedirectUrl('/c/new', '?q=hello&submit=true', '#section');
    expect(result).toContain('redirect_to=');
    const encoded = result.split('redirect_to=')[1];
    expect(decodeURIComponent(encoded)).toBe('/c/new?q=hello&submit=true#section');
  });

  it('falls back to window.location when no args provided', () => {
    const result = buildLoginRedirectUrl();
    const encoded = result.split('redirect_to=')[1];
    expect(decodeURIComponent(encoded)).toBe('/c/abc123?model=gpt-4#msg-5');
  });

  it('falls back to "/" when all location parts are empty', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '', search: '', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login?redirect_to=%2F');
  });

  it('returns plain /login when pathname is /login (prevents recursive redirect)', () => {
    const result = buildLoginRedirectUrl('/login', '?redirect_to=%2Fc%2Fnew', '');
    expect(result).toBe('/login');
  });

  it('returns plain /login when window.location is already /login', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', search: '?redirect_to=%2Fc%2Fabc', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login');
  });

  it('returns plain /login for /login sub-paths', () => {
    const result = buildLoginRedirectUrl('/login/2fa', '', '');
    expect(result).toBe('/login');
  });

  it('returns plain /login for basename-prefixed /login (e.g. /librechat/login)', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/librechat/login', search: '?redirect_to=%2Fc%2Fabc', hash: '' },
      writable: true,
    });
    const result = buildLoginRedirectUrl();
    expect(result).toBe('/login');
  });

  it('returns plain /login for basename-prefixed /login sub-paths', () => {
    const result = buildLoginRedirectUrl('/librechat/login/2fa', '', '');
    expect(result).toBe('/login');
  });

  it('does NOT match paths where "login" is a substring of a segment', () => {
    const result = buildLoginRedirectUrl('/c/loginhistory', '', '');
    expect(result).toContain('redirect_to=');
    expect(decodeURIComponent(result.split('redirect_to=')[1])).toBe('/c/loginhistory');
  });
});

describe('getPostLoginRedirect', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns the redirect_to param when valid', () => {
    const params = new URLSearchParams('redirect_to=%2Fc%2Fnew');
    expect(getPostLoginRedirect(params)).toBe('/c/new');
  });

  it('falls back to sessionStorage when no URL param', () => {
    sessionStorage.setItem(SESSION_KEY, '/c/abc123');
    const params = new URLSearchParams();
    expect(getPostLoginRedirect(params)).toBe('/c/abc123');
  });

  it('prefers URL param over sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, '/c/old');
    const params = new URLSearchParams('redirect_to=%2Fc%2Fnew');
    expect(getPostLoginRedirect(params)).toBe('/c/new');
  });

  it('clears sessionStorage after reading', () => {
    sessionStorage.setItem(SESSION_KEY, '/c/abc123');
    const params = new URLSearchParams();
    getPostLoginRedirect(params);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('returns null when no redirect source exists', () => {
    const params = new URLSearchParams();
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects an absolute URL from params', () => {
    const params = new URLSearchParams('redirect_to=https%3A%2F%2Fevil.com');
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects a protocol-relative URL from params', () => {
    const params = new URLSearchParams('redirect_to=%2F%2Fevil.com');
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects an absolute URL from sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, 'https://evil.com');
    const params = new URLSearchParams();
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects /login redirect to prevent loops', () => {
    const params = new URLSearchParams('redirect_to=%2Flogin');
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects /login sub-path redirect', () => {
    const params = new URLSearchParams('redirect_to=%2Flogin%2F2fa');
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('still clears sessionStorage even when target is unsafe', () => {
    sessionStorage.setItem(SESSION_KEY, 'https://evil.com');
    const params = new URLSearchParams();
    getPostLoginRedirect(params);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('login error redirect_to preservation (AuthContext onError pattern)', () => {
  /** Mirrors the logic in AuthContext.tsx loginUser.onError */
  function buildLoginErrorPath(search: string): string {
    const redirectTo = new URLSearchParams(search).get('redirect_to');
    return redirectTo && isSafeRedirect(redirectTo)
      ? `/login?redirect_to=${encodeURIComponent(redirectTo)}`
      : '/login';
  }

  it('preserves a valid redirect_to across login failure', () => {
    const result = buildLoginErrorPath('?redirect_to=%2Fc%2Fnew');
    expect(result).toBe('/login?redirect_to=%2Fc%2Fnew');
  });

  it('drops an open-redirect attempt (absolute URL)', () => {
    const result = buildLoginErrorPath('?redirect_to=https%3A%2F%2Fevil.com');
    expect(result).toBe('/login');
  });

  it('drops a /login redirect_to to prevent loops', () => {
    const result = buildLoginErrorPath('?redirect_to=%2Flogin');
    expect(result).toBe('/login');
  });

  it('returns plain /login when no redirect_to param exists', () => {
    const result = buildLoginErrorPath('');
    expect(result).toBe('/login');
  });
});

describe('persistRedirectToSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores a valid relative path', () => {
    persistRedirectToSession('/c/new?q=hello');
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('/c/new?q=hello');
  });

  it('rejects an absolute URL', () => {
    persistRedirectToSession('https://evil.com');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('rejects a protocol-relative URL', () => {
    persistRedirectToSession('//evil.com');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('rejects /login paths', () => {
    persistRedirectToSession('/login?redirect_to=/c/new');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
