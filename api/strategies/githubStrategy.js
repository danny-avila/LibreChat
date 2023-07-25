const { Strategy: GitHubStrategy } = require('passport-github2');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

// GitHub strategy
const githubLogin = async () =>
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.GITHUB_CALLBACK_URL}`,
      proxy: false,
      scope: ['user:email'], // Request email scope
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        let email;
        if (profile.emails && profile.emails.length > 0) {
          email = profile.emails[0].value;
        }

        const oldUser = await User.findOne({ email }).lean();
        if (oldUser) {
          return cb(null, oldUser);
        }

        const newUser = await new User({
          provider: 'github',
          githubId: profile.id,
          username: profile.username,
          email,
          emailVerified: profile.emails[0].verified,
          name: profile.displayName,
          avatar: profile.photos[0].value,
        }).save();

        cb(null, newUser);
      } catch (err) {
        console.error(err);
        cb(err);
      }
    },
  );

module.exports = githubLogin;
