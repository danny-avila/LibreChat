const passport = require('passport');
const {
  setupOpenId,
  googleLogin,
  githubLogin,
  discordLogin,
  facebookLogin,
} = require('~/strategies');

const configureSocialLogins = () => {
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
    setupOpenId();
  }
};

module.exports = configureSocialLogins;
