/**
 * The header an admin-panel request names its scope in: the platform, or one organization by
 * its tenant id. Only the platform operator's requests read it; it is ignored when
 * organizations are disabled.
 */
export const ADMIN_SCOPE_HEADER = 'x-admin-scope';

/** The scope of the operator's deployment-wide records: platform defaults, grants, roles. */
export const ADMIN_PLATFORM_SCOPE = 'platform';

/** Stable codes an admin request can fail with, mapped to localized copy by the panel. */
export const AdminErrorCode = {
  /** Organizations mode: only the platform operator uses the admin panel. */
  OPERATOR_REQUIRED: 'OPERATOR_REQUIRED',
  /** The scope header names no organization the operator can act in. */
  ADMIN_SCOPE_INVALID: 'ADMIN_SCOPE_INVALID',
  /** The page only exists at one scope (for example, organizations at the platform). */
  ADMIN_SCOPE_UNSUPPORTED: 'ADMIN_SCOPE_UNSUPPORTED',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  /** A destructive action's typed confirmation did not match. */
  CONFIRMATION_MISMATCH: 'CONFIRMATION_MISMATCH',
  ORGANIZATION_DELETING: 'ORGANIZATION_DELETING',
} as const;

export type TAdminErrorCode = (typeof AdminErrorCode)[keyof typeof AdminErrorCode];

/** A person, as the operator's organization views name them. */
export interface TAdminPerson {
  id: string;
  name?: string;
  email?: string;
}

/** One organization in the operator's list. */
export interface TAdminOrganization {
  /** The organization's tenant id. */
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  /** The account that created it. */
  createdBy?: TAdminPerson;
  /** Active members the organization can see (never the operator's hidden access). */
  memberCount: number;
  adminCount: number;
}

export interface TAdminOrganizationDetail extends TAdminOrganization {
  admins: TAdminPerson[];
  pendingInviteCount: number;
}

export interface TAdminOrganizationsQuery {
  search?: string;
  status?: string;
  limit?: number;
  /** The `nextCursor` of the previous page. */
  after?: string;
}

export interface TAdminOrganizationsResponse {
  organizations: TAdminOrganization[];
  nextCursor?: string;
}

export interface TAdminOrganizationResponse {
  organization: TAdminOrganizationDetail;
}

export interface TDeleteAdminOrganizationRequest {
  /** The organization's exact name, typed to confirm a deletion that cannot be undone. */
  confirmName: string;
}

/** A login account, as the operator's people view lists it. */
export interface TAdminAccount {
  id: string;
  name?: string;
  email: string;
  username?: string;
  emailVerified?: boolean;
  isPlatformOperator?: boolean;
  createdAt?: string;
}

export interface TAdminAccountMembership {
  organization: { id: string; name: string; status: string };
  role: string;
  status: string;
}

export interface TAdminAccountDetail extends TAdminAccount {
  memberships: TAdminAccountMembership[];
}

export interface TAdminAccountsResponse {
  accounts: TAdminAccount[];
  nextCursor?: string;
}

export interface TAdminAccountResponse {
  account: TAdminAccountDetail;
}

/** Who is using the built-in admin panel; only someone who can open it gets an answer. */
export interface TAdminSession {
  user: { id: string; name?: string; email?: string };
  /** Organizations mode: the panel acts at the platform or in one organization at a time. */
  organizations: boolean;
}
