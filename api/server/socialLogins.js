const passport = require('passport');
const { logger } = require('@librechat/data-schemas');
const { googleLogin, googleAdminLogin, githubLogin, githubAdminLogin } = require('~/strategies');

/**
 *
 * @param {Express.Application} _app
 */
const configureSocialLogins = async (_app) => {
  logger.info('Configuring social logins...');

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(googleLogin());
    passport.use('googleAdmin', googleAdminLogin());
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(githubLogin());
    passport.use('githubAdmin', githubAdminLogin());
  }
};

module.exports = configureSocialLogins;
