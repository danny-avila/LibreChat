const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { getUserById, updateUser, findUser } = require('~/models');
const { getUserInfoFromBackend } = require('./customBackendStrategy');

/**
 * Custom JWT strategy that handles both LibreChat and backend tokens
 */
const customJwtStrategy = () => {
  return new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true, // Pass request to callback to access headers
    },
    async (req, payload, done) => {
      try {
        // Check if this is a LibreChat token
        if (payload.id) {
          // Handle LibreChat JWT token
          const user = await getUserById(payload.id, '-password -__v -totpSecret');
          if (user) {
            user.id = user._id.toString();
            if (!user.role) {
              user.role = SystemRoles.USER;
              await updateUser(user.id, { role: user.role });
            }
            return done(null, user);
          } else {
            logger.warn('[customJwtStrategy] LibreChat JWT => no user found: ' + payload.id);
            return done(null, false);
          }
        } 
        
        // If not a LibreChat token, try to validate with backend
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return done(null, false);
        }

        const token = authHeader.split(' ')[1];
        
        // Validate token with your backend
        const userInfoResult = await getUserInfoFromBackend(token);
        
        if (!userInfoResult.success) {
          logger.warn('[customJwtStrategy] Backend token validation failed');
          return done(null, false);
        }

        // Find user in LibreChat database
        const user = await findUser({ email: userInfoResult.user.email });
        
        if (!user) {
          logger.warn('[customJwtStrategy] User not found in LibreChat database');
          return done(null, false);
        }

        user.id = user._id.toString();
        if (!user.role) {
          user.role = SystemRoles.USER;
          await updateUser(user.id, { role: user.role });
        }

        return done(null, user);
        
      } catch (err) {
        logger.error('[customJwtStrategy] Error:', err);
        return done(err, false);
      }
    }
  );
};

module.exports = customJwtStrategy;
