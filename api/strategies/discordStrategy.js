const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

const discordLogin = new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: `${domains.server}${process.env.DISCORD_CALLBACK_URL}`,
    scope: ['identify', 'email'] // Request scopes
  },
  async (accessToken, refreshToken, profile, cb) => {
    try {
      const email = profile.email;
      const oldUser = await User.findOne({ discordId: profile.id });
      if (oldUser) {
        return cb(null, oldUser);
      }
      const newUser = await User.create({
        provider: 'discord',
        discordId: profile.id,
        username: profile.username,   // username is the username (the old tag discord#1111) of the user on discord
        email,
        name: profile.global_name,  // global_name is the name of the user on discord
        avatar: `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      });

      cb(null, newUser);
    } catch (err) {
      console.error(err);
      cb(err);
    }
  }
);

passport.use(discordLogin);
