import type { TOrganizationErrorCode, TOrganizationMemberStatus } from 'librechat-data-provider';
import type { Request, Response } from 'express';

type Id = { toString(): string };

/**
 * The user-record fields the organization auth layer reads. Login accounts, organization
 * members and single-tenant users all share the `User` collection; these fields tell them
 * apart: an account lives in the accounts tenant, a member names its account in `identityId`.
 */
export interface AuthUserRecord {
  _id: Id;
  email?: string;
  name?: string;
  username?: string;
  avatar?: string;
  provider?: string;
  role?: string;
  tenantId?: string;
  identityId?: Id | null;
  status?: TOrganizationMemberStatus;
  emailVerified?: boolean;
  lastActiveTenantId?: string;
  twoFactorEnabled?: boolean;
  twoFactorEnrolledAt?: Date | null;
  credentialsChangedAt?: Date | null;
  /** On a login account (and copied onto its signed-in member): the platform operator. */
  isPlatformOperator?: boolean;
  /** On a member record: the operator's hidden access to an organization. */
  operatorAccess?: boolean;
}

export interface SessionRecord {
  _id: Id;
  expiration: Date;
}

export interface MembershipSummary {
  _id: Id;
  tenantId: string;
  identityId: Id;
  role?: string;
  status?: TOrganizationMemberStatus;
  /** The platform operator's hidden access, not a membership the account was given. */
  operatorAccess?: boolean;
}

export type GetUserById<U extends AuthUserRecord = AuthUserRecord> = (
  userId: string,
  projection?: string | null,
) => Promise<U | null>;

/** What a token issuance produced: an app session, or (for an account that belongs to no
 *  organization yet) a purpose-bound onboarding token and no session. */
export interface IssuedAuth<U extends AuthUserRecord = AuthUserRecord> {
  /** The app access token; absent when onboarding is required. */
  token?: string;
  /** The record the access token names: the member in organizations mode. */
  user?: U;
  /** Present instead of `token` when the account has no active membership. */
  onboardingToken?: string;
}

export interface IssueOptions {
  /** Organizations mode: the organization to open instead of the account's last active one. */
  tenantId?: string;
}

export type IssueAuthTokens<
  U extends AuthUserRecord = AuthUserRecord,
  S extends SessionRecord = SessionRecord,
> = (
  userId: string | Id,
  res: Response,
  session?: S | null,
  req?: Request | null,
  options?: IssueOptions,
) => Promise<IssuedAuth<U>>;

/** A failure an organization flow can name to its caller; the code is safe to send. */
export class OrganizationError extends Error {
  readonly code: TOrganizationErrorCode;
  readonly status: number;

  constructor(code: TOrganizationErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = 'OrganizationError';
    this.code = code;
    this.status = status;
  }
}

export type OrganizationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: TOrganizationErrorCode; status: number } };
