const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { useFirebase } = require('~/server/services/firebase');

const facebookLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0]?.value;
    const facebookId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0]?.value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl, useFirebase);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, facebookId, email, avatarUrl, useFirebase);
      return cb(null, newUser);
    }
  } catch (err) {
    console.error(err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarUrl, useFirebase) => {
  if (!useFirebase && !oldUser.avatar.endsWith('?manual=true')) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatar.endsWith('?manual=true')) {
    const userId = oldUser._id;
    const newavatarUrl = await uploadProfilePicture(userId, avatarUrl);
    oldUser.avatar = newavatarUrl;
    await oldUser.save();
  }
};

const createNewUser = async (profile, facebookId, email, avatarUrl, useFirebase) => {
  const newUser = await new User({
    provider: 'facebook',
    facebookId,
    username: profile.displayName,
    email,
    name: profile.name?.givenName + ' ' + profile.name?.familyName,
    avatar: avatarUrl,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const newavatarUrl = await uploadProfilePicture(userId, avatarUrl);
    console.log('newavatarUrl', newavatarUrl);
    newUser.avatar = newavatarUrl;
    await newUser.save();
  }

  return newUser;
};

module.exports = () =>
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile', 'email'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookLogin,
  );
