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
    proxy: false,
    scope: ['user:email'] // Request email scope
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
      const githubId = profile.id;
      const email = profile.email;

      const existingUser = await User.findOne({ githubId });
      if (existingUser) {
        return cb(null, existingUser);
      }

      const userWithEmail = await User.findOne({ email });
      if (userWithEmail) {
        userWithEmail.githubId = githubId;
        await userWithEmail.save();
        return cb(null, userWithEmail);
      }

      const newUser = await new User({
        provider: 'github',
        githubId,
        username: profile.username,
        email,
        emailVerified: profile.emails[0].verified,
        name: profile.displayName,
        avatar: profile.photos[0].value
      }).save();

      cb(null, newUser);
    } catch (err) {
      console.error(err);
      cb(err);
    }
  }
);

passport.use(githubLogin);
