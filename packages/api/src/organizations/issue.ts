import {
  logger,
  runAsSystem,
  runInTenant,
  OrganizationStatus,
  ACCOUNTS_TENANT_ID,
} from '@librechat/data-schemas';
import {
  OrganizationErrorCode,
  OrganizationMemberStatus,
  ORGANIZATION_ONBOARDING_REQUIRED_CODE,
} from 'librechat-data-provider';
import type { TOrganizationOnboardingResponse } from 'librechat-data-provider';
import type { TOrganizationStatus } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type {
  IssuedAuth,
  GetUserById,
  IssueOptions,
  SessionRecord,
  AuthUserRecord,
  IssueAuthTokens,
  MembershipSummary,
} from './types';
import { withAccountCredentials } from './identity';
import { OrganizationError } from './types';

type Id = { toString(): string };

export interface AuthIssuerDeps<U extends AuthUserRecord, S extends SessionRecord> {
  getUserById: GetUserById<U>;
  createSession: (
    userId: string,
    options: { expiresIn: number; identityId?: string },
  ) => Promise<{ session: { expiration?: Date }; refreshToken: string }>;
  generateRefreshToken: (session: S) => Promise<string>;
  generateToken: (user: U, expiresIn: number) => Promise<string>;
  setLocalSessionCookies: (
    res: Response,
    cookie: { refreshToken: string; expires: Date; userId: Id; tenantId?: string },
  ) => void;
  setCloudFrontAuthCookies: (
    req: Request | null,
    res: Response,
    user: U,
    options: { userId: Id },
  ) => unknown;
  listMembershipsForIdentity: (identityId: string) => Promise<MembershipSummary[]>;
  setLastActiveTenant: (identityId: string, tenantId: string) => Promise<void>;
  generateOnboardingToken: (accountId: string) => string;
  /** Read on every issuance, so a changed environment applies without a restart. */
  getExpiries: () => { refreshTokenMs: number; sessionMs: number };
  /**
   * Creates what the account asked for at registration (its organization, or the membership
   * its link invite grants) once it may: the issuer calls this before choosing a membership.
   */
  materializePending?: (account: U) => Promise<void>;
  /**
   * An organization's status (cached). Sessions are issued only into active organizations; the
   * operator's hidden access is exempt, so the operator can still enter a suspended one.
   */
  getOrganizationStatus?: (tenantId: string) => Promise<TOrganizationStatus | null>;
}

/** Controller dependencies that can mint a session; `issueAuthTokens` is preferred when wired. */
export interface SessionMintingDeps<TUserId extends Id, TSession extends SessionRecord | null> {
  setAuthTokens: (
    userId: TUserId,
    res: Response,
    session: TSession,
    req: Request,
  ) => Promise<string>;
  issueAuthTokens?: IssueAuthTokens;
}

/**
 * Mints a session through the issuer when the caller wired one, else through the plain
 * `setAuthTokens` contract (which names no subject and never requires onboarding).
 */
export async function issueAuth<TUserId extends Id, TSession extends SessionRecord | null>(
  deps: SessionMintingDeps<TUserId, TSession>,
  userId: TUserId,
  res: Response,
  session: TSession,
  req: Request,
): Promise<IssuedAuth> {
  if (deps.issueAuthTokens) {
    return deps.issueAuthTokens(userId, res, session, req);
  }
  return { token: await deps.setAuthTokens(userId, res, session, req) };
}

/**
 * Answers a sign-in that organization rules refuse (its organization is suspended) with that
 * stable code, so the client can say why; `undefined` for any other failure.
 */
export function sendOrganizationRefusal(res: Response, error: unknown): Response | undefined {
  if (error instanceof OrganizationError) {
    return res.status(error.status).json({ code: error.code });
  }
  return undefined;
}

/** The sign-in body for an account that must create or join an organization first. */
export function organizationOnboardingResponse(
  onboardingToken: string,
  emailVerified: boolean,
): TOrganizationOnboardingResponse {
  return { code: ORGANIZATION_ONBOARDING_REQUIRED_CODE, onboardingToken, emailVerified };
}

function isActive(membership: MembershipSummary): boolean {
  return membership.status !== OrganizationMemberStatus.DEACTIVATED;
}

/**
 * Memberships the account was given before the operator's visits, then oldest first, so the
 * default organization is stable across sign-ins.
 */
function byPreference(a: MembershipSummary, b: MembershipSummary): number {
  const visits = Number(a.operatorAccess === true) - Number(b.operatorAccess === true);
  return visits || a._id.toString().localeCompare(b._id.toString());
}

/**
 * The one place app sessions are issued. The authenticated subject decides what is issued:
 *
 * - **Login account** (organizations mode, after any credential sign-in): the session and
 *   access token are for one of its members, never for the account itself. The organization
 *   is `options.tenantId`, else the last one used, else the oldest membership. An account
 *   with no active membership gets an onboarding token and no session.
 * - **Organization member** (refreshing its session): re-issued inside its own tenant, so
 *   the session it saves carries that tenant.
 * - **Any other user**: issued exactly as before organizations, in the ambient context.
 */
