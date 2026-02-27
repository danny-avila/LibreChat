const { Strategy: GitHubStrategy } = require('passport-github2');
const { logger } = require('@librechat/data-schemas');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.username,
  name: profile.displayName,
  emailVerified: profile.emails[0].verified,
});

const githubLogin = socialLogin('github', getProfileDetails);

module.exports = () => {
  const callbackURL = `${process.env.DOMAIN_SERVER}${process.env.GITHUB_CALLBACK_URL}`;
  logger.info(`[GitHubStrategy] Callback URL: ${callbackURL}`);
  logger.info(`[GitHubStrategy] Client ID: ${process.env.GITHUB_CLIENT_ID?.slice(0, 8)}...`);

  return new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL,
      proxy: false,
      scope: ['user:email'],
      ...(process.env.GITHUB_ENTERPRISE_BASE_URL && {
        authorizationURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/authorize`,
        tokenURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/access_token`,
        userProfileURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user`,
        userEmailURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user/emails`,
        ...(process.env.GITHUB_ENTERPRISE_USER_AGENT && {
          userAgent: process.env.GITHUB_ENTERPRISE_USER_AGENT,
        }),
      }),
    },
    githubLogin,
  );
};
