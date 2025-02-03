const GitHubStrategy = require('passport-github2').Strategy;
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.username,
  name: profile.displayName,
  emailVerified: profile.emails[0].verified,
});

const githubEnterpriseLogin = socialLogin('githubEnterprise', getProfileDetails);

module.exports = () =>
  new GitHubStrategy(
    {
      name: 'githubEnterprise',
      clientID: process.env.GITHUB_ENTERPRISE_CLIENT_ID,
      clientSecret: process.env.GITHUB_ENTERPRISE_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GITHUB_ENTERPRISE_CALLBACK_URL}`,
      authorizationURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/authorize`,
      tokenURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/access_token`,
      userProfileURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user`,
      userEmailURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user/emails`,
      userAgent: process.env.GITHUB_ENTERPRISE_USER_AGENT || 'passport-github',
      scope: ['user:email', 'read:user'],
      proxy: false,
    },
    githubEnterpriseLogin,
  );