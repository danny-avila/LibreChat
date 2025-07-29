const { Strategy: CustomStrategy } = require('passport-custom');
const { logger } = require('@librechat/data-schemas');
const { findUser, createUser, updateUser, countUsers } = require('~/models');
const { getBalanceConfig } = require('~/server/services/Config');
const { SystemRoles } = require('librechat-data-provider');

/**
 * Custom authentication strategy for proprietary backend
 * Replace these URLs with your actual backend endpoints
 */
const BACKEND_AUTH_URL = process.env.BACKEND_AUTH_URL || 'https://api.admin.div25.com/api/auth';
const BACKEND_USER_INFO_URL = process.env.BACKEND_USER_INFO_URL || 'https://api.admin.div25.com/api/auth';

/**
 * Authenticate user with proprietary backend
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<{success: boolean, token?: string, user?: object, error?: string}>}
 */
async function authenticateWithBackend(username, password) {
  try {
    // For Node.js 18+, use the global fetch. For older versions, you might need to install node-fetch
    const fetch = globalThis.fetch || require('node-fetch');
    
    const response = await fetch(BACKEND_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: username,
        password,
        rememberMe: true, // Optional, adjust based on your backend
      }),
    });

    const data = await response.json();

    // Debug: Log the response structure to understand what your backend returns
    logger.debug('[authenticateWithBackend] Backend response:', {
      keys: Object.keys(data),
      hasToken: !!data.token,
      hasRefreshToken: !!(data.refreshToken || data.refresh_token),
      tokenType: typeof data.token,
    });

    if (!response.ok) {
      return {
        success: false,
        error: data.message || 'Authentication failed',
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
 * Get user information from backend using token
 * @param {string} token 
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function getUserInfoFromBackend(token) {
  try {
    // For Node.js 18+, use the global fetch. For older versions, you might need to install node-fetch
    const fetch = globalThis.fetch || require('node-fetch');
    
    logger.debug('[getUserInfoFromBackend] Fetching user info:', {
      hasToken: !!token,
      userInfoUrl: BACKEND_USER_INFO_URL,
    });
    
    const response = await fetch(BACKEND_USER_INFO_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    logger.debug('[getUserInfoFromBackend] Backend response:', {
      status: response.status,
      ok: response.ok,
      hasUserData: !!data,
      keys: data ? Object.keys(data) : [],
    });

    if (!response.ok) {
      logger.warn('[getUserInfoFromBackend] Backend returned error:', {
        status: response.status,
        message: data.message,
      });
      return {
        success: false,
        error: data.message || 'Failed to get user info',
      };
    }

    return {
      success: true,
      user: data,
    };
  } catch (error) {
    logger.error('[getUserInfoFromBackend] Error:', error);
    return {
      success: false,
      error: 'User info service unavailable',
    };
  }
}

/**
 * Create or update user in LibreChat database
 * @param {object} backendUser - User data from backend
 * @returns {Promise<object>} - LibreChat user object
 */
async function createOrUpdateLibreChatUser(backendUser) {
  try {
    // Map backend user fields to LibreChat user fields
    // Adjust these mappings based on your backend's user structure
    const email = backendUser.email;
    const username = backendUser.username || backendUser.login || email.split('@')[0];
    const name = backendUser.name || backendUser.displayName || username;
    const userId = backendUser.id || backendUser.userId;

    // Check if user already exists in LibreChat
    let user = await findUser({ email });

    if (!user) {
      // Check if this is the first user (make them admin)
      const isFirstUser = (await countUsers()) === 0;
      
      // Create new user
      const newUserData = {
        provider: 'custom-backend',
        customId: userId.toString(),
        username,
        email,
        emailVerified: true, // Assume backend handles email verification
        name,
        role: isFirstUser ? SystemRoles.ADMIN : SystemRoles.USER,
      };

      const balanceConfig = await getBalanceConfig();
      const createdUserId = await createUser(newUserData, balanceConfig);
      
      user = await findUser({ _id: createdUserId });
      logger.info(`[customBackendStrategy] Created new user: ${email}`);
    } else {
      // Update existing user with latest info from backend
      const updateData = {
        provider: 'custom-backend',
        customId: userId.toString(),
        username,
        name,
        emailVerified: true,
      };

      user = await updateUser(user._id, updateData);
      logger.info(`[customBackendStrategy] Updated existing user: ${email}`);
    }

    return user;
  } catch (error) {
    logger.error('[createOrUpdateLibreChatUser] Error:', error);
    throw error;
  }
}

/**
 * Custom Passport strategy for proprietary backend authentication
 */
const customBackendStrategy = () => {
  return new CustomStrategy(async (req, done) => {
    try {
      const { email: username, password } = req.body;

      if (!username || !password) {
        return done(null, false, { message: 'Username and password are required' });
      }

      // Authenticate with your backend
      const authResult = await authenticateWithBackend(username, password);

      if (!authResult.success) {
        logger.warn(`[customBackendStrategy] Authentication failed for user: ${username}`);
        return done(null, false, { message: authResult.error });
      }

      // Get additional user info if needed
      const userInfoResult = await getUserInfoFromBackend(authResult.token);
      
      if (!userInfoResult.success) {
        logger.warn(`[customBackendStrategy] Failed to get user info for: ${username}`);
        return done(null, false, { message: userInfoResult.error });
      }

      // Create or update user in LibreChat database
      const user = await createOrUpdateLibreChatUser(userInfoResult.user);

      // Store backend tokens for later use
      user.backendAccessToken = authResult.token;
      // Use refresh token if available, otherwise use access token
      // This ensures both tokens are defined for setCustomBackendTokens to work
      user.backendRefreshToken = authResult.refreshToken || authResult.token;

      // Debug: Log token storage
      logger.debug('[customBackendStrategy] Token storage:', {
        hasAccessToken: !!user.backendAccessToken,
        hasRefreshToken: !!user.backendRefreshToken,
        refreshTokenValue: user.backendRefreshToken,
        tokensAreSame: user.backendAccessToken === user.backendRefreshToken,
        bothTokensDefined: !!(user.backendAccessToken && user.backendRefreshToken),
      });

      logger.info(`[customBackendStrategy] Authentication successful for user: ${username}`);
      return done(null, user);

    } catch (error) {
      logger.error('[customBackendStrategy] Error:', error);
      return done(error);
    }
  });
};

module.exports = {
  customBackendStrategy,
  authenticateWithBackend,
  getUserInfoFromBackend,
};
