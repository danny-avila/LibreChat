const axios = require('axios');
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
  encrypted_oauth_client_id,
  encrypted_oauth_client_secret,
}) => {
  try {
    const oauth_client_id = await decryptV2(encrypted_oauth_client_id);
    const oauth_client_secret = await decryptV2(encrypted_oauth_client_secret);
    const params = new URLSearchParams({
      client_id: oauth_client_id,
      client_secret: oauth_client_secret,
      grant_type: 'refresh_token',
      refresh_token,
    });

    const response = await axios({
      method: 'POST',
      url: client_url,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
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
    logAxiosError({
      message,
      error,
    });
    throw new Error(message);
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
  encrypted_oauth_client_id,
  encrypted_oauth_client_secret,
}) => {
  const oauth_client_id = await decryptV2(encrypted_oauth_client_id);
  const oauth_client_secret = await decryptV2(encrypted_oauth_client_secret);
  const params = new URLSearchParams({
    code,
    client_id: oauth_client_id,
    client_secret: oauth_client_secret,
    grant_type: 'authorization_code',
    redirect_uri,
  });

  try {
    const response = await axios({
      method: 'POST',
      url: client_url,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
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
    logAxiosError({
      message,
      error,
    });
    throw new Error(message);
  }
};



/**
 * Handles getting a Client Credential Token
 * @param {object} fields
 * @param {string} fields.identifier - The action id the token is requested for
 * @param {string} fields.scope - The scope the token is requested for
 * @param {string} fields.client_url - The URL of the OAuth provider.
 * @param {string} fields.encrypted_oauth_client_id - The client ID for the OAuth provider.
 * @param {string} fields.encrypted_oauth_client_secret - The client secret for the OAuth provider.
 * @returns {Promise<{
*  access_token: string,
*  expires_in: number
* }>}
*/
const getClientCredentialAccessToken = async ({
 identifier, 
 scope,
 client_url,
 encrypted_oauth_client_id,
 encrypted_oauth_client_secret,
}) => {


 logger.debug(`getClientCredentialAccessToken for ${identifier}`);

 const oauth_client_id = await decryptV2(encrypted_oauth_client_id);
 const oauth_client_secret = await decryptV2(encrypted_oauth_client_secret);
 const params = new URLSearchParams({
   scope,
   client_id: oauth_client_id,
   client_secret: oauth_client_secret,
   grant_type: 'client_credentials',
 });

 try {
   const response = await axios({
     method: 'POST',
     url: client_url,
     headers: {
       'Content-Type': 'application/x-www-form-urlencoded',
       Accept: 'application/json',
     },
     data: params.toString(),
   });


   logger.debug(`Access tokens successfully recieved for ${identifier}`);
   return response.data;
 } catch (error) {
   const message = 'Error getting access token';
   logAxiosError({
     message,
     error,
   });
   throw new Error(message);
 }
};

module.exports = {
  getAccessToken,
  refreshAccessToken,
  getClientCredentialAccessToken,
};
