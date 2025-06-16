import { Strategy as GitHubStrategy } from 'passport-github2';
import socialLogin from './socialLogin';
import { GetProfileDetails } from './types';

const getProfileDetails: GetProfileDetails = ({ profile }: any) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.username,
  name: profile.displayName,
  emailVerified: profile.emails[0].verified,
});

const githubStrategy = socialLogin('github', getProfileDetails);
const githubLogin = () =>
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GITHUB_CALLBACK_URL}`,
      proxy: false,
      scope: ['user:email'],
      ...(process.env.GITHUB_ENTERPRISE_BASE_URL && {
        authorizationURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/authorize`,
        tokenURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/login/oauth/access_token`,
        userProfileURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user`,
        userEmailURL: `${process.env.GITHUB_ENTERPRISE_BASE_URL}/api/v3/user/emails`,
        ...(process.env.GITHUB_ENTERPRISE_USER_AGENT && {
          userAgent: process.env.GITHUB_ENTERPRISE_USER_AGENT,
        }),
      }),
    },
    githubStrategy,
  );
export default githubLogin;
