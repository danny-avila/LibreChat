import { readTwoFactorSetupToken } from 'librechat-data-provider';

export const REDIRECT_PARAM = 'redirect_to';
export const SESSION_KEY = 'post_login_redirect_to';

/** Matches `/login` as a full path segment, with optional basename prefix (e.g. `/librechat/login/2fa`) */
const LOGIN_PATH_RE = /(?:^|\/)login(?:\/|$)/;

interface PostLoginRedirectWindow extends Window {
  __librechatPostLoginRedirect?: string;
}

/**
 * Session storage is blocked outright in embedded and private contexts, where it throws on access
 * rather than returning null. The destination is a convenience, never a credential, so a blocked
 * store must never take down the sign-in that carries it: access degrades to an in-memory mirror,
 * which still reaches the hand-offs that stay inside the document.
 *
 * Storage stays authoritative whenever it answers, and the mirror is written only where storage
 * refused. Mirroring every write would let a destination that storage has since dropped come back
 * from the dead.
 */
const readStoredRedirect = (): string | null => {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return (window as PostLoginRedirectWindow).__librechatPostLoginRedirect ?? null;
  }
};

const writeStoredRedirect = (value: string): void => {
  try {
    window.sessionStorage.setItem(SESSION_KEY, value);
    delete (window as PostLoginRedirectWindow).__librechatPostLoginRedirect;
  } catch {
    (window as PostLoginRedirectWindow).__librechatPostLoginRedirect = value;
  }
};

const dropStoredRedirect = (): void => {
  delete (window as PostLoginRedirectWindow).__librechatPostLoginRedirect;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore unavailable storage.
  }
};

/**
 * The mandatory enrollment screen holding a live setup token is a destination in its own right, so
 * it is exempt from the post-login redirects that would otherwise send an authenticated but
 * unenrolled user on to the app.
 */
export function isRequiredTwoFactorSetupRoute(): boolean {
  return window.location.pathname.endsWith('/login/2fa/setup') && !!readTwoFactorSetupToken();
}

/** Validates that a redirect target is a safe relative path (not an absolute or protocol-relative URL) */
export function isSafeRedirect(url: string): boolean {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    return false;
  }
  const path = url.split('?')[0].split('#')[0];
  return !LOGIN_PATH_RE.test(path);
}

/**
 * Resolves the post-login redirect from URL params and sessionStorage,
 * cleans up both sources, and returns the validated target (or null).
 */
export function getPostLoginRedirect(searchParams: URLSearchParams): string | null {
  const target = peekPostLoginRedirect(searchParams);
  dropStoredRedirect();
  return target;
}

/** Drops a pending destination, so a later sign-in starts from a clean slate. */
export function clearPostLoginRedirect(): void {
  dropStoredRedirect();
}

export function peekPostLoginRedirect(searchParams: URLSearchParams): string | null {
  const urlRedirect = searchParams.get(REDIRECT_PARAM);
  const storedRedirect = readStoredRedirect();

  const target = urlRedirect ?? storedRedirect;

  if (target == null || !isSafeRedirect(target)) {
    return null;
  }

  return target;
}

export function persistRedirectToSession(value: string): void {
  if (isSafeRedirect(value)) {
    writeStoredRedirect(value);
  }
}
