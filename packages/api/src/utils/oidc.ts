import { logger } from '@librechat/data-schemas';
import type { IUser, OIDCTokens } from '@librechat/data-schemas';

export interface OpenIDTokenInfo {
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
  idTokenExpiresAt?: number;
  userId?: string;
  userEmail?: string;
  userName?: string;
  claims?: Record<string, unknown>;
}

function isFederatedTokens(obj: unknown): obj is OIDCTokens {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  return 'access_token' in obj || 'id_token' in obj || 'expires_at' in obj;
}

export const OPENID_TOKEN_FIELDS = [
  'ACCESS_TOKEN',
  'ID_TOKEN',
  'USER_ID',
  'USER_EMAIL',
  'USER_NAME',
  'EXPIRES_AT',
] as const;

/**
 * Placeholder for Microsoft Graph API access token.
 * This placeholder is resolved asynchronously via OBO (On-Behalf-Of) flow
 * and requires special handling outside the synchronous processMCPEnv pipeline.
 */
export const GRAPH_TOKEN_PLACEHOLDER = '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';

/**
 * Default Microsoft Graph API scopes for OBO token exchange.
 * Can be overridden via GRAPH_API_SCOPES environment variable.
 */
export const DEFAULT_GRAPH_SCOPES = 'https://graph.microsoft.com/.default';

/** Shared with AuthController's OpenID session reuse check: a token within the buffer would expire in transit and 401 downstream */
export const OPENID_EXPIRY_BUFFER_SECONDS = 30;

/** Claims consulted when deciding whether a verified JWT is an access token rather than an ID token. */
export interface JwtTypeClaims {
  aud?: string | string[];
  scp?: unknown;
  scope?: unknown;
  at_hash?: unknown;
  c_hash?: unknown;
}

/** RFC 9068 media type for a JWT access token, as it appears in the `typ` header (compared case-insensitively). */
const ACCESS_TOKEN_JWT_TYPES = new Set(['at+jwt', 'application/at+jwt']);

function decodeJwtHeaderType(token: string): string | undefined {
  try {
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    return typeof header?.typ === 'string' ? header.typ.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function audienceList(aud: string | string[] | undefined): string[] {
  if (typeof aud === 'string') {
    return [aud];
  }
  return Array.isArray(aud) ? aud : [];
}

/**
 * Decides whether a verified bearer JWT is an OAuth 2.0 access token, so it may stand in for a
 * stored access token. Passing this strategy's audience check does not settle the question: an
 * OIDC ID token is minted for the client id and satisfies the same check, and using one as the
 * On-Behalf-Of assertion is rejected by the IdP (Entra answers `AADSTS240002`).
 *
 * Only positive evidence qualifies a token, so an unrecognised shape fails closed rather than
 * risking a mis-typed assertion:
 * - an RFC 9068 `at+jwt` header type,
 * - an OAuth scope claim (`scp` or `scope`), which OIDC does not define for an ID token,
 * - an audience naming a protected resource rather than the OIDC client.
 *
 * `at_hash` and `c_hash` veto regardless, since they exist only to bind an ID token to its
 * companion access token or code. `nonce` and `auth_time` are deliberately not vetoes: some
 * providers (Keycloak) have emitted them in genuine access tokens.
 */
export function isAccessTokenJwt(
  token: string | undefined,
  claims: JwtTypeClaims | undefined,
  resourceAudiences?: ReadonlySet<string>,
): boolean {
  if (!token || !claims) {
    return false;
  }

  if (claims.at_hash != null || claims.c_hash != null) {
    return false;
  }

  if (claims.scp != null || claims.scope != null) {
    return true;
  }

  const headerType = decodeJwtHeaderType(token);
  if (headerType != null && ACCESS_TOKEN_JWT_TYPES.has(headerType)) {
    return true;
  }

  if (!resourceAudiences?.size) {
    return false;
  }

  return audienceList(claims.aud).some((audience) => resourceAudiences.has(audience));
}

/**
 * Signals that the stored OpenID credentials cannot satisfy a placeholder, so the user must
 * re-authenticate. `ErrorController` maps this to a 401, and `statusCode` additionally lets
 * status-reading callers (the agent generation path's `getInitializationFailure`) answer 401
 * instead of a bare 500. Deliberately carries no `body`, so the structural `isCustomError`
 * guard cannot capture it ahead of the explicit mapping.
 */
export class OpenIDReauthRequiredError extends Error {
  readonly statusCode = 401;

  constructor(message: string) {
    super(message);
    this.name = 'OpenIDReauthRequiredError';
  }
}

export function extractOpenIDTokenInfo(
  user: Partial<IUser> | null | undefined,
): OpenIDTokenInfo | null {
  if (!user) {
    return null;
  }

  try {
    if (user.provider !== 'openid' && !user.openidId) {
      return null;
    }

    const tokenInfo: OpenIDTokenInfo = {};

    const federated = user.federatedTokens;
    const openid = user.openidTokens;

    if (federated && isFederatedTokens(federated)) {
      logger.debug('[extractOpenIDTokenInfo] Found federatedTokens:', {
        has_access_token: !!federated.access_token,
        has_id_token: !!federated.id_token,
        has_refresh_token: !!federated.refresh_token,
        expires_at: federated.expires_at,
      });
      tokenInfo.accessToken = federated.access_token;
      tokenInfo.idToken = federated.id_token;
      tokenInfo.expiresAt = federated.expires_at;
    } else if (openid && isFederatedTokens(openid)) {
      logger.debug('[extractOpenIDTokenInfo] Found openidTokens');
      tokenInfo.accessToken = openid.access_token;
      tokenInfo.idToken = openid.id_token;
      tokenInfo.expiresAt = openid.expires_at;
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

        /** Cached profile claims, not an authentication assertion: stale claims stay usable for identity fields even when the ID token itself is expired */
        if (payload.sub) tokenInfo.userId = payload.sub;
        if (payload.email) tokenInfo.userEmail = payload.email;
        if (payload.name) tokenInfo.userName = payload.name;
        if (typeof payload.exp === 'number') {
          tokenInfo.idTokenExpiresAt = payload.exp;
        }
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

/** Advisory freshness check, not a security boundary: the ID token signature is not verified here. `exp` is REQUIRED in an ID token, so a missing value means the token is malformed or unparseable and fails closed. */
function isIdTokenCurrent(tokenInfo: OpenIDTokenInfo): boolean {
  if (tokenInfo.idTokenExpiresAt == null) {
    return false;
  }
  return Math.floor(Date.now() / 1000) < tokenInfo.idTokenExpiresAt - OPENID_EXPIRY_BUFFER_SECONDS;
}

export function isOpenIDTokenValid(tokenInfo: OpenIDTokenInfo | null): boolean {
  if (!tokenInfo || !tokenInfo.accessToken) {
    return false;
  }

  if (tokenInfo.expiresAt != null) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokenInfo.expiresAt - OPENID_EXPIRY_BUFFER_SECONDS) {
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
        if (!tokenInfo.idToken || !isIdTokenCurrent(tokenInfo)) {
          logger.warn('OpenID ID token is expired or unavailable; re-authentication is required');
          throw new OpenIDReauthRequiredError(
            'OpenID ID token is expired or unavailable; re-authentication is required to resolve {{LIBRECHAT_OPENID_ID_TOKEN}}',
          );
        }
        replacementValue = tokenInfo.idToken;
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
        /** The stored token-set expires_at only: the ID token exp never stands in for it */
        replacementValue = tokenInfo.expiresAt != null ? String(tokenInfo.expiresAt) : '';
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
