const { Strategy: TwitterStrategy } = require('passport-twitter');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

const twitterLogin = async () =>
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_API_KEY,
      consumerSecret: process.env.TWITTER_API_SECRET,
      callbackURL: `${domains.server}${process.env.TWITTER_CALLBACK_URL}`,
      proxy: false,
      includeEmail: true,
    },
    async (token, tokenSecret, profile, cb) => {
      try {
        const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

        const oldUser = await User.findOne({ email });
        if (oldUser) {
          return cb(null, oldUser);
        }

        const newUser = await new User({
          provider: 'twitter',
          twitterId: profile.id,
          username: profile.username,
          email,
          name: profile.displayName,
          avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
        }).save();

        cb(null, newUser);
      } catch (err) {
        console.error(err);
        cb(err);
      }
    },
  );

module.exports = twitterLogin;
