import { logger } from '@librechat/data-schemas';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens, ExtendedOAuthTokens } from './types';
import { encryptV2, decryptV2 } from '~/crypto';

interface StoreTokensParams {
  userId: string;
  serverName: string;
  tokens: OAuthTokens | ExtendedOAuthTokens | MCPOAuthTokens;
  createToken: TokenMethods['createToken'];
}

interface GetTokensParams {
  userId: string;
  serverName: string;
  findToken: TokenMethods['findToken'];
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
  }: StoreTokensParams): Promise<void> {
    try {
      const identifier = `mcp:${serverName}`;

      // Encrypt and store access token
      const encryptedAccessToken = await encryptV2(tokens.access_token);

      logger.debug(
        `[MCPTokenStorage] Token expires_in: ${'expires_in' in tokens ? tokens.expires_in : 'N/A'}, expires_at: ${'expires_at' in tokens ? tokens.expires_at : 'N/A'}`,
      );

      // Handle both expires_in and expires_at formats
      let accessTokenExpiry: Date;
      if ('expires_at' in tokens && tokens.expires_at) {
        // MCPOAuthTokens format - already has calculated expiry
        logger.debug(`[MCPTokenStorage] Using expires_at: ${tokens.expires_at}`);
        accessTokenExpiry = new Date(tokens.expires_at);
      } else if (tokens.expires_in) {
        // Standard OAuthTokens format - calculate expiry
        logger.debug(`[MCPTokenStorage] Using expires_in: ${tokens.expires_in}`);
        accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      } else {
        // No expiry provided - default to 1 year
        logger.debug(`[MCPTokenStorage] No expiry provided, using default`);
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

        // Calculate expiresIn for refresh token
        const refreshExpiresIn = Math.floor((refreshTokenExpiry.getTime() - Date.now()) / 1000);

        await createToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
          token: encryptedRefreshToken,
          expiresIn: refreshExpiresIn > 0 ? refreshExpiresIn : 365 * 24 * 60 * 60,
        });
      }

      logger.debug(
        `[MCPTokenStorage] Stored OAuth tokens for user ${userId}, server ${serverName}`,
      );
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
  }: GetTokensParams): Promise<MCPOAuthTokens | null> {
    try {
      const identifier = `mcp:${serverName}`;

      // Get access token
      const accessTokenData = await findToken({
        userId,
        type: 'mcp_oauth',
        identifier,
      });

      if (!accessTokenData) {
        return null;
      }

      // Check if access token is expired
      if (accessTokenData.expiresAt && new Date() >= accessTokenData.expiresAt) {
        // Try to refresh if we have a refresh token
        const refreshTokenData = await findToken({
          userId,
          type: 'mcp_oauth_refresh',
          identifier: `${identifier}:refresh`,
        });

        if (!refreshTokenData) {
          logger.debug(`[MCPTokenStorage] Access token expired and no refresh token available`);
          return null;
        }

        // Return null here - the calling code should handle refresh
        logger.debug(`[MCPTokenStorage] Access token expired, refresh token available`);
        return null;
      }

      const decryptedAccessToken = await decryptV2(accessTokenData.token);

      // Get refresh token if available
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

      // Update access token
      const encryptedAccessToken = await encryptV2(tokens.access_token);

      // Handle both expires_in and expires_at formats
      let accessTokenExpiry: Date;
      if ('expires_at' in tokens && tokens.expires_at) {
        // MCPOAuthTokens format - already has calculated expiry
        accessTokenExpiry = new Date(tokens.expires_at);
      } else if (tokens.expires_in) {
        // Standard OAuthTokens format - calculate expiry
        accessTokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      } else {
        // No expiry provided - default to 1 year
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

      // Update refresh token if provided
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

      // Delete both access and refresh tokens
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
