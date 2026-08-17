import type {
  TUserFavorite,
  RefillIntervalUnit,
  StatefulCodeEnvironment,
} from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';
import { CursorPaginationParams } from '~/common';

export interface IUser extends Document {
  _id: Types.ObjectId;
  /**
   * Mongoose's `Document.id` virtual is typed `id?: any`. At runtime it's
   * always `_id.toString()` for a hydrated doc, so narrow to a required
   * string. This also lets `IUser` satisfy Express.User augmentations
   * (the OIDC remote-agent middleware assigns `req.user = IUser` where
   * the project's local `Express.User` requires `id: string`).
   */
  id: string;
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
  plugins?: string[];
  openidIssuer?: string;
  twoFactorEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: Array<{
    codeHash: string;
    used: boolean;
    usedAt?: Date | null;
  }>;
  pendingTotpSecret?: string;
  pendingBackupCodes?: Array<{
    codeHash: string;
    used: boolean;
    usedAt?: Date | null;
  }>;
  refreshToken?: Array<{
    refreshToken: string;
  }>;
  expiresAt?: Date;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date | null;
  personalization?: {
    memories?: boolean;
    statefulCodeEnvironment?: StatefulCodeEnvironment;
  };
  favorites?: TUserFavorite[];
  /** Per-skill active/inactive overrides. Key = skillId, value = active state. */
  skillStates?: Record<string, boolean>;
  createdAt?: Date;
  updatedAt?: Date;
  /** Set when account deletion begins; durably blocks all new scheduling for this user. */
  deletionRequestedAt?: Date;
  deletionSweepAt?: Date;
  deletionCommittedAt?: Date;
  /** Exact stream generations whose deletion-side abort has not been acknowledged;
   *  durable and TTL-free so a publication outage can never be mistaken for
   *  settlement. Generation qualification prevents a predecessor cleanup from
   *  erasing a replacement generation's recovery evidence. */
  deletionAbortFences?: Array<{ streamId: string; createdAt: number }>;
  /** Expiring Mongo-backed leases used when the primary finalization lease store
   *  cannot be renewed. Keys are pre-sanitized opaque lease identities. */
  finalizationFallbackLeases?: Map<string, Date> | Record<string, Date>;
  /** Field for external source identification (for consistency with TPrincipal schema) */
  idOnTheSource?: string;
  tenantId?: string;
  federatedTokens?: OIDCTokens;
  openidTokens?: OIDCTokens;
}

export interface OIDCTokens {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_at?: number;
}

export interface BalanceConfig {
  enabled?: boolean;
  startBalance?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: RefillIntervalUnit;
  refillAmount?: number;
}

export interface CreateUserRequest extends Partial<IUser> {
  email: string;
}

export interface UpdateUserRequest {
  name?: string;
  username?: string;
  email?: string;
  role?: string;
  emailVerified?: boolean;
  avatar?: string;
  plugins?: string[];
  twoFactorEnabled?: boolean;
  termsAccepted?: boolean;
  termsAcceptedAt?: Date | null;
  personalization?: {
    memories?: boolean;
    statefulCodeEnvironment?: StatefulCodeEnvironment;
  };
  skillStates?: Record<string, boolean>;
}

export interface UserDeleteResult {
  deletedCount: number;
  message: string;
}

export interface UserFilterOptions extends CursorPaginationParams {
  _id?: Types.ObjectId | string;
  // Includes email, username and name
  search?: string;
  role?: string;
  emailVerified?: boolean;
  provider?: string;
  twoFactorEnabled?: boolean;
  // External IDs
  googleId?: string;
  facebookId?: string;
  openidId?: string;
  samlId?: string;
  ldapId?: string;
  githubId?: string;
  discordId?: string;
  appleId?: string;
  // Date filters
  createdAfter?: string;
  createdBefore?: string;
}

export interface UserQueryOptions {
  fieldsToSelect?: string | string[] | null;
  lean?: boolean;
}
