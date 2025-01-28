const FacebookStrategy = require('passport-facebook').Strategy;
const socialLogin = require('./socialLogin');

const getProfileDetails = (profile) => ({
  email: profile.emails[0]?.value,
  id: profile.id,
  avatarUrl: profile.photos[0]?.value,
  username: profile.displayName,
  name: profile.name?.givenName + ' ' + profile.name?.familyName,
  emailVerified: true,
});

const facebookLogin = socialLogin('facebook', getProfileDetails);

module.exports = () =>
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookLogin,
  );
