import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';

const OAUTH_SESSION_TOKEN_BYTES = 32;
const OAUTH_TOKEN_NONCE_BYTES = 12;
const OAUTH_TOKEN_TAG_BYTES = 16;
const OAUTH_KEY_DERIVATION_SALT = 'librechat:oauth:cookie:v1';

type OAuthEncryptedPayload = {
  uid?: string;
  fid?: string;
  iat?: number;
  exp: number;
  nonce: string;
};

function getOAuthSessionSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for OAuth session token generation');
  }
  return secret;
}

function getOAuthEncryptionKey(): Buffer {
  return crypto.scryptSync(getOAuthSessionSecret(), OAUTH_KEY_DERIVATION_SALT, 32);
}

function encryptOAuthPayload(payload: OAuthEncryptedPayload): string {
  const iv = crypto.randomBytes(OAUTH_TOKEN_NONCE_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getOAuthEncryptionKey(), iv);
  const encodedPayload = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(encodedPayload, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
}

function decryptOAuthPayload(token: string): OAuthEncryptedPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [ivBase64Url, payloadBase64Url, authTagBase64Url] = parts;
  if (!ivBase64Url || !payloadBase64Url || !authTagBase64Url) {
    return null;
  }

  let iv: Buffer;
  let encryptedPayload: Buffer;
  let authTag: Buffer;

  try {
    iv = Buffer.from(ivBase64Url, 'base64url');
    encryptedPayload = Buffer.from(payloadBase64Url, 'base64url');
    authTag = Buffer.from(authTagBase64Url, 'base64url');
  } catch {
    return null;
  }

  if (iv.length !== OAUTH_TOKEN_NONCE_BYTES || authTag.length !== OAUTH_TOKEN_TAG_BYTES) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getOAuthEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decryptedPayload = Buffer.concat([
      decipher.update(encryptedPayload),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(decryptedPayload) as OAuthEncryptedPayload;
  } catch {
    return null;
  }
}

/**
 * Determines if secure cookies should be used.
 * Returns `true` in production unless the server is running on localhost (HTTP).
 * This allows cookies to work on `http://localhost` during local development
 * even when `NODE_ENV=production` (common in Docker Compose setups).
 */
export function shouldUseSecureCookie(): boolean {
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

/** Generates an encrypted token for OAuth CSRF protection */
export function generateOAuthCsrfToken(flowId: string): string {
  return encryptOAuthPayload({
    fid: flowId,
    exp: Date.now() + OAUTH_CSRF_MAX_AGE,
    nonce: crypto.randomBytes(OAUTH_TOKEN_NONCE_BYTES).toString('base64url'),
  });
}

/** Sets a SameSite=Lax CSRF cookie bound to a specific OAuth flow */
export function setOAuthCsrfCookie(res: Response, flowId: string, cookiePath: string): void {
  // codeql[js/clear-text-storage-sensitive-data]: cookie payload is encrypted with AES-256-GCM.
  res.cookie(OAUTH_CSRF_COOKIE, generateOAuthCsrfToken(flowId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_CSRF_MAX_AGE,
    path: cookiePath,
  });
}

/**
 * Validates the per-flow CSRF cookie against the expected OAuth flow.
 * Always clears the cookie to prevent replay.
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

  const payload = decryptOAuthPayload(cookie);
  if (!payload || payload.fid !== flowId || typeof payload.exp !== 'number') {
    return false;
  }

  return Date.now() <= payload.exp;
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

/** Creates an encrypted OAuth session token bound to a user ID with expiration */
export function generateOAuthSessionToken(
  userId: string,
  maxAge: number = OAUTH_SESSION_MAX_AGE,
): string {
  const issuedAt = Date.now();
  return encryptOAuthPayload({
    uid: userId,
    iat: issuedAt,
    exp: issuedAt + maxAge,
    nonce: crypto.randomBytes(OAUTH_SESSION_TOKEN_BYTES).toString('base64url'),
  });
}

/** Sets a SameSite=Lax session cookie that binds the browser to the authenticated userId */
export function setOAuthSessionCookie(res: Response, userId: string): void {
  // codeql[js/clear-text-storage-sensitive-data]: cookie payload is encrypted with AES-256-GCM.
  res.cookie(OAUTH_SESSION_COOKIE, generateOAuthSessionToken(userId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_SESSION_MAX_AGE,
    path: OAUTH_SESSION_COOKIE_PATH,
  });
}

/** Validates the encrypted session cookie against the expected userId */
export function validateOAuthSession(req: Request, userId: string): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE];
  if (!cookie) {
    return false;
  }

  const payload = decryptOAuthPayload(cookie);
  if (!payload || payload.uid !== userId || typeof payload.exp !== 'number') {
    return false;
  }

  return Date.now() <= payload.exp;
}
