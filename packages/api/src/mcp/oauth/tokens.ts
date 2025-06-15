import { logger } from '@librechat/data-schemas';
import type { OAuthTokens, OAuthClientInformation } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens, ExtendedOAuthTokens } from './types';
import { encryptV2, decryptV2 } from '~/crypto';
import { isSystemUserId } from '~/mcp/enum';

interface StoreTokensParams {
  userId: string;
  serverName: string;
  tokens: OAuthTokens | ExtendedOAuthTokens | MCPOAuthTokens;
  createToken: TokenMethods['createToken'];
  clientInfo?: OAuthClientInformation;
}

interface GetTokensParams {
  userId: string;
  serverName: string;
  findToken: TokenMethods['findToken'];
  refreshTokens?: (
    refreshToken: string,
    metadata: { userId: string; serverName: string; identifier: string },
  ) => Promise<MCPOAuthTokens>;
  updateToken?: TokenMethods['updateToken'];
}

interface UpdateTokensParams {
  userId: string;
  serverName: string;
  tokens: OAuthTokens | ExtendedOAuthTokens | MCPOAuthTokens;
  updateToken: TokenMethods['updateToken'];
}

interface DeleteTokensParams {
  userId: string;
  serverName: string;
  updateToken: TokenMethods['updateToken'];
}

