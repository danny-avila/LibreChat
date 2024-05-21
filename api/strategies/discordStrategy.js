const { Strategy: DiscordStrategy } = require('passport-discord');
const { createNewUser, handleExistingUser } = require('./process');
const { logger } = require('~/config');
const User = require('~/models/User');

const discordLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.email;
    const discordId = profile.id;

    // TODO: remove direct access of User model
    const oldUser = await User.findOne({ email });
    const ALLOW_SOCIAL_REGISTRATION =
      process.env.ALLOW_SOCIAL_REGISTRATION?.toLowerCase() === 'true';
    let avatarUrl;

    if (profile.avatar) {
      const format = profile.avatar.startsWith('a_') ? 'gif' : 'png';
      avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
    } else {
      const defaultAvatarNum = Number(profile.discriminator) % 5;
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
    }

    if (oldUser) {
      await handleExistingUser(oldUser, avatarUrl);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser({
        email,
        avatarUrl,
        provider: 'discord',
        providerKey: 'discordId',
        providerId: discordId,
        username: profile.username,
        name: profile.global_name,
      });
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[discordLogin]', err);
    return cb(err);
  }
};

module.exports = () =>
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.DISCORD_CALLBACK_URL}`,
      scope: ['identify', 'email'],
      authorizationURL: 'https://discord.com/api/oauth2/authorize?prompt=none',
    },
    discordLogin,
  );
