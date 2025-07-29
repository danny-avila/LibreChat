const { logger } = require('@librechat/data-schemas');
const { findUser } = require('~/models');

/**
 * Backend token refresh service
 */
const BACKEND_REFRESH_URL = process.env.BACKEND_REFRESH_URL || 'https://api.admin.div25.com/api/auth';

/**
 * Refresh backend token
 * @param {string} refreshToken 
 * @returns {Promise<{success: boolean, token?: string, refreshToken?: string, error?: string}>}
 */
async function refreshBackendToken(refreshToken) {
  try {
    // For Node.js 18+, use the global fetch. For older versions, you might need to install node-fetch
    const fetch = globalThis.fetch || require('node-fetch');
    
    const response = await fetch(BACKEND_REFRESH_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: refreshToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.message || 'Token Refresh failed',
      };
    }

    return {
      success: true,
      token: data.token, // Access token from your backend
      refreshToken: data.refreshToken || data.refresh_token || data.token, // Try different refresh token fields
      user: data.user || null, // User info from your backend
    };
  } catch (error) {
    logger.error('[authenticateWithBackend] Error:', error);
    return {
      success: false,
      error: 'Authentication service unavailable',
    };
  }
}

/**
 * Set custom backend auth tokens in response cookies
 * @param {string} accessToken 
 * @param {string} refreshToken 
 * @param {object} res 
 * @param {number} expiresIn - token expiry in seconds (default 24 hours since no refresh)
 */
function setCustomBackendTokens(accessToken, refreshToken, res, expiresIn = 86400, userEmail = null) { // 24 hours default
  const isProduction = process.env.NODE_ENV === 'production';
  const expirationDate = new Date(Date.now() + (expiresIn * 1000));

  logger.debug('[setCustomBackendTokens] Setting tokens:', {
    hasAccessToken: !!accessToken,
    hasRefreshToken: !!refreshToken,
    tokensAreSame: accessToken === refreshToken,
    hasUserEmail: !!userEmail,
    expiresIn: expiresIn,
    expirationDate: expirationDate.toISOString(),
  });

  // Don't set access token cookie - LibreChat expects token in response body
  // res.cookie('accessToken', accessToken, {
  //   expires: expirationDate,
  //   httpOnly: true,
  //   secure: isProduction,
  //   sameSite: 'strict',
  // });

  // Set refresh token cookie (same expiry since it's the same token)
  res.cookie('refreshToken', refreshToken, {
    expires: expirationDate,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax', // Changed from 'strict' to 'lax' for better cross-origin compatibility
  });

  // Set token provider
  res.cookie('token_provider', 'custom-backend', {
    expires: expirationDate,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax', // Changed from 'strict' to 'lax' for better cross-origin compatibility
  });

  // Store user email for refresh lookups if provided
  if (userEmail) {
    res.cookie('userEmail', userEmail, {
      expires: expirationDate,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax', // Changed from 'strict' to 'lax' for better cross-origin compatibility
    });
  }

  logger.debug('[setCustomBackendTokens] Cookies set successfully');
  return accessToken;
}

module.exports = {
  refreshBackendToken,
  setCustomBackendTokens,
};
