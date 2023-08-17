const { Strategy: GitHubStrategy } = require('passport-github2');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

const githubLogin = async () =>
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.GITHUB_CALLBACK_URL}`,
      proxy: false,
      scope: ['user:email'],
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        let email;
        if (profile.emails && profile.emails.length > 0) {
          email = profile.emails[0].value;
        }

        const oldUser = await User.findOne({
          email,
        });

        if (process.env.ALLOW_SOCIAL_LOGIN?.toLowerCase() !== 'true') {
          if (oldUser) {
            oldUser.avatar = profile.photos[0].value;
            await oldUser.save();
            return cb(null, oldUser);
          } else {
            return cb(null, false, {
              message: 'User not found.',
            });
          }
        } else {
          if (oldUser) {
            oldUser.avatar = profile.photos[0].value;
            await oldUser.save();
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

          return cb(null, newUser);
        }
      } catch (err) {
        console.error(err);
        return cb(err);
      }
    },
  );

module.exports = githubLogin;
