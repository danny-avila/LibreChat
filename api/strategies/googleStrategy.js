const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
require('dotenv').config();

const googleLogin = async () =>
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.GOOGLE_CALLBACK_URL}`,
      proxy: true,
    },
    async (accessToken, refreshToken, profile, cb) => {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;
        const oldUser = await User.findOne({ email });

        if (process.env.ALLOW_SOCIAL_LOGIN?.toLowerCase() !== 'true') {
          if (oldUser) {
            oldUser.avatar = profile.photos[0].value;
            await oldUser.save();
            return cb(null, oldUser);
          } else {
            return cb(null, false, { message: 'User not found.' });
          }
        } else {
          if (oldUser) {
            oldUser.avatar = profile.photos[0].value;
            await oldUser.save();
            return cb(null, oldUser);
          }

          const newUser = await new User({
            provider: 'google',
            googleId,
            username: profile.name.givenName,
            email,
            emailVerified: profile.emails[0].verified,
            name: `${profile.name.givenName} ${profile.name.familyName}`,
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

module.exports = googleLogin;
