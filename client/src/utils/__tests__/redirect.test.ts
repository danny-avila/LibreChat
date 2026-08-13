import {
  persistRedirectToSession,
  clearPostLoginRedirect,
  getPostLoginRedirect,
  peekPostLoginRedirect,
  isSafeRedirect,
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

  it('rejects a backslash protocol-relative URL (CVE-2025-68470 class)', () => {
    expect(isSafeRedirect('/\\evil.com')).toBe(false);
  });

  it('rejects a double-backslash URL', () => {
    expect(isSafeRedirect('\\\\evil.com')).toBe(false);
  });

  it('rejects a backslash anywhere in the path', () => {
    expect(isSafeRedirect('/c/new\\x')).toBe(false);
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

  it('rejects an encoded backslash URL from params', () => {
    const params = new URLSearchParams('redirect_to=%2F%5Cevil.com');
    expect(getPostLoginRedirect(params)).toBeNull();
  });

  it('rejects a backslash URL from sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, '/\\evil.com');
    const params = new URLSearchParams();
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

describe('peekPostLoginRedirect', () => {
  beforeEach(() => sessionStorage.clear());

  it('preserves a safe stored destination across repeated setup mounts', () => {
    sessionStorage.setItem(SESSION_KEY, '/c/deep-link?model=test');

    expect(peekPostLoginRedirect(new URLSearchParams())).toBe('/c/deep-link?model=test');
    expect(peekPostLoginRedirect(new URLSearchParams())).toBe('/c/deep-link?model=test');
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('/c/deep-link?model=test');
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

/**
 * Embedded and private contexts deny session storage by throwing on access. The destination is a
 * convenience, so a denial must degrade rather than take down the sign-in that carries it.
 */
describe('blocked session storage', () => {
  const denyStorage = () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied);
  };

  beforeEach(() => {
    clearPostLoginRedirect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearPostLoginRedirect();
  });

  it('does not throw when persisting a destination', () => {
    denyStorage();
    expect(() => persistRedirectToSession('/c/abc123')).not.toThrow();
  });

  it('does not throw when consuming a destination', () => {
    denyStorage();
    expect(() => getPostLoginRedirect(new URLSearchParams())).not.toThrow();
  });

  it('does not throw when clearing a destination', () => {
    denyStorage();
    expect(() => clearPostLoginRedirect()).not.toThrow();
  });

  it('still resolves the URL destination while storage is denied', () => {
    denyStorage();
    expect(getPostLoginRedirect(new URLSearchParams('redirect_to=%2Fc%2Fabc123'))).toBe(
      '/c/abc123',
    );
  });

  /** The in-document hand-off never replaces the document, so the mirror still reaches it. */
  it('carries the destination in memory across a persist and consume pair', () => {
    denyStorage();
    persistRedirectToSession('/c/abc123');

    expect(getPostLoginRedirect(new URLSearchParams())).toBe('/c/abc123');
  });

  it('consumes the in-memory destination exactly once', () => {
    denyStorage();
    persistRedirectToSession('/c/abc123');

    expect(getPostLoginRedirect(new URLSearchParams())).toBe('/c/abc123');
    expect(getPostLoginRedirect(new URLSearchParams())).toBeNull();
  });

  it('drops the in-memory destination on clear', () => {
    denyStorage();
    persistRedirectToSession('/c/abc123');
    clearPostLoginRedirect();

    expect(getPostLoginRedirect(new URLSearchParams())).toBeNull();
  });

  it('still refuses an unsafe destination while storage is denied', () => {
    denyStorage();
    persistRedirectToSession('https://evil.com');

    expect(getPostLoginRedirect(new URLSearchParams())).toBeNull();
  });

  /**
   * Storage answers here, so it is the authority. A mirror written on every persist would outlive
   * a destination cleared straight out of storage and resurrect it on the next sign-in.
   */
  it('does not resurrect a destination dropped straight from storage', () => {
    persistRedirectToSession('/c/abc123');
    sessionStorage.clear();

    expect(getPostLoginRedirect(new URLSearchParams())).toBeNull();
  });

  it('does not let a denied write outlive a later working one', () => {
    denyStorage();
    persistRedirectToSession('/c/denied');
    jest.restoreAllMocks();

    persistRedirectToSession('/c/stored');
    sessionStorage.clear();

    expect(getPostLoginRedirect(new URLSearchParams())).toBeNull();
  });
});
