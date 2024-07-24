const AppleStrategy = require('passport-apple');
const socialLogin = require('./socialLogin');

const getProfileDetails = (req, accessToken, refreshToken, idToken, profile, cb) => {
  console.log('--- profile ---', profile);

  cb(null, {
    email: profile.emails[0]?.value,
    id: profile.id,
    avatarUrl: profile.photos[0]?.value,
    username: profile.displayName,
    name: profile.name?.givenName + ' ' + profile.name?.familyName,
    emailVerified: true,
  });
};

const appleLogin = socialLogin('apple', getProfileDetails);

module.exports = () =>
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.APPLE_CALLBACK_URL}`,
      keyID: process.env.APPLE_KEY_ID,
      // privateKeyLocation: '',
    },
    appleLogin,
  );
