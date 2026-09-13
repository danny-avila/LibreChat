import crypto from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { CookieOptions, Request } from 'express';
import { shouldUseSecureCookie } from './csrf';

export const OAUTH_STATE_COOKIE_PREFIX = 'oauth_state_';
export const OAUTH_STATE_MAX_AGE: number = 10 * 60 * 1000;

const STATE_BYTES = 32;
const MISSING_STATE_MESSAGE = 'Unable to verify authorization request state.';
const INVALID_STATE_MESSAGE = 'Invalid authorization request state.';

export interface OAuthStateStoreOptions {
  /** Strategy name; scopes the cookie and labels rejections in logs. */
  provider: string;
  /** Callback URL registered with the provider; its path scopes the cookie. */
  callbackURL: string;
  /**
   * The provider returns with a cross-site form POST (Apple's `form_post`), which a
   * `SameSite=Lax` cookie does not accompany.
   */
  crossSiteCallback?: boolean;
}

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: boolean, info?: { message: string }) => void;

/**
 * State store for `passport-oauth2`, which dispatches on each method's arity:
 * `store(req, callback)` and `verify(req, providedState, callback)`.
 */
export interface OAuthStateStore {
  store(req: Request, callback: StoreCallback): void;
  verify(req: Request, providedState: unknown, callback: VerifyCallback): void;
}

function getCookiePath(callbackURL: string): string {
  try {
    return new URL(callbackURL).pathname || '/';
  } catch {
    return '/';
  }
}

function statesMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Binds an OAuth login to the browser that started it. The authorization request stores a random
 * `state` in an HttpOnly cookie scoped to the callback path, and the callback proceeds only when
 * the returned `state` matches that cookie, so a callback reaching a browser that did not start
 * the flow ends before its code is exchanged.
 */
export function createOAuthStateStore({
  provider,
  callbackURL,
  crossSiteCallback = false,
}: OAuthStateStoreOptions): OAuthStateStore {
  const cookieName = `${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    path: getCookiePath(callbackURL),
    sameSite: crossSiteCallback ? 'none' : 'lax',
    secure: crossSiteCallback || shouldUseSecureCookie(),
  };

  const reject = (callback: VerifyCallback, message: string, hasState: boolean): void => {
    logger.warn(`[OAuth] Rejected ${provider} callback: ${message}`, {
      provider,
      has_state: hasState,
    });
    callback(null, false, { message });
  };

  return {
    store(req, callback) {
      if (!req.res) {
        callback(new Error('OAuth state store requires an Express response'));
        return;
      }
      const state = crypto.randomBytes(STATE_BYTES).toString('base64url');
      req.res.cookie(cookieName, state, { ...cookieOptions, maxAge: OAUTH_STATE_MAX_AGE });
      callback(null, state);
    },

    verify(req, providedState, callback) {
      const expected = (req.cookies as Record<string, string> | undefined)?.[cookieName];
      req.res?.clearCookie(cookieName, cookieOptions);

      const hasState = typeof providedState === 'string' && providedState.length > 0;
      if (!expected) {
        reject(callback, MISSING_STATE_MESSAGE, hasState);
        return;
      }
      if (!hasState || !statesMatch(expected, providedState)) {
        reject(callback, INVALID_STATE_MESSAGE, hasState);
        return;
      }
      callback(null, true);
    },
  };
}
