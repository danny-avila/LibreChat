import { logger } from '@librechat/data-schemas';
import { Profile } from 'passport';
import { getMethods } from '../initAuth';
import { isEnabled } from '../utils';
import { createSocialUser, handleExistingUser } from './helpers';
import { GetProfileDetails, SocialLoginStrategy } from './types';

export function socialLogin(
  provider: string,
  getProfileDetails: GetProfileDetails,
): SocialLoginStrategy {
  return async (
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: Profile,
    cb: any,
  ): Promise<void> => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const { findUser } = getMethods();

      const oldUser = await findUser({ email: email?.trim() });
      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION ?? '');

      if (oldUser) {
        await handleExistingUser(oldUser, avatarUrl ?? '');
        return cb(null, oldUser);
      }

      if (ALLOW_SOCIAL_REGISTRATION) {
        const newUser = await createSocialUser({
          email: email ?? '',
          avatarUrl: avatarUrl ?? '',
          provider,
          providerKey: `${provider}Id`,
          providerId: id,
          username,
          name,
          emailVerified,
        });
        return cb(null, newUser);
      }

      return cb(new Error('Social registration is disabled'));
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err as Error);
    }
  };
}

export default socialLogin;
