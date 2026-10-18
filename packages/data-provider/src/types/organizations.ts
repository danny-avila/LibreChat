import type { TUser } from '../types';

/** `provider` stamped on an organization member record. A member carries no credentials: the
 *  login account it belongs to (`identityId`) holds them, so no sign-in strategy matches it. */
export const ORGANIZATION_MEMBER_PROVIDER = 'organization';

export const OrganizationMemberStatus = {
  ACTIVE: 'active',
  /** Removed from, or left, the organization. The record and its data stay; it cannot sign in
   *  to or act within the organization until an invite reactivates it. */
  DEACTIVATED: 'deactivated',
} as const;

export type TOrganizationMemberStatus =
  (typeof OrganizationMemberStatus)[keyof typeof OrganizationMemberStatus];

export const OrganizationInviteKind = {
  /** Bound to one address and redeemable once. */
  EMAIL: 'email',
  /** A shareable link redeemable by anyone holding it, up to its use limit. */
  LINK: 'link',
} as const;

export type TOrganizationInviteKind =
  (typeof OrganizationInviteKind)[keyof typeof OrganizationInviteKind];

export const OrganizationInviteStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REVOKED: 'revoked',
} as const;

export type TOrganizationInviteStatus =
  (typeof OrganizationInviteStatus)[keyof typeof OrganizationInviteStatus];

/** Stable codes for expected organization failures; the client maps them to localized copy. */
export const OrganizationErrorCode = {
  ORGANIZATIONS_DISABLED: 'ORGANIZATIONS_DISABLED',
  ORG_CREATE_DISABLED: 'ORG_CREATE_DISABLED',
  ORG_LIMIT_REACHED: 'ORG_LIMIT_REACHED',
  ORG_NAME_INVALID: 'ORG_NAME_INVALID',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  NOT_A_MEMBER: 'NOT_A_MEMBER',
  MEMBERSHIP_INACTIVE: 'MEMBERSHIP_INACTIVE',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NOT_ASSIGNABLE: 'ROLE_NOT_ASSIGNABLE',
  LAST_ADMIN: 'LAST_ADMIN',
  /** A malformed invite request: unknown kind, or an email invite without a valid address. */
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_EXHAUSTED: 'INVITE_EXHAUSTED',
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  LINK_INVITES_DISABLED: 'LINK_INVITES_DISABLED',
  ORGANIZATION_CHANGED: 'ORGANIZATION_CHANGED',
  /** The platform operator suspended the organization; its members cannot sign in to it. */
  ORGANIZATION_SUSPENDED: 'ORGANIZATION_SUSPENDED',
} as const;

export type TOrganizationErrorCode =
  (typeof OrganizationErrorCode)[keyof typeof OrganizationErrorCode];

/**
 * Sign-in response code for an account that belongs to no organization yet (a link invite
 * awaiting email verification, or every membership removed). The response carries a
 * short-lived `onboardingToken` that can only create an organization or accept an invite.
 */
export const ORGANIZATION_ONBOARDING_REQUIRED_CODE = 'ORGANIZATION_ONBOARDING_REQUIRED';

export interface TOrganizationOnboardingResponse {
  code: typeof ORGANIZATION_ONBOARDING_REQUIRED_CODE;
  onboardingToken: string;
  /** Whether the account's email is verified; organizations require it. */
  emailVerified: boolean;
}

/** Request header naming the organization the client UI was rendered for. A request whose
 *  session now acts in a different organization (another tab switched) is refused with
 *  `ORGANIZATION_CHANGED` instead of writing into the wrong one. */
export const EXPECTED_TENANT_HEADER = 'x-expected-tenant';

/** What `/api/config` tells the client about organizations (absent when they are disabled). */
export interface TStartupOrganizationsConfig {
  enabled: true;
  allowCreate: boolean;
  allowLinkInvites: boolean;
  maxPerAccount: number;
}

/** An organization's lifecycle: suspended keeps everything; deleting is being erased. */
export const OrganizationLifecycle = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETING: 'deleting',
} as const;

export type TOrganizationLifecycle =
  (typeof OrganizationLifecycle)[keyof typeof OrganizationLifecycle];

export interface TOrganization {
  /** The organization's tenant id; also its stable public id. */
  id: string;
  name: string;
  createdAt?: string;
  /** Present when the organization is not active. */
  status?: TOrganizationLifecycle;
}

/** One of the signed-in account's memberships, as the organization switcher lists them. */
export interface TOrganizationMembership {
  organization: TOrganization;
  role: string;
  status: TOrganizationMemberStatus;
  /** Whether this is the organization the current session acts in. */
  current: boolean;
  /** The platform operator is visiting it, not a member of it (listed only while current). */
  visiting?: boolean;
}

export interface TOrganizationMember {
  id: string;
  name?: string;
  username?: string;
  email: string;
  avatar?: string;
  role: string;
  status: TOrganizationMemberStatus;
  createdAt?: string;
}

export interface TOrganizationInvite {
  id: string;
  kind: TOrganizationInviteKind;
  email?: string;
  role: string;
  status: TOrganizationInviteStatus;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  invitedBy?: { id: string; name?: string };
  createdAt?: string;
}

/** What anyone holding an invite link may learn before signing in. */
export interface TOrganizationInvitePreview {
  organization: Pick<TOrganization, 'id' | 'name'>;
  kind: TOrganizationInviteKind;
  inviterName?: string;
  /** Only for email invites: the address it is bound to, so the form can prefill it. */
  email?: string;
}

/** A pending email invite addressed to the signed-in account. */
export interface TPendingOrganizationInvite {
  id: string;
  organization: Pick<TOrganization, 'id' | 'name'>;
  inviterName?: string;
  role: string;
  expiresAt: string;
}

export interface TCreateOrganizationRequest {
  name: string;
}

export interface TCreateOrganizationInviteRequest {
  kind: TOrganizationInviteKind;
  email?: string;
  role?: string;
  /** Link invites only; defaults to `organizations.invites.defaultMaxLinkUses`. */
  maxUses?: number;
}

export interface TCreateOrganizationInviteResponse {
  invite: TOrganizationInvite;
  /** The redeemable URL. Returned once, at creation or resend; never stored in clear. */
  url: string;
  /** Whether the invite email was sent; when not, share `url` yourself. */
  emailSent: boolean;
}

export interface TUpdateOrganizationMemberRequest {
  role: string;
}

/** Body of a create, switch or accept response: the session that now acts in the organization. */
export interface TOrganizationSessionResponse {
  token: string;
  /** The member the token names. */
  user: TUser;
  organization: TOrganization;
}

/** After leaving: the next organization's session, or an onboarding token when none is left. */
export type TLeaveOrganizationResponse = { left: true } & (
  | TOrganizationSessionResponse
  | { onboardingToken?: string; token?: undefined; organization?: undefined }
);

export interface TOrganizationErrorResponse {
  code: TOrganizationErrorCode;
  message?: string;
}

export interface TOrganizationsResponse {
  organizations: TOrganizationMembership[];
}

export interface TCurrentOrganizationResponse {
  organization: TOrganization;
  role: string;
}

export interface TOrganizationMembersResponse {
  members: TOrganizationMember[];
}

export interface TOrganizationInvitesResponse {
  invites: TOrganizationInvite[];
}

export interface TPendingOrganizationInvitesResponse {
  invites: TPendingOrganizationInvite[];
}
