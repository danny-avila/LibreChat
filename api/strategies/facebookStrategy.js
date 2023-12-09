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
    const avatarURL = profile.photos[0]?.value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarURL, useFirebase);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, facebookId, email, avatarURL, useFirebase);
      return cb(null, newUser);
    }
  } catch (err) {
    console.error(err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarURL, useFirebase) => {
  if (!oldUser.avatarUploaded && !useFirebase) {
    oldUser.avatar = avatarURL;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatarUploaded) {
    const userId = oldUser._id;
    const newAvatarURL = await uploadProfilePicture(userId, avatarURL);
    oldUser.avatar = newAvatarURL;
    await oldUser.save();
  }
};

const createNewUser = async (profile, facebookId, email, avatarURL, useFirebase) => {
  const newUser = await new User({
    provider: 'facebook',
    facebookId,
    username: profile.displayName,
    email,
    name: profile.name?.givenName + ' ' + profile.name?.familyName,
    avatar: avatarURL,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const newAvatarURL = await uploadProfilePicture(userId, avatarURL);
    console.log('newAvatarURL', newAvatarURL);
    newUser.avatar = newAvatarURL;
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
