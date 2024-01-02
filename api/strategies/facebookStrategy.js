const FacebookStrategy = require('passport-facebook').Strategy;
const { logger } = require('~/config');
const User = require('~/models/User');
const { useFirebase, uploadAvatar } = require('~/server/services/Files/images');

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
    logger.error('[facebookLogin]', err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarUrl, useFirebase) => {
  if (!useFirebase && !oldUser.avatar.includes('?manual=true')) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatar.includes('?manual=true')) {
    const userId = oldUser._id;
    const newavatarUrl = await uploadAvatar(userId, avatarUrl);
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
    const newavatarUrl = await uploadAvatar(userId, avatarUrl);
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
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookLogin,
  );
