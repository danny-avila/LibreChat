const { Strategy: GitHubStrategy } = require('passport-github2');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePictureFromURL = require('./ProfilePictureCreate');

const githubLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.emails[0].value;
    const githubId = profile.id;
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    console.log(profile.photos[0].value);

    // Upload profile picture and get the download URL
    const profilePictureResult = await uploadProfilePictureFromURL(
      profile.id,
      profile.photos[0].value,
    );
    console.log('Image uploaded successfully. Download URL:', profilePictureResult);

    // Use the download URL in the user creation or update logic
    if (oldUser) {
      oldUser.avatar = profile.photos[0].value;
      await oldUser.save();
      return cb(null, oldUser);
    } else if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await new User({
        provider: 'github',
        githubId,
        username: profile.username,
        email,
        emailVerified: profile.emails[0].verified,
        name: profile.displayName,
        avatar: profilePictureResult,
      }).save();

      return cb(null, newUser);
    }

    return cb(null, false, { message: 'User not found.' });
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