export function createAuthIssuer<U extends AuthUserRecord, S extends SessionRecord = SessionRecord>(
  deps: AuthIssuerDeps<U, S>,
): IssueAuthTokens<U, S> {
  async function issueSession(
    user: U,
    res: Response,
    session: S | null,
    req: Request | null,
    identityId?: string,
  ): Promise<string> {
    const { refreshTokenMs, sessionMs } = deps.getExpiries();
    let refreshToken: string;
    let refreshTokenExpires: number;

    if (session && session._id && session.expiration != null) {
      refreshTokenExpires = session.expiration.getTime();
      refreshToken = await deps.generateRefreshToken(session);
    } else {
      const created = await deps.createSession(user._id.toString(), {
        expiresIn: refreshTokenMs,
        ...(identityId ? { identityId } : {}),
      });
      refreshToken = created.refreshToken;
      refreshTokenExpires = created.session.expiration?.getTime() ?? Date.now() + refreshTokenMs;
    }

    const token = await deps.generateToken(user, sessionMs);
    deps.setLocalSessionCookies(res, {
      refreshToken,
      expires: new Date(refreshTokenExpires),
      userId: user._id,
      tenantId: user.tenantId,
    });
    deps.setCloudFrontAuthCookies(req, res, user, { userId: user._id });
    return token;
  }

  /** Whether a membership's organization takes sessions now. */
  async function isOpen(tenantId: string, operatorAccess?: boolean): Promise<boolean> {
    if (operatorAccess === true || !deps.getOrganizationStatus) {
      return true;
    }
    return (await deps.getOrganizationStatus(tenantId)) === OrganizationStatus.ACTIVE;
  }

  async function issueForMember(
    member: U,
    res: Response,
    session: S | null,
    req: Request | null,
  ): Promise<IssuedAuth<U>> {
    if (member.status === OrganizationMemberStatus.DEACTIVATED || !member.tenantId) {
      throw new OrganizationError(OrganizationErrorCode.MEMBERSHIP_INACTIVE, 403);
    }
    if (!(await isOpen(member.tenantId, member.operatorAccess))) {
      throw new OrganizationError(OrganizationErrorCode.ORGANIZATION_SUSPENDED, 403);
    }
    const tenantId = member.tenantId;
    const identityId = member.identityId?.toString();
    const token = await runInTenant(tenantId, () =>
      issueSession(member, res, session, req, identityId),
    );
    return { token, user: member };
  }

  async function issueForAccount(
    account: U,
    res: Response,
    req: Request | null,
    options: IssueOptions,
  ): Promise<IssuedAuth<U>> {
    const accountId = account._id.toString();
    if (deps.materializePending && account.emailVerified !== false) {
      try {
        await deps.materializePending(account);
      } catch (error) {
        /* The pending request is restored by its owner; sign-in still proceeds, landing on
         * onboarding if the account has nowhere else to go. */
        logger.error('[issueAuthTokens] Could not create the pending organization access', error);
      }
    }

    const active = (await deps.listMembershipsForIdentity(accountId))
      .filter(isActive)
      .sort(byPreference);
    const open = await Promise.all(
      active.map((membership) => isOpen(membership.tenantId, membership.operatorAccess)),
    );
    const memberships = active.filter((_, index) => open[index]);
    const requested = options.tenantId
      ? memberships.find((membership) => membership.tenantId === options.tenantId)
      : undefined;
    if (options.tenantId && !requested) {
      const closed = active.some((membership) => membership.tenantId === options.tenantId);
      throw closed
        ? new OrganizationError(OrganizationErrorCode.ORGANIZATION_SUSPENDED, 403)
        : new OrganizationError(OrganizationErrorCode.NOT_A_MEMBER, 403);
    }
    const target =
      requested ??
      memberships.find((membership) => membership.tenantId === account.lastActiveTenantId) ??
      memberships[0];

    if (!target) {
      /* Every organization the account belongs to is suspended: say so rather than onboard. */
      if (active.length > 0) {
        throw new OrganizationError(OrganizationErrorCode.ORGANIZATION_SUSPENDED, 403);
      }
      return { onboardingToken: deps.generateOnboardingToken(accountId) };
    }

    const member = await runInTenant(target.tenantId, () =>
      deps.getUserById(target._id.toString()),
    );
    if (!member) {
      throw new OrganizationError(OrganizationErrorCode.NOT_A_MEMBER, 403);
    }
    const issued = await issueForMember(member, res, null, req);
    if (account.lastActiveTenantId !== target.tenantId) {
      await deps.setLastActiveTenant(accountId, target.tenantId);
    }
    return { token: issued.token, user: withAccountCredentials(member, account) };
  }

  return async function issueAuthTokens(userId, res, session = null, req = null, options = {}) {
    const subject = await runAsSystem(() => deps.getUserById(userId.toString()));
    if (!subject) {
      throw new Error('[issueAuthTokens] The authenticated user no longer exists');
    }
    if (subject.tenantId === ACCOUNTS_TENANT_ID) {
      return issueForAccount(subject, res, req, options);
    }
    if (subject.identityId) {
      return issueForMember(subject, res, session, req);
    }
    /* Names no subject: callers keep the response body they built before organizations. */
    return { token: await issueSession(subject, res, session, req) };
  };
}
