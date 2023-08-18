const { Strategy: DiscordStrategy } = require('passport-discord');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;

const discordLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.email;
    const discordId = profile.id;
    const oldUser = await User.findOne({
      email,
    });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    let avatarURL;
    if (profile.avatar) {
      const format = profile.avatar.startsWith('a_') ? 'gif' : 'png';
      avatarURL = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
    } else {
      const defaultAvatarNum = Number(profile.discriminator) % 5;
      avatarURL = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
    }

    if (oldUser) {
      oldUser.avatar = avatarURL;
      await oldUser.save();
      return cb(null, oldUser);
    } else if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await new User({
        provider: 'discord',
        discordId,
        username: profile.username,
        email,
        name: profile.global_name,
        avatar: avatarURL,
      }).save();

      return cb(null, newUser);
    }

    return cb(null, false, {
      message: 'User not found.',
    });
  } catch (err) {
    console.error(err);
    return cb(err);
  }
};

module.exports = () =>
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: `${domains.server}${process.env.DISCORD_CALLBACK_URL}`,
      scope: ['identify', 'email'],
      authorizationURL: 'https://discord.com/api/oauth2/authorize?prompt=none',
    },
    discordLogin,
  );
