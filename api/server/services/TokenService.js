const axios = require('axios');
const { TokenExchangeMethodEnum } = require('librechat-data-provider');
const { handleOAuthToken } = require('~/models/Token');
const { decryptV2 } = require('~/server/utils/crypto');
const { logAxiosError } = require('~/utils');
const { logger } = require('~/config');

/**
 * Processes the access tokens and stores them in the database.
 * @param {object} tokenData
 * @param {string} tokenData.access_token
 * @param {number} tokenData.expires_in
 * @param {string} [tokenData.refresh_token]
 * @param {number} [tokenData.refresh_token_expires_in]
 * @param {object} metadata
 * @param {string} metadata.userId
 * @param {string} metadata.identifier
 * @returns {Promise<void>}
 */
async function processAccessTokens(tokenData, { userId, identifier }) {
  const { access_token, expires_in = 3600, refresh_token, refresh_token_expires_in } = tokenData;
  if (!access_token) {
    logger.error('Access token not found: ', tokenData);
    throw new Error('Access token not found');
  }
  await handleOAuthToken({
    identifier,
    token: access_token,
    expiresIn: expires_in,
    userId,
  });

  if (refresh_token != null) {
    logger.debug('Processing refresh token');
    await handleOAuthToken({
      token: refresh_token,
      type: 'oauth_refresh',
      userId,
      identifier: `${identifier}:refresh`,
      expiresIn: refresh_token_expires_in ?? null,
    });
  }
  logger.debug('Access tokens processed');
}

/**
 * Refreshes the access token using the refresh token.
 * @param {object} fields
 * @param {string} fields.userId - The ID of the user.
 * @param {string} fields.client_url - The URL of the OAuth provider.
 * @param {string} fields.identifier - The identifier for the token.
 * @param {string} fields.refresh_token - The refresh token to use.
 * @param {string} fields.token_exchange_method - The token exchange method ('default_post' or 'basic_auth_header').
 * @param {string} fields.encrypted_oauth_client_id - The client ID for the OAuth provider.
 * @param {string} fields.encrypted_oauth_client_secret - The client secret for the OAuth provider.
 * @returns {Promise<{
 *  access_token: string,
 *  expires_in: number,
 *  refresh_token?: string,
 *  refresh_token_expires_in?: number,
 * }>}
 */
const refreshAccessToken = async ({
  userId,
  client_url,
  identifier,
  refresh_token,
  token_exchange_method,
  encrypted_oauth_client_id,
  encrypted_oauth_client_secret,
}) => {
  try {
    const oauth_client_id = await decryptV2(encrypted_oauth_client_id);
    const oauth_client_secret = await decryptV2(encrypted_oauth_client_secret);

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    });

    if (token_exchange_method === TokenExchangeMethodEnum.BasicAuthHeader) {
      const basicAuth = Buffer.from(`${oauth_client_id}:${oauth_client_secret}`).toString('base64');
      headers['Authorization'] = `Basic ${basicAuth}`;
    } else {
      params.append('client_id', oauth_client_id);
      params.append('client_secret', oauth_client_secret);
    }

    const response = await axios({
      method: 'POST',
      url: client_url,
      headers,
      data: params.toString(),
    });
    await processAccessTokens(response.data, {
      userId,
      identifier,
    });
    logger.debug(`Access token refreshed successfully for ${identifier}`);
    return response.data;
  } catch (error) {
    const message = 'Error refreshing OAuth tokens';
    throw new Error(
      logAxiosError({
        message,
        error,
      }),
    );
  }
};

/**
 * Handles the OAuth callback and exchanges the authorization code for tokens.
 * @param {object} fields
 * @param {string} fields.code - The authorization code returned by the provider.
 * @param {string} fields.userId - The ID of the user.
 * @param {string} fields.identifier - The identifier for the token.
 * @param {string} fields.client_url - The URL of the OAuth provider.
 * @param {string} fields.redirect_uri - The redirect URI for the OAuth provider.
 * @param {string} fields.token_exchange_method - The token exchange method ('default_post' or 'basic_auth_header').
 * @param {string} fields.encrypted_oauth_client_id - The client ID for the OAuth provider.
 * @param {string} fields.encrypted_oauth_client_secret - The client secret for the OAuth provider.
 * @returns {Promise<{
 *  access_token: string,
 *  expires_in: number,
 *  refresh_token?: string,
 *  refresh_token_expires_in?: number,
 * }>}
 */
const getAccessToken = async ({
  code,
  userId,
  identifier,
  client_url,
  redirect_uri,
  token_exchange_method,
  encrypted_oauth_client_id,
  encrypted_oauth_client_secret,
}) => {
  const oauth_client_id = await decryptV2(encrypted_oauth_client_id);
  const oauth_client_secret = await decryptV2(encrypted_oauth_client_secret);

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri,
  });

  if (token_exchange_method === TokenExchangeMethodEnum.BasicAuthHeader) {
    const basicAuth = Buffer.from(`${oauth_client_id}:${oauth_client_secret}`).toString('base64');
    headers['Authorization'] = `Basic ${basicAuth}`;
  } else {
    params.append('client_id', oauth_client_id);
    params.append('client_secret', oauth_client_secret);
  }

  try {
    const response = await axios({
      method: 'POST',
      url: client_url,
      headers,
      data: params.toString(),
    });

    await processAccessTokens(response.data, {
      userId,
      identifier,
    });
    logger.debug(`Access tokens successfully created for ${identifier}`);
    return response.data;
  } catch (error) {
    const message = 'Error exchanging OAuth code';
    throw new Error(
      logAxiosError({
        message,
        error,
      }),
    );
  }
};

module.exports = {
  getAccessToken,
  refreshAccessToken,
};
