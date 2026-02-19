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
 * Generates an exchange code and stores user data for admin panel OAuth flow.
 * @param cache - The Keyv cache instance for storing exchange data
 * @param user - The authenticated user object
 * @param token - The JWT access token
 * @param refreshToken - Optional refresh token for OpenID users
 * @returns The generated exchange code
 */
export async function generateAdminExchangeCode(
  cache: Keyv,
  user: IUser,
  token: string,
  refreshToken?: string,
): Promise<string> {
  const exchangeCode = crypto.randomBytes(32).toString('hex');

  const data: AdminExchangeData = {
    userId: String(user._id),
    user: serializeUserForExchange(user),
    token,
    refreshToken,
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
 * @returns The exchange response with token, refreshToken, and user data, or null if invalid/expired
 */
export async function exchangeAdminCode(
  cache: Keyv,
  code: string,
): Promise<AdminExchangeResponse | null> {
  const data = (await cache.get(code)) as AdminExchangeData | undefined;

  /** Delete immediately - one-time use */
  await cache.delete(code);

  if (!data) {
    logger.warn('[adminExchange] Invalid or expired authorization code');
    return null;
  }

  logger.info(`[adminExchange] Exchanged code for user: ${data.user?.email}`);

  return {
    token: data.token,
    refreshToken: data.refreshToken,
    user: data.user,
  };
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
