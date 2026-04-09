import crypto from 'crypto';
import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';

/** Default admin panel URL for local development */
const DEFAULT_ADMIN_PANEL_URL = 'http://localhost:3000';

/**
 * Gets the admin panel URL from environment or falls back to default.
 * @returns The admin panel URL
 */
export function getAdminPanelUrl(): string {
  return process.env.ADMIN_PANEL_URL || DEFAULT_ADMIN_PANEL_URL;
}

/**
 * User data stored in the exchange cache
 */
export interface AdminExchangeUser {
  _id: string;
  id: string;
  email: string;
  name: string;
  username: string;
  role: string;
  avatar?: string;
  provider?: string;
  openidId?: string;
}

/**
 * Data stored in cache for admin OAuth exchange
 */
export interface AdminExchangeData {
  userId: string;
  user: AdminExchangeUser;
  token: string;
  refreshToken?: string;
  origin?: string;
  codeChallenge?: string;
}

/**
 * Response from the exchange endpoint
 */
export interface AdminExchangeResponse {
  token: string;
  refreshToken?: string;
  user: AdminExchangeUser;
}

/**
 * Serializes user data for the exchange cache.
 * @param user - The authenticated user object
 * @returns Serialized user data for admin panel
 */
export function serializeUserForExchange(user: IUser): AdminExchangeUser {
  const userId = String(user._id);
  return {
    _id: userId,
    id: userId,
    email: user.email,
    name: user.name ?? '',
    username: user.username ?? '',
    role: user.role ?? 'USER',
    avatar: user.avatar,
    provider: user.provider,
    openidId: user.openidId,
  };
}

/**
 * Verifies a PKCE code_verifier against a stored code_challenge.
 * Uses hex-encoded SHA-256 comparison (not RFC 7636 S256 which uses base64url).
 * @param verifier - The code_verifier provided during exchange
 * @param challenge - The hex-encoded SHA-256 code_challenge stored during code generation
 * @returns True if the verifier matches the challenge
 */
