/**
 * Sticky per-device flag that flips the first time the user lands on an
 * auth screen. Used to route first-time visitors to /register instead of
 * /login; returning users still default to /login.
 *
 * Stored in localStorage (synchronous, persists across iOS WKWebView
 * launches and across web sessions; cleared by app uninstall or browser-
 * level storage purge). Wrapped in try/catch so a Safari-private-mode
 * SecurityError or unexpected disk failure can't break the auth flow.
 */

const FLAG_KEY = 'codecan_has_seen_auth';

export const hasSeenAuth = (): boolean => {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
};

export const markAuthSeen = (): void => {
  try {
    localStorage.setItem(FLAG_KEY, '1');
  } catch {
    // ignore — auth still works without the flag; we'd just keep showing
    // /register on every cold start, which is the safe degradation.
  }
};

/**
 * Route an unauthenticated visitor should land on. First-time visitors
 * (flag unset) see signup; everyone else sees login.
 */
export const routeForUnauthenticated = (): string => (hasSeenAuth() ? '/login' : '/register');
