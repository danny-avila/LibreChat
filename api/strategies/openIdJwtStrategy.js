const { SystemRoles } = require('librechat-data-provider');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { updateUser, findUser } = require('~/models');
const { logger } = require('~/config');
const jwksRsa = require('jwks-rsa');
const { isEnabled } = require('~/server/utils');
/**
 * @function openIdJwtLogin
 * @param {import('openid-client').Configuration} openIdConfig - Configuration object for the JWT strategy.
 * @returns {JwtStrategy}
 * @description This function creates a JWT strategy for OpenID authentication.
 * It uses the jwks-rsa library to retrieve the signing key from a JWKS endpoint.
 * The strategy extracts the JWT from the Authorization header as a Bearer token.
 * The JWT is then verified using the signing key, and the user is retrieved from the database.
 */
const openIdJwtLogin = (openIdConfig) => {
  let jwksRsaOptions = {
    cache: isEnabled(process.env.OPENID_JWKS_URL_CACHE_ENABLED) || true,
    cacheMaxAge: process.env.OPENID_JWKS_URL_CACHE_TIME
      ? eval(process.env.OPENID_JWKS_URL_CACHE_TIME)
      : 60000,
    jwksUri: openIdConfig.serverMetadata().jwks_uri,
  };

  if (process.env.PROXY) {
    jwksRsaOptions.requestAgent = new HttpsProxyAgent(process.env.PROXY);
  }

  return new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret(jwksRsaOptions),
    },
    async (payload, done) => {
      try {
        const user = await findUser({ openidId: payload?.sub });

        if (user) {
          user.id = user._id.toString();
          if (!user.role) {
            user.role = SystemRoles.USER;
            await updateUser(user.id, { role: user.role });
          }
          done(null, user);
        } else {
          logger.warn(
            '[openIdJwtLogin] openId JwtStrategy => no user found with the sub claims: ' +
              payload?.sub,
          );
          done(null, false);
        }
      } catch (err) {
        done(err, false);
      }
    },
  );
};

module.exports = openIdJwtLogin;
