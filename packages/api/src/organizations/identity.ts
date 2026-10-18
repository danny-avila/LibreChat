import { OrganizationMemberStatus } from 'librechat-data-provider';
import {
  runAsSystem,
  isReservedTenantId,
  OrganizationStatus,
  ACCOUNTS_TENANT_ID,
} from '@librechat/data-schemas';
import type { TOrganizationStatus } from '@librechat/data-schemas';
import type { AuthUserRecord, GetUserById } from './types';

/**
 * Account fields that decide whether a credential is still good. A member record carries none
 * of them, so every auth decision about a member reads them from its login account.
 */
export const ACCOUNT_CREDENTIAL_FIELDS = [
  'provider',
  'emailVerified',
  'twoFactorEnabled',
  'twoFactorEnrolledAt',
  'credentialsChangedAt',
] as const;

const ACCOUNT_PROJECTION = `tenantId email name username lastActiveTenantId isPlatformOperator ${ACCOUNT_CREDENTIAL_FIELDS.join(' ')}`;
const MEMBERSHIP_FIELDS = 'identityId tenantId status operatorAccess';

/** The login account behind an authenticated member, as account routes need it. */
export type AuthIdentity = Pick<
  AuthUserRecord,
  | '_id'
  | 'email'
  | 'name'
  | 'username'
  | 'tenantId'
  | 'lastActiveTenantId'
  | 'isPlatformOperator'
  | (typeof ACCOUNT_CREDENTIAL_FIELDS)[number]
>;

/* Keyed by the loaded user object, so the identity rides along with `req.user` without
 * becoming an enumerable field that a handler could serialize into a response. */
const authIdentities = new WeakMap<object, AuthIdentity>();

/** The login account a loaded member belongs to; `undefined` for any other user. */
export function getAuthIdentity(user: object | null | undefined): AuthIdentity | undefined {
  return user ? authIdentities.get(user) : undefined;
}

/** An inclusion projection must also name the fields that tell a member from an account. */
function withMembershipFields(projection?: string | null): string | null | undefined {
  if (!projection) {
    return projection;
  }
  const fields = projection.trim().split(/\s+/);
  const inclusive = fields.some((field) => !field.startsWith('-') && !field.startsWith('+'));
  return inclusive ? `${projection} ${MEMBERSHIP_FIELDS}` : projection;
}

export interface AuthUserLoaderDeps<U extends AuthUserRecord> {
  getUserById: GetUserById<U>;
  /**
   * The member's organization status (cached). A member of an organization that is not active
   * (suspended, being deleted or gone) is refused; the operator's hidden access never is.
   */
  getOrganizationStatus?: (tenantId: string) => Promise<TOrganizationStatus | null>;
}

export type LoadAuthUser<U extends AuthUserRecord> = (
  userId: string,
  projection?: string | null,
  accountId?: string,
  /** The token's `tid` claim: the member's organization, read in the same parallel round. */
  tenantId?: string,
) => Promise<U | null>;

/**
 * Loads the subject of an app credential for an auth decision. The read is by `_id` across
 * tenants (the subject's tenant is what the credential establishes).
 *
 * - A login account or any other reserved-tenant record is refused: no app credential names
 *   one, so a token that does was not issued by this server.
 * - A single-tenant user is returned as is.
 * - An organization member is refused when deactivated or when `accountId` (the token's
 *   `aid` claim) names another account; otherwise it is returned with its account's
 *   credential state overlaid, so retirement and 2FA checks see the account's. Passing
 *   `accountId` lets both records load in one parallel round.
 */
export function createAuthUserLoader<U extends AuthUserRecord>(
  deps: AuthUserLoaderDeps<U>,
): LoadAuthUser<U> {
  const { getOrganizationStatus } = deps;
  return async function loadAuthUser(userId, projection, accountId, tenantId) {
    const [subject, prefetched, prefetchedStatus] = await runAsSystem(async () =>
      Promise.all([
        deps.getUserById(userId, withMembershipFields(projection)),
        accountId ? deps.getUserById(accountId, ACCOUNT_PROJECTION) : Promise.resolve(null),
        tenantId && getOrganizationStatus
          ? getOrganizationStatus(tenantId)
          : Promise.resolve(undefined),
      ]),
    );
    if (!subject || isReservedTenantId(subject.tenantId)) {
      return null;
    }
    if (!subject.identityId) {
      return subject;
    }
    if (subject.status === OrganizationMemberStatus.DEACTIVATED) {
      return null;
    }

    const identityId = subject.identityId.toString();
    if (accountId && accountId !== identityId) {
      return null;
    }
    if (getOrganizationStatus && subject.tenantId && subject.operatorAccess !== true) {
      const status =
        tenantId === subject.tenantId && prefetchedStatus !== undefined
          ? prefetchedStatus
          : await getOrganizationStatus(subject.tenantId);
      if (status !== OrganizationStatus.ACTIVE) {
        return null;
      }
    }
    const account =
      prefetched ?? (await runAsSystem(() => deps.getUserById(identityId, ACCOUNT_PROJECTION)));
    if (!account || account.tenantId !== ACCOUNTS_TENANT_ID) {
      return null;
    }
    return withAccountCredentials(subject, account);
  };
}

/**
 * A copy of `member` that answers credential questions with its account's state, carrying the
 * account for `getAuthIdentity`. Responses built from it show the signed-in person's real 2FA
 * and provider state rather than the member record's empty one.
 */
