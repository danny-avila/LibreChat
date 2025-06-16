import { Strategy as FacebookStrategy } from 'passport-facebook';
import socialLogin from './socialLogin';
import { GetProfileDetails } from './types';

const getProfileDetails: GetProfileDetails = ({ profile }: FacebookStrategy.Profile) => {
  // email or photo may not be returned
  let email =
    profile.emails?.length > 0 ? profile.emails[0]?.value : `${profile.id}@id.facebook.com`;
  let photo = profile.photos?.length > 0 ? profile.photos[0]?.value : '';

  return {
    email: email,
    id: profile.id,
    avatarUrl: photo,
    username: profile.displayName,
    name: profile.name?.givenName + ' ' + profile.name?.familyName,
    emailVerified: true,
  };
};

const facebookStrategy = socialLogin('facebook', getProfileDetails);

const facebookLogin = () =>
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.FACEBOOK_CALLBACK_URL}`,
      proxy: true,
      scope: ['public_profile'],
      profileFields: ['id', 'email', 'name'],
    },
    facebookStrategy,
  );

export default facebookLogin;
