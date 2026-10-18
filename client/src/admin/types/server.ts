import type { TUser } from 'librechat-data-provider';

export type SerializableUser = Pick<TUser, 'id' | 'email' | 'name' | 'role'>;

export interface SessionData {
  user?: SerializableUser;
  token?: string;
  refreshToken?: string;
  tokenProvider?: 'librechat' | 'openid';
  /** Absolute expiry of `token` (ms epoch). Drives proactive refresh. */
  expiresAt?: number;
  lastVerified?: number;
  lastActivity?: number;
  codeVerifier?: string;
}

export interface AdminLoginResponse {
  token: string;
  user: SerializableUser;
  twoFAPending?: boolean;
  tempToken?: string;
}

export interface TwoFAVerifyResponse {
  token: string;
  user: SerializableUser;
}

export interface AdminVerifyResponse {
  user: SerializableUser;
}

export interface OAuthExchangeResponse {
  token: string;
  refreshToken?: string;
  user: SerializableUser;
  expiresAt?: number;
}
