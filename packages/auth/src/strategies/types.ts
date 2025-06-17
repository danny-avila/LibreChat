import { Profile } from 'passport';
import { IUser } from '@librechat/data-schemas';

export interface GetProfileDetailsParams {
  idToken: string;
  profile: Profile;
}
export type GetProfileDetails = (
  params: GetProfileDetailsParams,
) => Partial<IUser> & { avatarUrl: string | null };

export type SocialLoginStrategy = (
  accessToken: string,
  refreshToken: string,
  idToken: string,
  profile: Profile,
  cb: any,
) => Promise<void>;

export interface CreateSocialUserParams {
  email: string;
  avatarUrl: string;
  provider: string;
  providerKey: string;
  providerId: string;
  username?: string;
  name?: string;
  emailVerified?: boolean;
}

export interface JwtPayload {
  id: string;
  [key: string]: any;
}
