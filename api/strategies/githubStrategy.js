const { Strategy: GitHubStrategy } = require('passport-github2');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { useFirebase } = require('../server/services/firebase');

const githubLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const githubId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';

    const avatarUrl = profile.photos[0].value;

    if (oldUser) {
      oldUser.avatar = avatarUrl;
      await oldUser.save();

      if (useFirebase) {
        const userId = oldUser._id;
        const avatarURL = await uploadProfilePicture(userId, profile.photos[0].value);
        console.log('avatarURL', avatarURL);

        oldUser.avatar = avatarURL;
        await oldUser.save();
      }

      return cb(null, oldUser);
    } else if (ALLOW_SOCIAL_REGISTRATION) {
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
        const avatarURL = await uploadProfilePicture(userId, profile.photos[0].value);
        console.log('avatarURL', avatarURL);

        newUser.avatar = avatarURL;
        await newUser.save();
      }

      return cb(null, newUser);
    }
  } catch (err) {
    console.error(err);
    return cb(err);
  }
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
