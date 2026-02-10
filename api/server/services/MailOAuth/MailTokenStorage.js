const { logger, encryptV2, decryptV2 } = require('@librechat/data-schemas');
const { findToken, createToken, updateToken, deleteTokens } = require('~/models');

class MailTokenStorage {
  /**
   * Stores OAuth tokens for a mail provider (gmail or outlook).
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.provider - 'gmail' or 'outlook'
   * @param {string} params.accessToken
   * @param {string} [params.refreshToken]
   * @param {number} [params.expiresIn] - Access token lifetime in seconds (default: 3600)
   */
  static async storeTokens({ userId, provider, accessToken, refreshToken, expiresIn = 3600 }) {
    const identifier = `mail:${provider}`;
    const logPrefix = `[MailOAuth][${provider}][User: ${userId}]`;

    try {
      const encryptedAccessToken = await encryptV2(accessToken);

      const accessTokenData = {
        userId,
        type: 'mail_oauth',
        identifier,
        token: encryptedAccessToken,
        expiresIn: expiresIn > 0 ? expiresIn : 3600,
      };

      const existingToken = await findToken({ userId, identifier });
      if (existingToken) {
        await updateToken({ userId, identifier }, accessTokenData);
        logger.debug(`${logPrefix} Updated existing access token`);
      } else {
        await createToken(accessTokenData);
        logger.debug(`${logPrefix} Created new access token`);
      }

      if (refreshToken) {
        const encryptedRefreshToken = await encryptV2(refreshToken);
        const refreshIdentifier = `${identifier}:refresh`;
        const refreshTokenData = {
          userId,
          type: 'mail_oauth_refresh',
          identifier: refreshIdentifier,
          token: encryptedRefreshToken,
          expiresIn: 365 * 24 * 60 * 60, // 1 year
        };

        const existingRefresh = await findToken({ userId, identifier: refreshIdentifier });
        if (existingRefresh) {
          await updateToken({ userId, identifier: refreshIdentifier }, refreshTokenData);
          logger.debug(`${logPrefix} Updated existing refresh token`);
        } else {
          await createToken(refreshTokenData);
          logger.debug(`${logPrefix} Created new refresh token`);
        }
      }
    } catch (error) {
      logger.error(`${logPrefix} Error storing tokens:`, error);
      throw error;
    }
  }

  /**
   * Retrieves decrypted tokens for a mail provider.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.provider - 'gmail' or 'outlook'
   * @returns {Promise<{ accessToken: string|null, refreshToken: string|null }>}
   */
  static async getTokens({ userId, provider }) {
    const identifier = `mail:${provider}`;
    const result = { accessToken: null, refreshToken: null };

    try {
      const accessTokenDoc = await findToken({ userId, identifier });
      if (accessTokenDoc) {
        result.accessToken = await decryptV2(accessTokenDoc.token);
      }

      const refreshTokenDoc = await findToken({ userId, identifier: `${identifier}:refresh` });
      if (refreshTokenDoc) {
        result.refreshToken = await decryptV2(refreshTokenDoc.token);
      }
    } catch (error) {
      logger.error(`[MailOAuth][${provider}][User: ${userId}] Error retrieving tokens:`, error);
    }

    return result;
  }

  /**
   * Deletes all tokens for a mail provider.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.provider - 'gmail' or 'outlook'
   */
  static async deleteTokens({ userId, provider }) {
    const identifier = `mail:${provider}`;
    try {
      await deleteTokens({ userId, identifier });
      await deleteTokens({ userId, identifier: `${identifier}:refresh` });
      logger.debug(`[MailOAuth][${provider}][User: ${userId}] Tokens deleted`);
    } catch (error) {
      logger.error(`[MailOAuth][${provider}][User: ${userId}] Error deleting tokens:`, error);
      throw error;
    }
  }

  /**
   * Checks if a user has a mail connection for a given provider.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.provider - 'gmail' or 'outlook'
   * @returns {Promise<boolean>}
   */
  static async hasConnection({ userId, provider }) {
    const identifier = `mail:${provider}`;
    try {
      const token = await findToken({ userId, identifier });
      return token != null;
    } catch (error) {
      logger.error(`[MailOAuth][${provider}][User: ${userId}] Error checking connection:`, error);
      return false;
    }
  }
}

module.exports = MailTokenStorage;
