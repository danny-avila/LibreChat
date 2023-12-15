const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { useFirebase } = require('~/server/services/firebase');

const googleLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const googleId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    const avatarUrl = profile.photos[0].value;

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl, useFirebase, profile.photos[0].value);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, googleId, email, avatarUrl, useFirebase);
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
    const avatarURL = await uploadProfilePicture(userId, avatarUrl);
    oldUser.avatar = avatarURL;
    await oldUser.save();
  }
};

const createNewUser = async (profile, googleId, email, avatarUrl, useFirebase) => {
  const newUser = await new User({
    provider: 'google',
    googleId,
    username: profile.name.givenName,
    email,
    emailVerified: profile.emails[0].verified,
    name: `${profile.name.givenName} ${profile.name.familyName}`,
    avatar: avatarUrl,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const avatarURL = await uploadProfilePicture(userId, avatarUrl);
    newUser.avatar = avatarURL;
    await newUser.save();
  }

  return newUser;
};

module.exports = () =>
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.GOOGLE_CALLBACK_URL}`,
      proxy: true,
    },
    googleLogin,
  );
