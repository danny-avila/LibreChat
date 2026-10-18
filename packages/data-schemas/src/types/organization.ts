import { OrganizationLifecycle } from 'librechat-data-provider';
import type {
  TOrganizationInviteKind,
  TOrganizationLifecycle,
  TOrganizationMemberStatus,
  TOrganizationInviteStatus,
} from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

/**
 * An organization's lifecycle, shared with the client: `suspended` blocks its members and keeps
 * everything; `deleting` blocks everything while the organization is erased.
 */
export const OrganizationStatus: typeof OrganizationLifecycle = OrganizationLifecycle;

export type TOrganizationStatus = TOrganizationLifecycle;

/** An organization. Its `tenantId` is the tenant every one of its records lives in. */
export interface IOrganization extends Document {
  _id: Types.ObjectId;
  tenantId: string;
  name: string;
  status: TOrganizationStatus;
  /** The login account that created it. */
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrganizationRecord {
  _id: Types.ObjectId;
  tenantId: string;
  name: string;
  status: TOrganizationStatus;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IOrganizationInvite extends Document {
  _id: Types.ObjectId;
  tenantId: string;
  kind: TOrganizationInviteKind;
  /** Email invites only, lowercased and trimmed. */
  email?: string;
  /** SHA-256 of the raw token; the raw token only ever appears in the invite link. */
  tokenHash: string;
  role: string;
  /** The member who created (or last resent) it. */
  invitedBy: Types.ObjectId;
  status: TOrganizationInviteStatus;
  expiresAt: Date;
  maxUses: number;
  /** Decremented atomically on every redemption; the invite is spent at zero. */
  remainingUses: number;
  useCount: number;
  acceptedAt?: Date;
  acceptedBy?: Types.ObjectId;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrganizationInviteRecord {
  _id: Types.ObjectId;
  tenantId: string;
  kind: TOrganizationInviteKind;
  email?: string;
  tokenHash: string;
  role: string;
  invitedBy: Types.ObjectId;
  status: TOrganizationInviteStatus;
  expiresAt: Date;
  maxUses: number;
  remainingUses: number;
  useCount: number;
  acceptedAt?: Date;
  acceptedBy?: Types.ObjectId;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/** The membership fields the cross-organization listing reads. */
export interface MembershipRecord {
  _id: Types.ObjectId;
  tenantId: string;
  identityId: Types.ObjectId;
  role?: string;
  status?: TOrganizationMemberStatus;
  /** The platform operator's hidden access, not a membership the account was given. */
  operatorAccess?: boolean;
}

/** Profile fields a new member record copies from its login account. */
export interface MembershipAccount {
  _id: Types.ObjectId | string;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
}

export interface CreateMembershipParams {
  tenantId: string;
  account: MembershipAccount;
  role: string;
}

export type MembershipOutcome = 'created' | 'reactivated' | 'existing';

export interface CreateOrganizationInviteParams {
  tenantId: string;
  kind: TOrganizationInviteKind;
  email?: string;
  tokenHash: string;
  role: string;
  invitedBy: Types.ObjectId | string;
  expiresAt: Date;
  maxUses: number;
}

export interface ListOrganizationMembersParams {
  limit: number;
  /** `_id` of the last member on the previous page. */
  after?: string;
  /** Matches name, username or email, case-insensitively. */
  search?: string;
}
