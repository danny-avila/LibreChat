const session = require('express-session');
const RedisStore = require('connect-redis').default;
const passport = require('passport');
const {
  googleLogin,
  githubLogin,
  discordLogin,
  facebookLogin,
  setupOpenId,
} = require('../strategies');
const client = require('../cache/redis');

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = (app) => {
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
    if (process.env.USE_REDIS) {
      sessionOptions.store = new RedisStore({ client, prefix: 'librechat' });
    }
    app.use(session(sessionOptions));
    app.use(passport.session());
    setupOpenId();
  }
};

module.exports = configureSocialLogins;
