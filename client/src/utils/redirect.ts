const REDIRECT_PARAM = 'redirect_to';
const SESSION_KEY = 'post_login_redirect_to';

/** Matches `/login` as a full path segment, with optional basename prefix (e.g. `/librechat/login/2fa`) */
const LOGIN_PATH_RE = /(?:^|\/)login(?:\/|$)/;

/** Validates that a redirect target is a safe relative path (not an absolute or protocol-relative URL) */
function isSafeRedirect(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }
  const path = url.split('?')[0].split('#')[0];
  return !LOGIN_PATH_RE.test(path);
}

/**
 * Builds a `/login?redirect_to=...` URL from the given or current location.
 * Returns plain `/login` (no param) when already on a login route to prevent recursive nesting.
 */
function buildLoginRedirectUrl(pathname?: string, search?: string, hash?: string): string {
  const p = pathname ?? window.location.pathname;
  if (LOGIN_PATH_RE.test(p)) {
    return '/login';
  }
  const s = search ?? window.location.search;
  const h = hash ?? window.location.hash;
  const currentPath = `${p}${s}${h}`;
  const encoded = encodeURIComponent(currentPath || '/');
  return `/login?${REDIRECT_PARAM}=${encoded}`;
}

/**
 * Resolves the post-login redirect from URL params and sessionStorage,
 * cleans up both sources, and returns the validated target (or null).
 */
function getPostLoginRedirect(searchParams: URLSearchParams): string | null {
  const urlRedirect = searchParams.get(REDIRECT_PARAM);
  const storedRedirect = sessionStorage.getItem(SESSION_KEY);

  const target = urlRedirect ?? storedRedirect;

  if (storedRedirect) {
    sessionStorage.removeItem(SESSION_KEY);
  }

  if (target == null || !isSafeRedirect(target)) {
    return null;
  }

  return target;
}

function persistRedirectToSession(value: string): void {
  if (isSafeRedirect(value)) {
    sessionStorage.setItem(SESSION_KEY, value);
  }
}

export {
  SESSION_KEY,
  REDIRECT_PARAM,
  isSafeRedirect,
  persistRedirectToSession,
  buildLoginRedirectUrl,
  getPostLoginRedirect,
};
