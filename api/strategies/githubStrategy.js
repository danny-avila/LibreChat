const { Strategy: GitHubStrategy } = require('passport-github2');
const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const User = require('~/models/User');

const githubLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const githubId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0].value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser({
        email,
        avatarUrl,
        provider: 'github',
        providerKey: 'githubId',
        providerId: githubId,
        username: profile.username,
        name: profile.displayName,
        emailVerified: profile.emails[0].verified,
      });
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[githubLogin]', err);
    return cb(err);
  }
};

module.exports = () =>
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GITHUB_CALLBACK_URL}`,
      proxy: false,
      scope: ['user:email'],
    },
    githubLogin,
  );
