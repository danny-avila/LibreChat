import { logger } from '@librechat/data-schemas';
import type { TUser } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';

/**
 * OIDC token management utilities for LibreChat
 * Handles extraction and validation of OIDC Bearer tokens for downstream service integration
 */

/**
 * Interface for OpenID Connect federated provider token information
 * These tokens are issued directly by federated providers (Cognito, Azure AD, etc.)
 */
export interface OpenIDTokenInfo {
  /** The raw access token from federated provider */
  accessToken?: string;
  /** The ID token with user claims from federated provider */
  idToken?: string;
  /** Token expiration timestamp */
  expiresAt?: number;
  /** User ID from federated provider token (subject claim) */
  userId?: string;
  /** User email from federated provider token */
  userEmail?: string;
  /** User name from federated provider token */
  userName?: string;
  /** Raw token claims from federated provider */
  claims?: Record<string, unknown>;
}

/**
 * List of OpenID Connect federated provider fields that can be used in template variables.
 * These fields are derived from tokens issued by federated providers (Cognito, Azure AD, etc.).
 */
const OPENID_TOKEN_FIELDS = [
  'ACCESS_TOKEN',
  'ID_TOKEN',
  'USER_ID',
  'USER_EMAIL',
  'USER_NAME',
  'EXPIRES_AT',
] as const;

type OpenIDTokenField = (typeof OPENID_TOKEN_FIELDS)[number];

/**
 * Extracts OpenID Connect federated provider token information from a user object
 * @param user - The user object containing federated provider session data
 * @returns OpenID token information or null if not available
 */
export function extractOpenIDTokenInfo(user: IUser | TUser | null | undefined): OpenIDTokenInfo | null {
  if (!user) {
    return null;
  }

  try {
    // Check if user authenticated via OpenID Connect federated provider
    if (user.provider !== 'openid' && !user.openidId) {
      return null;
    }

    const tokenInfo: OpenIDTokenInfo = {};

    // Extract federated provider tokens from user session
    // These are the actual tokens issued by Cognito, Azure AD, Auth0, etc.

    // Check for stored federated provider tokens in user object
    if ('federatedTokens' in user && user.federatedTokens) {
      const tokens = user.federatedTokens as any;
      tokenInfo.accessToken = tokens.access_token;
      tokenInfo.idToken = tokens.id_token;
      tokenInfo.expiresAt = tokens.expires_at;
    } else if ('openidTokens' in user && user.openidTokens) {
      // Alternative storage location for federated tokens
      const tokens = user.openidTokens as any;
      tokenInfo.accessToken = tokens.access_token;
      tokenInfo.idToken = tokens.id_token;
      tokenInfo.expiresAt = tokens.expires_at;
    }

    // Extract user info from federated provider claims or user object
    // For Cognito, this would be the 'sub' claim from the JWT
    tokenInfo.userId = user.openidId || user.id;
    tokenInfo.userEmail = user.email;
    tokenInfo.userName = user.name || user.username;

    // If we have an ID token, try to extract additional claims
    if (tokenInfo.idToken) {
      try {
        // Parse JWT claims (without verification - for claim extraction only)
        const payload = JSON.parse(Buffer.from(tokenInfo.idToken.split('.')[1], 'base64').toString());
        tokenInfo.claims = payload;

        // Override with claims from ID token if available
        if (payload.sub) tokenInfo.userId = payload.sub;
        if (payload.email) tokenInfo.userEmail = payload.email;
        if (payload.name) tokenInfo.userName = payload.name;
        if (payload.exp) tokenInfo.expiresAt = payload.exp;
      } catch (jwtError) {
        logger.warn('Could not parse ID token claims:', jwtError);
      }
    }

    return tokenInfo;
  } catch (error) {
    logger.error('Error extracting OpenID federated provider token info:', error);
    return null;
  }
}

/**
 * Checks if an OpenID Connect federated provider token is valid and not expired
 * @param tokenInfo - The OpenID token information
 * @returns true if token is valid, false otherwise
 */
export function isOpenIDTokenValid(tokenInfo: OpenIDTokenInfo | null): boolean {
  if (!tokenInfo || !tokenInfo.accessToken) {
    return false;
  }

  // Check token expiration
  if (tokenInfo.expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokenInfo.expiresAt) {
      logger.warn('OpenID federated provider token has expired');
      return false;
    }
  }

  return true;
}

/**
 * Processes OpenID Connect federated provider token placeholders in a string value
 * @param value - The string value to process
 * @param tokenInfo - The OpenID token information from federated provider
 * @returns The processed string with OpenID placeholders replaced
 */
export function processOpenIDPlaceholders(value: string, tokenInfo: OpenIDTokenInfo | null): string {
  if (!tokenInfo || typeof value !== 'string') {
    return value;
  }

  let processedValue = value;

  // Replace OpenID federated provider token placeholders
  for (const field of OPENID_TOKEN_FIELDS) {
    const placeholder = `{{LIBRECHAT_OPENID_${field}}}`;
    if (!processedValue.includes(placeholder)) {
      continue;
    }

    let replacementValue = '';

    switch (field) {
      case 'ACCESS_TOKEN':
        replacementValue = tokenInfo.accessToken || '';
        break;
      case 'ID_TOKEN':
        replacementValue = tokenInfo.idToken || '';
        break;
      case 'USER_ID':
        replacementValue = tokenInfo.userId || '';
        break;
      case 'USER_EMAIL':
        replacementValue = tokenInfo.userEmail || '';
        break;
      case 'USER_NAME':
        replacementValue = tokenInfo.userName || '';
        break;
      case 'EXPIRES_AT':
        replacementValue = tokenInfo.expiresAt ? String(tokenInfo.expiresAt) : '';
        break;
    }

    processedValue = processedValue.replace(new RegExp(placeholder, 'g'), replacementValue);
  }

  // Handle generic OpenID token placeholder (defaults to access token)
  const genericPlaceholder = '{{LIBRECHAT_OPENID_TOKEN}}';
  if (processedValue.includes(genericPlaceholder)) {
    const replacementValue = tokenInfo.accessToken || '';
    processedValue = processedValue.replace(new RegExp(genericPlaceholder, 'g'), replacementValue);
  }

  return processedValue;
}

/**
 * Creates Authorization header value with Bearer token from federated provider
 * @param tokenInfo - The OpenID token information from federated provider
 * @returns Authorization header value or empty string if no token
 */
export function createBearerAuthHeader(tokenInfo: OpenIDTokenInfo | null): string {
  if (!tokenInfo || !tokenInfo.accessToken) {
    return '';
  }

  return `Bearer ${tokenInfo.accessToken}`;
}

/**
 * Validates that OpenID Connect federated provider is properly configured and available
 * @returns true if OpenID Connect is available, false otherwise
 */
export function isOpenIDAvailable(): boolean {
  // Check if OpenID Connect federated provider is enabled in the environment
  const openidClientId = process.env.OPENID_CLIENT_ID;
  const openidClientSecret = process.env.OPENID_CLIENT_SECRET;
  const openidIssuer = process.env.OPENID_ISSUER;

  return !!(openidClientId && openidClientSecret && openidIssuer);
}