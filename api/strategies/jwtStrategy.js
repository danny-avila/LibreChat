const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const jwksRsa = require('jwks-rsa');
const { getUserById, updateUser } = require('~/models');
const { logger } = require('~/config');
const { isOpenIDConfigured } = require('./validators');

// JWT strategy
const jwtLogin = async () => {
  const strategyOptions = isOpenIDConfigured()
    ? {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: process.env.OPENID_JWKS_URI,
      }),
      algorithms: ['RS256'],
      issuer: process.env.OPENID_ISSUER,
      audience: process.env.OPENID_CLIENT_ID,
    }
    : {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    };

  return new JwtStrategy(strategyOptions, async (payload, done) => {
    try {
      const userId = payload.sub || payload.id;
      const user = await getUserById(userId, '-password -__v');

      if (user) {
        user.id = user._id.toString();

        if (!user.role) {
          user.role = SystemRoles.USER;
          await updateUser(user.id, { role: user.role });
        }

        done(null, user);
      } else {
        logger.warn(`[jwtLogin] JwtStrategy => no user found: ${userId}`);
        done(null, false);
      }
    } catch (err) {
      logger.error('[jwtLogin] JwtStrategy error: ', err);
      done(err, false);
    }
  });
};

module.exports = jwtLogin;
