import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';

/**
 * Determines if secure cookies should be used.
 *
 * Returns `false` (insecure-allowed) in any of these cases:
 *   1. `NODE_ENV` is not `production` — typical dev setup.
 *   2. `DOMAIN_SERVER` points to localhost / 127.0.0.1 / ::1 / *.localhost —
 *      local Docker Compose behind a non-HTTPS dev proxy.
 *   3. `DOMAIN_SERVER` uses the `http://` scheme explicitly — operator has
 *      opted into a plain-HTTP deployment (e.g. LAN-only pilot, behind a
 *      separate TLS terminator that rewrites the scheme, or intranet IP
 *      deployments like `http://10.x.x.x/`). Browsers drop `Secure` cookies
 *      on HTTP connections, so emitting them guarantees broken refresh.
 *
 * Returns `true` otherwise (HTTPS production).
 */
export function shouldUseSecureCookie(): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return false;

  const domainServer = process.env.DOMAIN_SERVER || '';

  let hostname = '';
  let protocol = '';
  if (domainServer) {
    try {
      const normalized = /^https?:\/\//i.test(domainServer)
        ? domainServer
        : `http://${domainServer}`;
      const url = new URL(normalized);
      hostname = (url.hostname || '').toLowerCase();
      // Only trust the protocol when the operator wrote it explicitly;
      // inferring `http:` when they omitted the scheme would surprise
      // HTTPS deployments that relied on the previous default.
      if (/^https?:\/\//i.test(domainServer)) {
        protocol = url.protocol;
      }
    } catch {
      hostname = domainServer.toLowerCase();
    }
  }

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');

  if (isLocalhost) return false;
  if (protocol === 'http:') return false;

  return true;
}

/** Generates an HMAC-based token for OAuth CSRF protection */
export function generateOAuthCsrfToken(flowId: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('JWT_SECRET is required for OAuth CSRF token generation');
  }
  return crypto.createHmac('sha256', key).update(flowId).digest('hex').slice(0, 32);
}

/** Sets a SameSite=Lax CSRF cookie bound to a specific OAuth flow */
export function setOAuthCsrfCookie(res: Response, flowId: string, cookiePath: string): void {
  res.cookie(OAUTH_CSRF_COOKIE, generateOAuthCsrfToken(flowId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_CSRF_MAX_AGE,
    path: cookiePath,
  });
}

/**
 * Validates the per-flow CSRF cookie against the expected HMAC.
 * Uses timing-safe comparison and always clears the cookie to prevent replay.
 */
export function validateOAuthCsrf(
  req: Request,
  res: Response,
  flowId: string,
  cookiePath: string,
): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_CSRF_COOKIE];
  res.clearCookie(OAUTH_CSRF_COOKIE, { path: cookiePath });
  if (!cookie) {
    return false;
  }
  const expected = generateOAuthCsrfToken(flowId);
  if (cookie.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}

/**
 * Express middleware that sets the OAuth session cookie after JWT authentication.
 * Chain after requireJwtAuth on routes that precede an OAuth redirect (e.g., reinitialize, bind).
 */
export function setOAuthSession(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id?: string } }).user;
  if (user?.id && !(req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE]) {
    setOAuthSessionCookie(res, user.id);
  }
  next();
}

/** Sets a SameSite=Lax session cookie that binds the browser to the authenticated userId */
export function setOAuthSessionCookie(res: Response, userId: string): void {
  res.cookie(OAUTH_SESSION_COOKIE, generateOAuthCsrfToken(userId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_SESSION_MAX_AGE,
    path: OAUTH_SESSION_COOKIE_PATH,
  });
}

/** Validates the session cookie against the expected userId using timing-safe comparison */
export function validateOAuthSession(req: Request, userId: string): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE];
  if (!cookie) {
    return false;
  }
  const expected = generateOAuthCsrfToken(userId);
  if (cookie.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
