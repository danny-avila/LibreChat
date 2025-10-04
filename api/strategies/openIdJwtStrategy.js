const jwksRsa = require('jwks-rsa');
const { logger } = require('@librechat/data-schemas');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { isEnabled, findOpenIDUser } = require('@librechat/api');
const { updateUser, findUser } = require('~/models');

/**
 * @function openIdJwtLogin
 * @param {import('openid-client').Configuration} openIdConfig - Configuration object for the JWT strategy.
 * @returns {JwtStrategy}
 * @description This function creates a JWT strategy for OpenID authentication.
 * It uses the jwks-rsa library to retrieve the signing key from a JWKS endpoint.
 * The strategy extracts the JWT from the Authorization header as a Bearer token.
 * The JWT is then verified using the signing key, and the user is retrieved from the database.
 *
 * Includes email fallback mechanism:
 * 1. Primary lookup: Search user by openidId (sub claim)
 * 2. Fallback lookup: If not found, search by email claim
 * 3. User migration: If found by email without openidId, migrate the user by adding openidId
 * 4. Provider validation: Ensures users registered with other providers cannot use OpenID
 *
 * This enables seamless migration for existing users when SharePoint integration is enabled.
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
    /**
     * @param {import('openid-client').IDToken} payload
     * @param {import('passport-jwt').VerifyCallback} done
     */
    async (payload, done) => {
      try {
        const { user, error, migration } = await findOpenIDUser({
          findUser,
          email: payload?.email,
          openidId: payload?.sub,
          idOnTheSource: payload?.oid,
          strategyName: 'openIdJwtLogin',
        });

        if (error) {
          done(null, false, { message: error });
          return;
        }

        if (user) {
          user.id = user._id.toString();

          const updateData = {};
          if (migration) {
            updateData.provider = 'openid';
            updateData.openidId = payload?.sub;
          }
          if (!user.role) {
            user.role = SystemRoles.USER;
            updateData.role = user.role;
          }

          if (Object.keys(updateData).length > 0) {
            await updateUser(user.id, updateData);
          }

          done(null, user);
        } else {
          logger.warn(
            '[openIdJwtLogin] openId JwtStrategy => no user found with the sub claims: ' +
              payload?.sub +
              (payload?.email ? ' or email: ' + payload.email : ''),
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
