import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';

export interface OpenIDTokenInfo {
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
  userId?: string;
  userEmail?: string;
  userName?: string;
  claims?: Record<string, unknown>;
}

interface FederatedTokens {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

function isFederatedTokens(obj: unknown): obj is FederatedTokens {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  return 'access_token' in obj || 'id_token' in obj || 'expires_at' in obj;
}

const OPENID_TOKEN_FIELDS = [
  'ACCESS_TOKEN',
  'ID_TOKEN',
  'USER_ID',
  'USER_EMAIL',
  'USER_NAME',
  'EXPIRES_AT',
] as const;

export function extractOpenIDTokenInfo(user: IUser | null | undefined): OpenIDTokenInfo | null {
  if (!user) {
    return null;
  }

  try {
    if (user.provider !== 'openid' && !user.openidId) {
      return null;
    }

    const tokenInfo: OpenIDTokenInfo = {};

    if ('federatedTokens' in user && isFederatedTokens(user.federatedTokens)) {
      const tokens = user.federatedTokens;
      logger.debug('[extractOpenIDTokenInfo] Found federatedTokens:', {
        has_access_token: !!tokens.access_token,
        has_id_token: !!tokens.id_token,
        has_refresh_token: !!tokens.refresh_token,
        expires_at: tokens.expires_at,
      });
      tokenInfo.accessToken = tokens.access_token;
      tokenInfo.idToken = tokens.id_token;
      tokenInfo.expiresAt = tokens.expires_at;
    } else if ('openidTokens' in user && isFederatedTokens(user.openidTokens)) {
      const tokens = user.openidTokens;
      logger.debug('[extractOpenIDTokenInfo] Found openidTokens');
      tokenInfo.accessToken = tokens.access_token;
      tokenInfo.idToken = tokens.id_token;
      tokenInfo.expiresAt = tokens.expires_at;
    }

    tokenInfo.userId = user.openidId || user.id;
    tokenInfo.userEmail = user.email;
    tokenInfo.userName = user.name || user.username;

    if (tokenInfo.idToken) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenInfo.idToken.split('.')[1], 'base64').toString(),
        );
        tokenInfo.claims = payload;

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
    logger.error('Error extracting OpenID token info:', error);
    return null;
  }
}

export function isOpenIDTokenValid(tokenInfo: OpenIDTokenInfo | null): boolean {
  if (!tokenInfo || !tokenInfo.accessToken) {
    return false;
  }

  if (tokenInfo.expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokenInfo.expiresAt) {
      logger.warn('OpenID token has expired');
      return false;
    }
  }

  return true;
}

export function processOpenIDPlaceholders(
  value: string,
  tokenInfo: OpenIDTokenInfo | null,
): string {
  if (!tokenInfo || typeof value !== 'string') {
    return value;
  }

  let processedValue = value;

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

  const genericPlaceholder = '{{LIBRECHAT_OPENID_TOKEN}}';
  if (processedValue.includes(genericPlaceholder)) {
    const replacementValue = tokenInfo.accessToken || '';
    processedValue = processedValue.replace(new RegExp(genericPlaceholder, 'g'), replacementValue);
  }

  return processedValue;
}

export function createBearerAuthHeader(tokenInfo: OpenIDTokenInfo | null): string {
  if (!tokenInfo || !tokenInfo.accessToken) {
    return '';
  }

  return `Bearer ${tokenInfo.accessToken}`;
}

export function isOpenIDAvailable(): boolean {
  const openidClientId = process.env.OPENID_CLIENT_ID;
  const openidClientSecret = process.env.OPENID_CLIENT_SECRET;
  const openidIssuer = process.env.OPENID_ISSUER;

  return !!(openidClientId && openidClientSecret && openidIssuer);
}
