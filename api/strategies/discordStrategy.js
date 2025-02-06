const { Strategy: DiscordStrategy } = require('passport-discord');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => {
  let avatarUrl;
  if (profile.avatar) {
    const format = profile.avatar.startsWith('a_') ? 'gif' : 'png';
    avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
  } else {
    const defaultAvatarNum = Number(profile.discriminator) % 5;
    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
  }

  return {
    email: profile.email,
    id: profile.id,
    avatarUrl,
    username: profile.username,
    name: profile.global_name,
    emailVerified: true,
  };
};

const discordLogin = socialLogin('discord', getProfileDetails);

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