export function verifyCodeChallenge(verifier: string, challenge: string): boolean {
  const computed = crypto.createHash('sha256').update(verifier).digest();
  const storedBuf = Buffer.from(challenge, 'hex');
  if (computed.length !== storedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(computed, storedBuf);
}

/**
 * Generates an exchange code and stores user data for admin panel OAuth flow.
 * @param cache - The Keyv cache instance for storing exchange data
 * @param user - The authenticated user object
 * @param token - The JWT access token
 * @param refreshToken - Optional refresh token for OpenID users
 * @param origin - The admin panel origin (scheme://host:port) for origin binding
 * @param codeChallenge - PKCE code_challenge (hex-encoded SHA-256 of code_verifier)
 * @returns The generated exchange code
 */
export async function generateAdminExchangeCode(
  cache: Keyv,
  user: IUser,
  token: string,
  refreshToken?: string,
  origin?: string,
  codeChallenge?: string,
): Promise<string> {
  const exchangeCode = crypto.randomBytes(32).toString('hex');

  const data: AdminExchangeData = {
    userId: String(user._id),
    user: serializeUserForExchange(user),
    token,
    refreshToken,
    origin,
    codeChallenge,
  };

  await cache.set(exchangeCode, data);

  logger.info(`[adminExchange] Generated exchange code for user: ${user.email}`);

  return exchangeCode;
}

/**
 * Exchanges an authorization code for tokens and user data.
 * The code is deleted immediately after retrieval (one-time use).
 * @param cache - The Keyv cache instance for retrieving exchange data
 * @param code - The authorization code to exchange
 * @param requestOrigin - The origin of the requesting client for origin binding
 * @param codeVerifier - PKCE code_verifier to verify against the stored code_challenge
 * @returns The exchange response with token, refreshToken, and user data, or null if invalid/expired
 */
export async function exchangeAdminCode(
  cache: Keyv,
  code: string,
  requestOrigin?: string,
  codeVerifier?: string,
): Promise<AdminExchangeResponse | null> {
  const data = (await cache.get(code)) as AdminExchangeData | undefined;

  /** Delete before validation — ensures one-time use even if subsequent checks throw */
  await cache.delete(code);

  if (!data) {
    logger.warn('[adminExchange] Invalid or expired authorization code');
    return null;
  }

  if (data.origin && data.origin !== requestOrigin) {
    logger.warn('[adminExchange] Authorization code origin mismatch');
    return null;
  }

  if (data.codeChallenge) {
    if (!codeVerifier || !verifyCodeChallenge(codeVerifier, data.codeChallenge)) {
      logger.warn('[adminExchange] PKCE code_verifier mismatch or missing');
      return null;
    }
  }

  logger.info(`[adminExchange] Exchanged code for user: ${data.user?.email}`);

  return {
    token: data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
}

/** PKCE challenge cache TTL: 5 minutes (enough for user to authenticate with IdP) */
export const PKCE_CHALLENGE_TTL = 5 * 60 * 1000;
/** Regex pattern for valid PKCE challenges: 64 hex characters (SHA-256 hex digest) */
export const PKCE_CHALLENGE_PATTERN = /^[a-f0-9]{64}$/;

/** Removes `code_challenge` from a single URL string, preserving other query params. */
const stripChallengeFromUrl = (url: string): string =>
  url.replace(/\?code_challenge=[^&]*&/, '?').replace(/[?&]code_challenge=[^&]*/, '');

/** Minimal request shape needed by {@link stripCodeChallenge}. */
export interface PkceStrippableRequest {
  query: Record<string, unknown>;
  originalUrl: string;
  url: string;
}

/**
 * Strips `code_challenge` from the request query and URL strings.
 *
 * openid-client v6's Passport Strategy uses `currentUrl.searchParams.size === 0`
 * to distinguish an initial authorization request from an OAuth callback.
 * The admin-panel-specific `code_challenge` query parameter would cause the
 * strategy to misclassify the request as a callback and return 401.
 *
 * Applied defensively to all providers to ensure the admin-panel-private
 * `code_challenge` parameter never reaches any Passport strategy.
 */
export function stripCodeChallenge(req: PkceStrippableRequest): void {
  delete req.query.code_challenge;
  req.originalUrl = stripChallengeFromUrl(req.originalUrl);
  req.url = stripChallengeFromUrl(req.url);
}

/**
 * Stores the admin-panel PKCE challenge in cache, then strips `code_challenge`
 * from the request so it doesn't interfere with the Passport strategy.
 *
 * Must be called before `passport.authenticate()` — the two operations are
 * logically atomic: read the challenge from the query, persist it, then remove
 * the parameter from the request URL.
 * @param cache - The Keyv cache instance for storing PKCE challenges.
 * @param req - The Express request to read and mutate.
 * @param state - The OAuth state value (cache key).
 * @param provider - Provider name for logging.
 * @returns True if stored (or no challenge provided); false on cache failure.
 */
export async function storeAndStripChallenge(
  cache: Keyv,
  req: PkceStrippableRequest,
  state: string,
  provider: string,
): Promise<boolean> {
  const { code_challenge: codeChallenge } = req.query;
  if (typeof codeChallenge !== 'string' || !PKCE_CHALLENGE_PATTERN.test(codeChallenge)) {
    stripCodeChallenge(req);
    return true;
  }
  try {
    await cache.set(`pkce:${state}`, codeChallenge, PKCE_CHALLENGE_TTL);
    stripCodeChallenge(req);
    return true;
  } catch (err) {
    logger.error(`[admin/oauth/${provider}] Failed to store PKCE challenge:`, err);
    return false;
  }
}

/**
 * Checks if the redirect URI is for the admin panel (cross-origin).
 * Uses proper URL parsing to compare origins, handling edge cases where
 * both URLs might share the same prefix (e.g., localhost:3000 vs localhost:3001).
 *
 * @param redirectUri - The redirect URI to check.
 * @param adminPanelUrl - The admin panel URL (defaults to ADMIN_PANEL_URL env var)
 * @param domainClient - The main client domain
 * @returns True if redirecting to admin panel (different origin from main client).
 */
export function isAdminPanelRedirect(
  redirectUri: string,
  adminPanelUrl: string,
  domainClient: string,
): boolean {
  try {
    const redirectOrigin = new URL(redirectUri).origin;
    const adminOrigin = new URL(adminPanelUrl).origin;
    const clientOrigin = new URL(domainClient).origin;

    /** Redirect is for admin panel if it matches admin origin but not main client origin */
    return redirectOrigin === adminOrigin && redirectOrigin !== clientOrigin;
  } catch {
    /** If URL parsing fails, fall back to simple string comparison */
    return redirectUri.startsWith(adminPanelUrl) && !redirectUri.startsWith(domainClient);
  }
}