export function withAccountCredentials<U extends AuthUserRecord>(member: U, account: U): U {
  const user = { ...member } as U;
  const credentialState = user as Record<string, unknown>;
  const accountState = account as unknown as Record<string, unknown>;
  for (const field of ACCOUNT_CREDENTIAL_FIELDS) {
    credentialState[field] = accountState[field];
  }
  /* The client shows admin entry points from this; the server never trusts it: admin requests
   * re-check the account through `getAuthIdentity`. */
  if (account.isPlatformOperator === true) {
    user.isPlatformOperator = true;
  } else {
    delete user.isPlatformOperator;
  }
  authIdentities.set(user, {
    _id: account._id,
    email: account.email,
    name: account.name,
    username: account.username,
    tenantId: account.tenantId,
    lastActiveTenantId: account.lastActiveTenantId,
    isPlatformOperator: account.isPlatformOperator === true,
    provider: account.provider,
    emailVerified: account.emailVerified,
    twoFactorEnabled: account.twoFactorEnabled,
    twoFactorEnrolledAt: account.twoFactorEnrolledAt,
    credentialsChangedAt: account.credentialsChangedAt,
  });
  return user;
}

type ViolationSubject = {
  id?: string;
  _id?: { toString(): string };
  identityId?: { toString(): string } | null;
} | null;

/**
 * The id violation counts and bans key on: the login account behind an organization member,
 * so switching organizations neither escapes a ban nor resets a count, and a sign-in (which
 * resolves the account) sees bans earned inside any organization. Other users key on their id.
 */
export function getViolationSubjectId(user?: ViolationSubject): string | undefined {
  return user?.identityId?.toString() ?? user?.id ?? user?._id?.toString();
}

export interface AuthSessionHelperDeps<U extends AuthUserRecord, Q, O, S> {
  getUserById: GetUserById<U>;
  findSession: (query: Q, options?: O) => Promise<S>;
  deleteSession: (query: { sessionId: string }) => Promise<object>;
  deleteAllUserSessions: (input: { userId: string }) => Promise<object>;
  deleteAllAccountSessions: (accountId: string) => Promise<object>;
  /** Read per call: the mode is applied at startup, after these helpers are wired. */
  isOrganizationsEnabled: () => boolean;
  getOrganizationStatus?: (tenantId: string) => Promise<TOrganizationStatus | null>;
}

export interface AuthSessionHelpers<U extends AuthUserRecord, Q, O, S> {
  /** Loads an app credential's subject; a member answers with its account's credentials. */
  getAuthUserById: LoadAuthUser<U>;
  /** Revokes every session the principal can mint from, in every organization. */
  deleteAllPrincipalSessions: (input: { userId: string }) => Promise<object>;
  /** Finds a refresh session wherever its member lives; credential routes run elsewhere. */
  findAuthSession: (query: Q, options?: O) => Promise<S>;
  deleteAuthSession: (query: { sessionId: string }) => Promise<object>;
}

/**
 * The auth-time user and session lookups, organization-aware when organizations are enabled
 * and exactly the plain database methods otherwise.
 */
export function createAuthSessionHelpers<U extends AuthUserRecord, Q, O, S>(
  deps: AuthSessionHelperDeps<U, Q, O, S>,
): AuthSessionHelpers<U, Q, O, S> {
  const loadAuthUser = createAuthUserLoader({
    getUserById: deps.getUserById,
    getOrganizationStatus: deps.getOrganizationStatus,
  });
  const revokePrincipalSessions = createPrincipalSessionRevoker({
    getUserById: deps.getUserById,
    deleteAllUserSessions: deps.deleteAllUserSessions,
    deleteAllAccountSessions: deps.deleteAllAccountSessions,
  });
  return {
    getAuthUserById: (userId, projection, accountId, tenantId) =>
      deps.isOrganizationsEnabled()
        ? loadAuthUser(userId, projection, accountId, tenantId)
        : deps.getUserById(userId, projection),
    deleteAllPrincipalSessions: (input) =>
      deps.isOrganizationsEnabled()
        ? revokePrincipalSessions(input)
        : deps.deleteAllUserSessions(input),
    /* Forwards exactly the caller's arguments, so an omitted `options` stays omitted. */
    findAuthSession: (...args) =>
      deps.isOrganizationsEnabled()
        ? runAsSystem(() => deps.findSession(...args))
        : deps.findSession(...args),
    deleteAuthSession: (query) =>
      deps.isOrganizationsEnabled()
        ? runAsSystem(() => deps.deleteSession(query))
        : deps.deleteSession(query),
  };
}

export interface PrincipalSessionRevokerDeps {
  getUserById: GetUserById;
  deleteAllUserSessions: (input: { userId: string }) => Promise<object>;
  deleteAllAccountSessions: (accountId: string) => Promise<object>;
}

/**
 * Revokes every session a principal can mint from. For an account or any of its members that
 * is every session of the account, in every organization: a password reset, a ban or a 2FA
 * enrollment must not leave another organization's session alive. Any other user keeps the
 * existing per-user revocation.
 */
export function createPrincipalSessionRevoker(
  deps: PrincipalSessionRevokerDeps,
): (input: { userId: string }) => Promise<object> {
  return async ({ userId }) => {
    const user = await runAsSystem(() => deps.getUserById(userId, 'tenantId identityId'));
    if (user?.identityId) {
      return deps.deleteAllAccountSessions(user.identityId.toString());
    }
    if (user?.tenantId === ACCOUNTS_TENANT_ID) {
      return deps.deleteAllAccountSessions(userId);
    }
    return deps.deleteAllUserSessions({ userId });
  };
}
