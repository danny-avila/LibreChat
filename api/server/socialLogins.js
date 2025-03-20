const passport = require('passport');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const RedisStore = require('connect-redis').default;
const Keyv = require('keyv');
const {
  setupOpenId,
  googleLogin,
  githubLogin,
  discordLogin,
  facebookLogin,
  appleLogin,
} = require('~/strategies');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');
const keyvRedis = require('~/cache/keyvRedis');

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = (app) => {
  logger.info('Configuring social logins...');

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(googleLogin());
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    passport.use(facebookLogin());
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(githubLogin());
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(discordLogin());
  }
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
    passport.use(appleLogin());
  }
  if (
    process.env.OPENID_CLIENT_ID &&
    process.env.OPENID_CLIENT_SECRET &&
    process.env.OPENID_ISSUER &&
    process.env.OPENID_SCOPE &&
    process.env.OPENID_SESSION_SECRET
  ) {
    logger.info('Configuring OpenID Connect...');
    const sessionOptions = {
      secret: process.env.OPENID_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    };
    if (isEnabled(process.env.USE_REDIS)) {
      logger.info('Using Redis for session storage in OpenID...');
      const keyv = new Keyv({ store: keyvRedis });
      sessionOptions.store = new RedisStore({ client: keyv.opts.store.redis, prefix: 'librechat' });
    } else {
      sessionOptions.store = new MemoryStore({
        checkPeriod: 86400000, // prune expired entries every 24h
      });
    }
    app.use(session(sessionOptions));
    app.use(passport.session());
    setupOpenId();

    logger.info('OpenID Connect configured.');
  }
};

module.exports = configureSocialLogins;
