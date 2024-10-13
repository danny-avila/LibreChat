const passport = require('passport');
const jwksRsa = require('jwks-rsa');
const { expressjwt: jwt } = require('express-jwt');
const { logger } = require('~/config');
const cookie = require('cookie');
const { findUser } = require('~/models/userMethods');
const { isOpenIDConfigured } = require('~/strategies/validators');

const setUser = async function (req, openidId = null, email = null) {
  if (!openidId && !email) {
    logger.error('[setUser] Either openidId or email should be supplied!');
    return;
  }

  const query = openidId ? { openidId } : { email };
  req.user = await findUser(query);

  if (req.user) {
    req.user.id ??= req.user._id.toString();
    logger.info(
      `[setUser] user found with ${openidId ? 'openidId' : 'email'}: ${openidId || email}`,
    );
  } else {
    logger.info(
      `[setUser] user not found with ${openidId ? 'openidId' : 'email'}: ${openidId || email}`,
    );
  }
};

const requireJwtAuth = isOpenIDConfigured() ? [
  jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: process.env.OPENID_JWKS_URI,
    }),
    algorithms: ['RS256'],
    issuer: process.env.OPENID_ISSUER,
    audience: [process.env.OPENID_CLIENT_ID, 'account'],
    getToken: (req) => {
      if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        return req.headers.authorization.split(' ')[1];
      }
      if (req.headers.cookie) {
        const cookies = cookie.parse(req.headers.cookie);
        return cookies.accessToken;
      }
      return null;
    },
  }),

  async (req, res, next) => {
    try {
      if (!req.auth) {
        logger.warn('[requireJwtAuth] No decoded JWT found in request');
        return res.status(401).send('Unauthorized');
      }

      const { sub, email } = req.auth;

      await setUser(req, sub, email);

      next();
    } catch (error) {
      logger.error('[requireJwtAuth] Error setting user:', error);
      return res.status(500).send('Internal Server Error');
    }
  },
] : passport.authenticate('jwt', { session: false });

module.exports = requireJwtAuth;
