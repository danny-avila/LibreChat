const { Strategy: GitHubStrategy } = require('passport-github2');
const { logger } = require('~/config');
const User = require('~/models/User');
const { useFirebase, uploadAvatar } = require('~/server/services/Files/images');

const githubLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const githubId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0].value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl, useFirebase);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, githubId, email, avatarUrl, useFirebase);
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[githubLogin]', err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarUrl, useFirebase) => {
  if (!useFirebase && !oldUser.avatar.includes('?manual=true')) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatar.includes('?manual=true')) {
    const userId = oldUser._id;
    const avatarURL = await uploadAvatar(userId, avatarUrl);
    oldUser.avatar = avatarURL;
    await oldUser.save();
  }
};

const createNewUser = async (profile, githubId, email, avatarUrl, useFirebase) => {
  const newUser = await new User({
    provider: 'github',
    githubId,
    username: profile.username,
    email,
    emailVerified: profile.emails[0].verified,
    name: profile.displayName,
    avatar: avatarUrl,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const avatarURL = await uploadAvatar(userId, avatarUrl);
    newUser.avatar = avatarURL;
    await newUser.save();
  }

  return newUser;
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
