import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import { extractOpenIDTokenInfo, isOpenIDTokenValid } from '~/utils/oidc';
import type { MCPOAuthTokens } from './types';

export interface OboConfig {
  scopes: string;
}

/**
 * Function type for performing OBO token exchange.
 * Injected from the main API layer since it requires OpenID configuration and caching.
 */
export type OboTokenResolver = (
  user: IUser,
  accessToken: string,
  scopes: string,
  fromCache?: boolean,
) => Promise<{ access_token: string; expires_in?: number }>;

/**
 * Performs an OBO token exchange for the given user and MCP server OBO config.
 * Returns MCPOAuthTokens suitable for injection into the MCP connection.
 */
export async function resolveOboToken(
  user: IUser,
  oboConfig: OboConfig,
  oboTokenResolver: OboTokenResolver,
): Promise<MCPOAuthTokens | null> {
  const tokenInfo = extractOpenIDTokenInfo(user);
  if (!tokenInfo || !isOpenIDTokenValid(tokenInfo)) {
    logger.warn(
      `[OBO] No valid OpenID token available for OBO exchange (provider: ${user.provider}, hasOpenidId: ${!!user.openidId}, hasFederatedTokens: ${!!user.federatedTokens})`,
    );
    return null;
  }

  if (!tokenInfo.accessToken) {
    logger.warn('[OBO] OpenID token info present but access_token is missing');
    return null;
  }

  try {
    const response = await oboTokenResolver(user, tokenInfo.accessToken, oboConfig.scopes, true);

    if (!response?.access_token) {
      logger.warn('[OBO] Token exchange did not return an access token');
      return null;
    }

    const now = Date.now();
    const expiresIn = response.expires_in ?? 3600;

    return {
      access_token: response.access_token,
      token_type: 'Bearer',
      obtained_at: now,
      expires_at: now + expiresIn * 1000,
    };
  } catch (error) {
    logger.error('[OBO] Failed to exchange token:', error);
    return null;
  }
}
