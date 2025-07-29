const { logger } = require('~/config');
const { getUserInfoFromBackend } = require('~/strategies/customBackendStrategy');

/**
 * Middleware to handle custom backend token authentication
 * This checks for a custom backend token and pre-authenticates the user
 */
const customBackendTokenAuth = async (req, res, next) => {
  try {
    // Check if there's a custom backend token in cookies (set by iframe auth middleware)
    // OR if there's a token in the query parameters (passed from parent window)
    // Add null checks for req.cookies since it might not be available yet
    const customToken = req.query.token || (req.cookies && req.cookies.custom_backend_token);
    
    // Only process if we have a token and no existing user authentication
    if (customToken && !req.user) {
      logger.debug('[customBackendTokenAuth] Found custom backend token, attempting authentication');
      
      try {
        // First check if this might be a LibreChat JWT token
        let isLibreChatToken = false;
        try {
          const jwt = require('jsonwebtoken');
          jwt.verify(customToken, process.env.JWT_SECRET);
          isLibreChatToken = true;
          logger.debug('[customBackendTokenAuth] Token is LibreChat JWT, skipping custom backend validation');
        } catch (jwtError) {
          // Not a LibreChat JWT, proceed with custom backend validation
          logger.debug('[customBackendTokenAuth] Token is not LibreChat JWT, validating with custom backend');
        }
        
        // Only validate with custom backend if it's not a LibreChat token
        if (!isLibreChatToken) {
          // Validate the token with the backend
          const userResult = await getUserInfoFromBackend(customToken);
          
          if (userResult.success && userResult.user) {
            // Import user management functions
            const { findUser, createUser, updateUser, countUsers } = require('~/models');
            const { getBalanceConfig } = require('~/server/services/Config');
            const { SystemRoles } = require('librechat-data-provider');
            
            // Create or update user in LibreChat database
            const email = userResult.user.email;
            const username = userResult.user.username || userResult.user.login || email.split('@')[0];
            const name = userResult.user.name || userResult.user.displayName || username;
            const userId = userResult.user.id || userResult.user.userId;
            
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
                emailVerified: true,
                name,
                role: isFirstUser ? SystemRoles.ADMIN : SystemRoles.USER,
              };

              const balanceConfig = await getBalanceConfig();
              const createdUserId = await createUser(newUserData, balanceConfig);
              
              user = await findUser({ _id: createdUserId });
              logger.info(`[customBackendTokenAuth] Created new user from token: ${email}`);
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
              logger.info(`[customBackendTokenAuth] Updated existing user from token: ${email}`);
            }
            
            // Store backend tokens on user object for later use
            user.backendAccessToken = customToken;
            user.backendRefreshToken = customToken; // Use same token for both
            
            // Attach user to request for subsequent middleware
            req.user = user;
            
            logger.debug('[customBackendTokenAuth] User authenticated via custom backend token:', email);
          } else {
            logger.warn('[customBackendTokenAuth] Custom backend token validation failed:', userResult.error);
            // Clear invalid token if it was set as a cookie
            if (req.cookies && req.cookies.custom_backend_token) {
              res.clearCookie('custom_backend_token');
            }
          }
        }
      } catch (error) {
        logger.error('[customBackendTokenAuth] Error validating custom backend token:', error);
        // Clear problematic token if it was set as a cookie
        if (req.cookies && req.cookies.custom_backend_token) {
          res.clearCookie('custom_backend_token');
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('[customBackendTokenAuth] Middleware error:', error);
    next(); // Continue even if there's an error
  }
};

module.exports = customBackendTokenAuth;
