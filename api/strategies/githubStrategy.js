const passport = require('passport');
const { Strategy: GitHubStrategy } = require('passport-github2');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

// GitHub strategy
const githubLogin = new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${domains.server}${process.env.GITHUB_CALLBACK_URL}`,
    proxy: true
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
      const oldUser = await User.findOne({ email: user.emails[0].value });
      if (oldUser) {
        return cb(null, oldUser);
      }
    } catch (err) {
      console.log(err);
    }

    try {
      const newUser = await new User({
        provider: 'github',
        githubId: profile.id,
        username: profile.username,
        email: user.emails[0].value,
        emailVerified: profile.emails[0].verified,
        name: profile.displayName,
        avatar: profile.photos[0].value
      }).save();
      cb(null, newUser);
    } catch (err) {
      console.log(err);
    }
  }
);

passport.use(githubLogin);