export class MCPTokenStorage {
  /**
   * Stores OAuth tokens for an MCP server
   */
  static async storeTokens({
    userId,
    serverName,
    tokens,
    createToken,
    clientInfo,
  }: StoreTokensParams): Promise<void> {
    try {
      const identifier = `mcp:${serverName}`;
      const userType = isSystemUserId(userId) ? 'app-level connection' : `user ${userId}`;

      // Encrypt and store access token
      const encryptedAccessToken = await encryptV2(tokens.access_token);

      logger.debug(
        `[MCPTokenStorage] Token expires_in: ${'expires_in' in tokens ? tokens.expires_in : 'N/A'}, expires_at: ${'expires_at' in tokens ? tokens.expires_at : 'N/A'}`,
      );

      // Handle both expires_in and expires_at formats
      let accessTokenExpiry: Date;
      if ('expires_at' in tokens && tokens.expires_at) {
        /** MCPOAuthTokens format - already has calculated expiry */
        logger.debug(`[MCPTokenStorage] Using expires_at for ${serverName}: ${tokens.expires_at}`);
        accessTokenExpiry = new Date(tokens.expires_at);
      } else if (tokens.expires_in) {
        /** Standard OAuthTokens format - calculate expiry */
        logger.debug(`[MCPTokenStorage] Using expires_in for ${serverName}: ${tokens.expires_in}`);
        accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      } else {
        /** No expiry provided - default to 1 year */
        logger.debug(`[MCPTokenStorage] No expiry provided for ${serverName}, using default`);
        accessTokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      logger.debug(`[MCPTokenStorage] Calculated expiry date: ${accessTokenExpiry.toISOString()}`);
      logger.debug(
        `[MCPTokenStorage] Date object: ${JSON.stringify({
          time: accessTokenExpiry.getTime(),
          valid: !isNaN(accessTokenExpiry.getTime()),
          iso: accessTokenExpiry.toISOString(),
        })}`,
      );

      // Ensure the date is valid before passing to createToken
      if (isNaN(accessTokenExpiry.getTime())) {
        logger.error(`[MCPTokenStorage] Invalid expiry date calculated, using default`);
        accessTokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      // Calculate expiresIn (seconds from now)
      const expiresIn = Math.floor((accessTokenExpiry.getTime() - Date.now()) / 1000);

      await createToken({
        userId,
        type: 'mcp_oauth',
        identifier,
        token: encryptedAccessToken,
        expiresIn: expiresIn > 0 ? expiresIn : 365 * 24 * 60 * 60, // Default to 1 year if negative
      });

      // Store refresh token if available
      if (tokens.refresh_token) {
        const encryptedRefreshToken = await encryptV2(tokens.refresh_token);
        const extendedTokens = tokens as ExtendedOAuthTokens;
        const refreshTokenExpiry = extendedTokens.refresh_token_expires_in
          ? new Date(Date.now() + extendedTokens.refresh_token_expires_in * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year

        /** Calculated expiresIn for refresh token */
        const refreshExpiresIn = Math.floor((refreshTokenExpiry.getTime() - Date.now()) / 1000);

        await createToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
          token: encryptedRefreshToken,
          expiresIn: refreshExpiresIn > 0 ? refreshExpiresIn : 365 * 24 * 60 * 60,
        });
      }

      /** Store client information if provided */
      if (clientInfo) {
        logger.debug(`[MCPTokenStorage] Storing client info for ${serverName}:`, {
          client_id: clientInfo.client_id,
          has_client_secret: !!clientInfo.client_secret,
        });
        const encryptedClientInfo = await encryptV2(JSON.stringify(clientInfo));
        await createToken({
          userId,
          type: 'mcp_oauth_client',
          identifier: `${identifier}:client`,
          token: encryptedClientInfo,
          expiresIn: 365 * 24 * 60 * 60,
        });
      }

      logger.debug(`[MCPTokenStorage] Stored OAuth tokens for ${userType}, server ${serverName}`);
    } catch (error) {
      logger.error('[MCPTokenStorage] Failed to store tokens', { error, userId, serverName });
      throw error;
    }
  }

  /**
   * Retrieves OAuth tokens for an MCP server
   */
  static async getTokens({
    userId,
    serverName,
    findToken,
    refreshTokens,
    updateToken,
  }: GetTokensParams): Promise<MCPOAuthTokens | null> {
    try {
      const identifier = `mcp:${serverName}`;
      const userType = isSystemUserId(userId) ? 'app-level connection' : `user ${userId}`;

      // Get access token
      const accessTokenData = await findToken({
        userId,
        type: 'mcp_oauth',
        identifier,
      });

      /** Check if access token is missing or expired */
      const isMissing = !accessTokenData;
      const isExpired = accessTokenData?.expiresAt && new Date() >= accessTokenData.expiresAt;

      if (isMissing || isExpired) {
        logger.info(
          `[MCPTokenStorage] Access token ${isMissing ? 'missing' : 'expired'} for ${userType}, server ${serverName}`,
        );

        /** Refresh data if we have a refresh token and refresh function */
        const refreshTokenData = await findToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
        });

        if (!refreshTokenData) {
          logger.info(
            `[MCPTokenStorage] Access token ${isMissing ? 'missing' : 'expired'} and no refresh token available`,
          );
          return null;
        }

        if (!refreshTokens) {
          logger.warn(
            `[MCPTokenStorage] Access token ${isMissing ? 'missing' : 'expired'}, refresh token available but no \`refreshTokens\` provided`,
          );
          return null;
        }

        if (!updateToken) {
          logger.warn(
            `[MCPTokenStorage] Access token ${isMissing ? 'missing' : 'expired'}, refresh token available but no \`updateToken\` function provided`,
          );
          return null;
        }

        try {
          logger.info(
            `[MCPTokenStorage] Attempting to refresh token for ${userType}, server ${serverName}`,
          );
          const decryptedRefreshToken = await decryptV2(refreshTokenData.token);

          /** Client information if available */
          let clientInfo;
          try {
            const clientInfoData = await findToken({
              userId,
              type: 'mcp_oauth_client',
              identifier: `${identifier}:client`,
            });
            if (clientInfoData) {
              const decryptedClientInfo = await decryptV2(clientInfoData.token);
              clientInfo = JSON.parse(decryptedClientInfo);
              logger.debug(`[MCPTokenStorage] Retrieved client info for ${serverName}:`, {
                client_id: clientInfo.client_id,
                has_client_secret: !!clientInfo.client_secret,
              });
            }
          } catch {
            logger.debug(`[MCPTokenStorage] No client info found for ${userId}, ${serverName}`);
          }

          const metadata = {
            userId,
            serverName,
            identifier,
            clientInfo,
          };

          const newTokens = await refreshTokens(decryptedRefreshToken, metadata);

          await this.updateTokens({
            userId,
            serverName,
            tokens: newTokens,
            updateToken,
          });

          logger.info(
            `[MCPTokenStorage] Successfully refreshed tokens for ${userType}, server ${serverName}`,
          );
          return newTokens;
        } catch (refreshError) {
          logger.error(
            `[MCPTokenStorage] Failed to refresh tokens for user ${userId}, server ${serverName}`,
            refreshError,
          );
          // Check if it's an unauthorized_client error (refresh not supported)
          const errorMessage =
            refreshError instanceof Error ? refreshError.message : String(refreshError);
          if (errorMessage.includes('unauthorized_client')) {
            logger.info(
              `[MCPTokenStorage] Server does not support refresh tokens for this client. New authentication required.`,
            );
          }
          return null;
        }
      }

      // If we reach here, access token should exist and be valid
      if (!accessTokenData) {
        return null;
      }

      const decryptedAccessToken = await decryptV2(accessTokenData.token);

      /** Get refresh token if available */
      const refreshTokenData = await findToken({
        userId,
        type: 'mcp_oauth_refresh',
        identifier: `${identifier}:refresh`,
      });

      const tokens: MCPOAuthTokens = {
        access_token: decryptedAccessToken,
        token_type: 'Bearer',
        obtained_at: accessTokenData.createdAt.getTime(),
        expires_at: accessTokenData.expiresAt?.getTime(),
      };

      if (refreshTokenData) {
        tokens.refresh_token = await decryptV2(refreshTokenData.token);
      }

      return tokens;
    } catch (error) {
      logger.error('[MCPTokenStorage] Failed to retrieve tokens', { error, userId, serverName });
      return null;
    }
  }

  /**
   * Updates OAuth tokens for an MCP server
   */
  static async updateTokens({
    userId,
    serverName,
    tokens,
    updateToken,
  }: UpdateTokensParams): Promise<void> {
    try {
      const identifier = `mcp:${serverName}`;

      /** Encrypted access token for update */
      const encryptedAccessToken = await encryptV2(tokens.access_token);

      /** Handle both expires_in and expires_at formats */
      let accessTokenExpiry: Date;
      if ('expires_at' in tokens && tokens.expires_at) {
        accessTokenExpiry = new Date(tokens.expires_at);
      } else if (tokens.expires_in) {
        /** Standard OAuthTokens format - calculate expiry */
        accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      } else {
        /** No expiry provided - default to 1 year */
        accessTokenExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      }

      await updateToken(
        {
          userId,
          type: 'mcp_oauth',
          identifier,
        },
        {
          token: encryptedAccessToken,
          expiresAt: accessTokenExpiry,
        },
      );

      if (tokens.refresh_token) {
        const encryptedRefreshToken = await encryptV2(tokens.refresh_token);
        const extendedTokens = tokens as ExtendedOAuthTokens;
        const refreshTokenExpiry = extendedTokens.refresh_token_expires_in
          ? new Date(Date.now() + extendedTokens.refresh_token_expires_in * 1000)
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default to 1 year

        await updateToken(
          {
            userId,
            type: 'mcp_oauth_refresh',
            identifier: `${identifier}:refresh`,
          },
          {
            token: encryptedRefreshToken,
            expiresAt: refreshTokenExpiry,
          },
        );
      }

      logger.debug(
        `[MCPTokenStorage] Updated OAuth tokens for user ${userId}, server ${serverName}`,
      );
    } catch (error) {
      logger.error('[MCPTokenStorage] Failed to update tokens', { error, userId, serverName });
      throw error;
    }
  }

  /**
   * Deletes OAuth tokens for an MCP server
   */
  static async deleteTokens({
    userId,
    serverName,
    updateToken,
  }: DeleteTokensParams): Promise<void> {
    try {
      const identifier = `mcp:${serverName}`;

      /** Delete both access and refresh tokens */
      await Promise.all([
        updateToken(
          {
            userId,
            type: 'mcp_oauth',
            identifier,
          },
          {
            token: '',
            expiresAt: new Date(0),
          },
        ),
        updateToken(
          {
            userId,
            type: 'mcp_oauth_refresh',
            identifier: `${identifier}:refresh`,
          },
          {
            token: '',
            expiresAt: new Date(0),
          },
        ),
      ]);

      logger.debug(
        `[MCPTokenStorage] Deleted OAuth tokens for user ${userId}, server ${serverName}`,
      );
    } catch (error) {
      logger.error('[MCPTokenStorage] Failed to delete tokens', { error, userId, serverName });
      throw error;
    }
  }
}
