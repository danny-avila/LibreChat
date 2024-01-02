const { Strategy: DiscordStrategy } = require('passport-discord');
const { logger } = require('~/config');
const User = require('~/models/User');
const { useFirebase, uploadAvatar } = require('~/server/services/Files/images');

const discordLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.email;
    const discordId = profile.id;
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
      await handleExistingUser(oldUser, avatarUrl, useFirebase);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, discordId, email, avatarUrl, useFirebase);
      return cb(null, newUser);
    }
  } catch (err) {
    logger.error('[discordLogin]', err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarUrl, useFirebase) => {
  if (!useFirebase && !oldUser.avatar.includes('?manual=true')) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatar.includes('?manual=true')) {
    const userId = oldUser._id;
    const newavatarUrl = await uploadAvatar(userId, avatarUrl);
    oldUser.avatar = newavatarUrl;
    await oldUser.save();
  }
};

const createNewUser = async (profile, discordId, email, avatarUrl, useFirebase) => {
  const newUser = await new User({
    provider: 'discord',
    discordId,
    username: profile.username,
    email,
    name: profile.global_name,
    avatar: avatarUrl,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const newavatarUrl = await uploadAvatar(userId, avatarUrl);
    newUser.avatar = newavatarUrl;
    await newUser.save();
  }

  return newUser;
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
