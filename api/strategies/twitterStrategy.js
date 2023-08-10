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
    async (token, tokenSecret, user, cb) => {
      try {
        const email = user.emails && user.emails.length > 0 ? user.emails[0].value : null;

        const oldUser = await User.findOne({ email });
        if (oldUser) {
          return cb(null, oldUser);
        }

        const newUser = await new User({
          provider: 'twitter',
          twitterId: user.id,
          username: user.username,
          email,
          name: user.name,
        }).save();

        cb(null, newUser);
      } catch (err) {
        console.error(err);
        cb(err);
      }
    },
  );

module.exports = twitterLogin;
