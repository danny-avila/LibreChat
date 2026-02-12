import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';

const isProduction = process.env.NODE_ENV === 'production';

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
    secure: isProduction,
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
    secure: isProduction,
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
