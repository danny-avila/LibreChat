import { VerifyCallback } from 'passport-oauth2';
import { Profile } from 'passport';
import { IUser } from '@librechat/data-schemas';

export interface GetProfileDetailsParams {
  idToken: string;
  profile: Profile;
}
export type GetProfileDetails = (
  params: GetProfileDetailsParams,
) => Partial<IUser> & { avatarUrl: string };

export type SocialLoginStrategy = (
  accessToken: string,
  refreshToken: string,
  idToken: string,
  profile: Profile,
  cb: VerifyCallback,
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
