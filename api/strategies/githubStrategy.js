const { Strategy: GitHubStrategy } = require('passport-github2');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { useFirebase } = require('~/server/services/firebase');

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
    console.error(err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarUrl, useFirebase) => {
  if (!oldUser.avatarUploaded && !useFirebase) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatarUploaded) {
    const userId = oldUser._id;
    const avatarURL = await uploadProfilePicture(userId, avatarUrl);
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
    const avatarURL = await uploadProfilePicture(userId, avatarUrl);
    console.log('avatarURL', avatarURL);
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
      callbackURL: `${domains.server}${process.env.GITHUB_CALLBACK_URL}`,
      proxy: false,
      scope: ['user:email'],
    },
    githubLogin,
  );
