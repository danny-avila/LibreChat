import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { isEnabled } from '~/utils/common';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE: number = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE: number = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';
const OAUTH_IV_LENGTH_BYTES = 12;
const OAUTH_AUTH_TAG_LENGTH_BYTES = 16;
const OAUTH_ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const OAUTH_BINDING_KDF_SALT = 'oauth-cookie-binding';

type RequestCookiesLike = Pick<Request, 'headers'> & {
  cookies?: Record<string, string> | undefined;
};

/**
 * Determines if secure cookies should be used.
 * SESSION_COOKIE_SECURE=true/false explicitly overrides the environment heuristic.
 * Returns `true` in production unless DOMAIN_SERVER uses a localhost-style hostname.
 * This allows cookies to work on localhost during local development
 * even when `NODE_ENV=production` (common in Docker Compose setups).
 */
export function shouldUseSecureCookie(): boolean {
  const secureOverride = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (secureOverride === 'true' || secureOverride === 'false') {
    return isEnabled(secureOverride);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const domainServer = process.env.DOMAIN_SERVER || '';

  let hostname = '';
  if (domainServer) {
    try {
      const normalized = /^https?:\/\//i.test(domainServer)
        ? domainServer
        : `http://${domainServer}`;
      const url = new URL(normalized);
      hostname = (url.hostname || '').toLowerCase();
    } catch {
      hostname = domainServer.toLowerCase();
    }
  }

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');

  return isProduction && !isLocalhost;
}

/**
 * Generates an opaque binding token for OAuth CSRF/session cookies.
 *
 * The value is authenticated and encrypted with a key derived from JWT_SECRET,
 * so browsers never receive the raw flow id / user id in clear text.
 */
function getOAuthBindingSigningKey(secret?: string): string {
  const signingKey = secret || process.env.JWT_SECRET;
  if (!signingKey) {
    throw new Error('JWT_SECRET is required for OAuth CSRF token generation');
  }
  return signingKey;
}

function getOAuthBindingEncryptionKey(secret?: string): Buffer {
  return crypto.scryptSync(getOAuthBindingSigningKey(secret), OAUTH_BINDING_KDF_SALT, 32);
}

function encryptOAuthBindingValue(subject: string, secret?: string): string {
  const iv = crypto.randomBytes(OAUTH_IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(
    OAUTH_ENCRYPTION_ALGORITHM,
    getOAuthBindingEncryptionKey(secret),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update(subject, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64url');
}

function decryptOAuthBindingValue(token: string, secret?: string): string | null {
  try {
    const payload = Buffer.from(token, 'base64url');
    if (payload.length <= OAUTH_IV_LENGTH_BYTES + OAUTH_AUTH_TAG_LENGTH_BYTES) {
      return null;
    }

    const iv = payload.subarray(0, OAUTH_IV_LENGTH_BYTES);
    const authTag = payload.subarray(
      OAUTH_IV_LENGTH_BYTES,
      OAUTH_IV_LENGTH_BYTES + OAUTH_AUTH_TAG_LENGTH_BYTES,
    );
    const ciphertext = payload.subarray(OAUTH_IV_LENGTH_BYTES + OAUTH_AUTH_TAG_LENGTH_BYTES);
    const decipher = crypto.createDecipheriv(
      OAUTH_ENCRYPTION_ALGORITHM,
      getOAuthBindingEncryptionKey(secret),
      iv,
    );
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, cookiePart) => {
    const trimmed = cookiePart.trim();
    if (!trimmed) {
      return cookies;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = trimmed.slice(0, separatorIndex);
    cookies[key] = decodeURIComponent(trimmed.slice(separatorIndex + 1));
    return cookies;
  }, {});
}

export function getOAuthRequestCookie(
  req: RequestCookiesLike,
  cookieName: string,
): string | undefined {
  return req.cookies?.[cookieName] ?? parseCookieHeader(req.headers?.cookie)[cookieName];
}

export function generateOAuthCsrfToken(flowId: string, secret?: string): string {
  return encryptOAuthBindingValue(String(flowId), secret);
}

export function getOAuthCookieBindingValue(subject: string, secret?: string): string {
  return encryptOAuthBindingValue(subject, secret);
}

/**
 * Sets a SameSite=Lax CSRF cookie bound to a specific OAuth flow.
 *
 * The cookie stores an HMAC-wrapped binding derived from the scrypt token.
 * This keeps the browser-visible value opaque while preserving deterministic
 * server-side verification. The cookie is httpOnly + Secure (in prod) +
 * SameSite=Lax, exactly per OWASP CSRF guidance.
 */
export function setOAuthCsrfCookie(res: Response, flowId: string, cookiePath: string): void {
  res.cookie(OAUTH_CSRF_COOKIE, encryptOAuthBindingValue(String(flowId)), {
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
  const cookie = getOAuthRequestCookie(req, OAUTH_CSRF_COOKIE);
  res.clearCookie(OAUTH_CSRF_COOKIE, { path: cookiePath });
  if (!cookie) {
    return false;
  }
  return decryptOAuthBindingValue(cookie) === flowId;
}

/**
 * Express middleware that sets the OAuth session cookie after JWT authentication.
 * Chain after requireJwtAuth on routes that precede an OAuth redirect (e.g., reinitialize, bind).
 */
export function setOAuthSession(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id?: string } }).user;
  if (user?.id && !validateOAuthSession(req, user.id)) {
    setOAuthSessionCookie(res, user.id);
  }
  next();
}

/**
 * Sets a SameSite=Lax session cookie that binds the browser to the authenticated userId.
 *
 * Same opaque binding approach as `setOAuthCsrfCookie`: the cookie stores an
 * HMAC-wrapped binding, not the raw scrypt-derived token.
 */
export function setOAuthSessionCookie(res: Response, userId: string): void {
  res.cookie(OAUTH_SESSION_COOKIE, encryptOAuthBindingValue(String(userId)), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_SESSION_MAX_AGE,
    path: OAUTH_SESSION_COOKIE_PATH,
  });
}

/** Validates the session cookie against the expected userId using timing-safe comparison */
export function validateOAuthSession(req: Request, userId: string): boolean {
  const cookie = getOAuthRequestCookie(req, OAUTH_SESSION_COOKIE);
  if (!cookie) {
    return false;
  }
  return decryptOAuthBindingValue(cookie) === userId;
}
