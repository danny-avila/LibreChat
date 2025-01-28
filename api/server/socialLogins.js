const Redis = require('ioredis');
const passport = require('passport');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const RedisStore = require('connect-redis').default;
const {
  setupOpenId,
  googleLogin,
  githubLogin,
  discordLogin,
  facebookLogin,
} = require('~/strategies');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = (app) => {
  // ---- 1) Always set up strategies if credentials are present ----
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
  if (
    process.env.OPENID_CLIENT_ID &&
      process.env.OPENID_CLIENT_SECRET &&
      process.env.OPENID_ISSUER &&
      process.env.OPENID_SCOPE &&
      process.env.OPENID_SESSION_SECRET
  ) {
    const sessionOptions = {
      secret: process.env.OPENID_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    };
    if (isEnabled(process.env.USE_REDIS)) {
      const client = new Redis(process.env.REDIS_URI);
      client
        .on('error', (err) => logger.error('ioredis error:', err))
        .on('ready', () => logger.info('ioredis successfully initialized.'))
        .on('reconnecting', () => logger.info('ioredis reconnecting...'));
      sessionOptions.store = new RedisStore({ client, prefix: 'librechat' });
    } else {
      sessionOptions.store = new MemoryStore({
        checkPeriod: 86400000, // prune expired entries every 24h
      });
    }
    app.use(session(sessionOptions));
    app.use(passport.session());
    setupOpenId();
  }
};

module.exports = configureSocialLogins;
