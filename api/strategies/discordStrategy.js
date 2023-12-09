const { Strategy: DiscordStrategy } = require('passport-discord');
const User = require('../models/User');
const config = require('../../config/loader');
const domains = config.domains;
const uploadProfilePicture = require('~/server/services/ProfilePictureCreate');
const { useFirebase } = require('~/server/services/firebase');

const discordLogin = async (accessToken, refreshToken, profile, cb) => {
  try {
    const email = profile.email;
    const discordId = profile.id;
    const oldUser = await User.findOne({ email });
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
      await handleExistingUser(oldUser, avatarURL, useFirebase);
      return cb(null, oldUser);
    }

    if (ALLOW_SOCIAL_REGISTRATION) {
      const newUser = await createNewUser(profile, discordId, email, avatarURL, useFirebase);
      return cb(null, newUser);
    }
  } catch (err) {
    console.error(err);
    return cb(err);
  }
};

const handleExistingUser = async (oldUser, avatarURL, useFirebase) => {
  if (!oldUser.avatarUploaded && !useFirebase) {
    oldUser.avatar = avatarURL;
    await oldUser.save();
  } else if (useFirebase && !oldUser.avatarUploaded) {
    const userId = oldUser._id;
    const newAvatarURL = await uploadProfilePicture(userId, avatarURL);
    oldUser.avatar = newAvatarURL;
    await oldUser.save();
  }
};

const createNewUser = async (profile, discordId, email, avatarURL, useFirebase) => {
  const newUser = await new User({
    provider: 'discord',
    discordId,
    username: profile.username,
    email,
    name: profile.global_name,
    avatar: avatarURL,
  }).save();

  if (useFirebase) {
    const userId = newUser._id;
    const newAvatarURL = await uploadProfilePicture(userId, avatarURL);
    console.log('newAvatarURL', newAvatarURL);
    newUser.avatar = newAvatarURL;
    await newUser.save();
  }

  return newUser;
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
