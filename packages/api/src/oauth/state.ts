import crypto from 'crypto';
import { logger } from '@librechat/data-schemas';
import { DEFAULT_OAUTH_STATE_TTL_MS } from 'librechat-data-provider';
import type { CookieOptions, Request, Response } from 'express';

export const OAUTH_STATE_COOKIE_PREFIX = 'oauth_state_';

/** Browsers refuse a `__Host-` cookie that names a Domain, so a sibling subdomain cannot plant one. */
const HOST_ONLY_COOKIE_PREFIX = '__Host-';
/**
 * Flows remembered per provider, so a login started in another tab still completes. Bounded to
 * keep the cookie small; the oldest outstanding flow is dropped first.
 */
const MAX_PENDING_STATES = 3;
const STATE_BYTES = 32;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_SEPARATOR = '.';
const MISSING_STATE_MESSAGE = 'Unable to verify authorization request state.';
const INVALID_STATE_MESSAGE = 'Invalid authorization request state.';

export interface OAuthStateStoreOptions {
  /** Strategy name; names the cookie and labels rejections in logs. */
  provider: string;
  /** Whether the deployment serves `Secure` cookies; secure deployments get a `__Host-` cookie. */
  secureCookie: boolean;
  /** How long a started login may take to reach its callback. */
  maxAgeMs?: number;
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

/** A passport strategy whose `authorizationParams` may fill in a `state` of its own. */
export interface PresetStateStrategy {
  authorizationParams(options: object): { state?: string };
}

function statesMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Compares against every pending state so the match position does not change the work done. */
function findState(pending: string[], provided: string): number {
  return pending.reduce(
    (found, state, index) => (statesMatch(state, provided) && found === -1 ? index : found),
    -1,
  );
}

/**
 * Binds an OAuth login to the browser that started it. The authorization request adds a random
 * `state` to an HttpOnly cookie, and the callback proceeds only when the returned `state` is one
 * this browser holds, so a callback reaching a browser that did not start the flow ends before its
 * code is exchanged. A matched state is consumed; an unmatched callback leaves pending ones intact.
 */
export function createOAuthStateStore({
  provider,
  secureCookie,
  maxAgeMs = DEFAULT_OAUTH_STATE_TTL_MS,
  crossSiteCallback = false,
}: OAuthStateStoreOptions): OAuthStateStore {
  const secure = crossSiteCallback || secureCookie;
  const cookieName = `${secure ? HOST_ONLY_COOKIE_PREFIX : ''}${OAUTH_STATE_COOKIE_PREFIX}${provider}`;
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: crossSiteCallback ? 'none' : 'lax',
    secure,
  };

  const readPending = (req: Request): string[] => {
    const value = (req.cookies as Record<string, string> | undefined)?.[cookieName];
    return value ? value.split(STATE_SEPARATOR).filter((state) => STATE_PATTERN.test(state)) : [];
  };

  const writePending = (res: Response, pending: string[]): void => {
    if (pending.length === 0) {
      res.clearCookie(cookieName, cookieOptions);
      return;
    }
    res.cookie(cookieName, pending.join(STATE_SEPARATOR), { ...cookieOptions, maxAge: maxAgeMs });
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
      writePending(req.res, [state, ...readPending(req)].slice(0, MAX_PENDING_STATES));
      callback(null, state);
    },

    verify(req, providedState, callback) {
      const pending = readPending(req);
      const hasState = typeof providedState === 'string' && providedState.length > 0;
      if (pending.length === 0) {
        reject(callback, MISSING_STATE_MESSAGE, hasState);
        return;
      }

      const matchIndex = hasState ? findState(pending, providedState) : -1;
      if (matchIndex === -1) {
        reject(callback, INVALID_STATE_MESSAGE, hasState);
        return;
      }

      if (req.res) {
        writePending(
          req.res,
          pending.filter((_, index) => index !== matchIndex),
        );
      }
      callback(null, true);
    },
  };
}

/**
 * Leaves `state` to the configured store for strategies that fill in their own. passport-apple
 * assigns one inside `authorizationParams` (on the route's shared options, so it never changes
 * after the first request), and a preset `state` bypasses the store entirely.
 */
export function deferStateToStore(strategy: PresetStateStrategy): void {
  const authorizationParams = strategy.authorizationParams.bind(strategy);
  strategy.authorizationParams = (options) => {
    const { state: _state, ...params } = authorizationParams({ ...options });
    return params;
  };
}
