import { Document, Types } from 'mongoose';
import { IGroupMembership, IEffectiveTimeWindow } from './group';

export interface IUser extends Document {
  name?: string;
  username?: string;
  email: string;
  emailVerified: boolean;
  password?: string;
  avatar?: string;
  provider: string;
  role?: string;
  googleId?: string;
  facebookId?: string;
  openidId?: string;
  samlId?: string;
  ldapId?: string;
  githubId?: string;
  discordId?: string;
  appleId?: string;
  plugins?: unknown[];
  twoFactorEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: Array<{
    codeHash: string;
    used: boolean;
    usedAt?: Date | null;
  }>;
  refreshToken?: Array<{
    refreshToken: string;
  }>;
  expiresAt?: Date;
  termsAccepted?: boolean;
  personalization?: {
    memories?: boolean;
  };
  // Time-based access control fields
  groupMemberships?: IGroupMembership[];
  effectiveTimeWindows?: IEffectiveTimeWindow[];
  lastAccessValidation?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BalanceConfig {
  enabled?: boolean;
  startBalance?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: string;
  refillAmount?: number;
}

export interface UserCreateData extends Partial<IUser> {
  email: string;
}

export interface UserUpdateResult {
  deletedCount: number;
  message: string;
}

export interface UserSearchCriteria {
  email?: string;
  username?: string;
  googleId?: string;
  facebookId?: string;
  openidId?: string;
  samlId?: string;
  ldapId?: string;
  githubId?: string;
  discordId?: string;
  appleId?: string;
  _id?: Types.ObjectId | string;
}

export interface UserQueryOptions {
  fieldsToSelect?: string | string[] | null;
  lean?: boolean;
}
