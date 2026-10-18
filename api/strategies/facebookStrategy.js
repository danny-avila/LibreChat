const FacebookStrategy = require('passport-facebook').Strategy;
const { createOAuthStateStore } = require('@librechat/api');
const socialLogin = require('./socialLogin');

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0]?.value,
  id: profile.id,
  avatarUrl: profile.photos[0]?.value,
  username: profile.displayName,
  name: profile.name?.givenName + ' ' + profile.name?.familyName,
  emailVerified: true,
});

const facebookLogin = socialLogin('facebook', getProfileDetails);

const getFacebookConfig = (callbackURL) => ({
  clientID: process.env.FACEBOOK_CLIENT_ID,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
  callbackURL,
  proxy: true,
  scope: ['public_profile'],
  profileFields: ['id', 'email', 'name'],
});

/** @param {Omit<import('@librechat/api').OAuthStateStoreOptions, 'provider'>} stateOptions */
const facebookStrategy = (stateOptions) =>
  new FacebookStrategy(
    {
      ...getFacebookConfig(`${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`),
      store: createOAuthStateStore({ ...stateOptions, provider: 'facebook' }),
    },
    facebookLogin,
  );

module.exports = facebookStrategy;
