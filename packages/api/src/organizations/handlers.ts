import { logger } from '@librechat/data-schemas';
import { OrganizationErrorCode } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { IssueAuthTokens, OrganizationResult, AuthUserRecord } from './types';
import type { OrganizationAccountRequest } from './auth';
import type { OrganizationService } from './service';
import type { InviteService } from './invites';
import { sanitizeUserForAuthResponse } from '~/auth/localRefresh';
import { toOrganization, toOrganizationMember } from './dto';
import { getAuthIdentity } from './identity';
import { OrganizationError } from './types';

type MemberRequest = OrganizationAccountRequest;

export interface OrganizationHandlerDeps {
  organizations: OrganizationService;
  invites: InviteService;
  /** Always called without a session to rotate: these routes start fresh ones. */
  issueAuthTokens: IssueAuthTokens<AuthUserRecord, never>;
  /** Ends the session the request's refresh cookie belongs to, wherever it lives. */
  revokeCurrentSession: (req: Request) => Promise<void>;
}

function sendFailure(res: Response, error: { code: string; status: number }): Response {
  return res.status(error.status).json({ code: error.code });
}

function sendError(res: Response, context: string, error: unknown): Response {
  if (error instanceof OrganizationError) {
    return sendFailure(res, error);
  }
  logger.error(`[organizations] ${context}`, error);
  return res.status(500).json({ message: 'Something went wrong' });
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The current member as an actor; `requireJwtAuth` has established its tenant. */
function actorOf(req: MemberRequest) {
  const user = req.user;
  if (!user?.tenantId || !getAuthIdentity(user)) {
    throw new OrganizationError(OrganizationErrorCode.NOT_A_MEMBER, 403);
  }
  return { id: user.id, role: user.role, tenantId: user.tenantId, name: user.name };
}

type Req = OrganizationAccountRequest;

export interface OrganizationHandlers {
  listOrganizations(req: Req, res: Response): Promise<Response>;
  createOrganization(req: Req, res: Response): Promise<Response>;
  switchOrganization(req: Req, res: Response): Promise<Response>;
  getCurrentOrganization(req: Req, res: Response): Promise<Response>;
  renameOrganization(req: Req, res: Response): Promise<Response>;
  listMembers(req: Req, res: Response): Promise<Response>;
  updateMember(req: Req, res: Response): Promise<Response>;
  deactivateMember(req: Req, res: Response): Promise<Response>;
  leaveOrganization(req: Req, res: Response): Promise<Response>;
  listInvites(req: Req, res: Response): Promise<Response>;
  createInvite(req: Req, res: Response): Promise<Response>;
  revokeInvite(req: Req, res: Response): Promise<Response>;
  resendInvite(req: Req, res: Response): Promise<Response>;
  previewInvite(req: Request, res: Response): Promise<Response>;
  acceptInvite(req: Req, res: Response): Promise<Response>;
  listPendingInvites(req: Req, res: Response): Promise<Response>;
  acceptPendingInvite(req: Req, res: Response): Promise<Response>;
}

export function createOrganizationHandlers(deps: OrganizationHandlerDeps): OrganizationHandlers {
  const { organizations, invites } = deps;

  /**
   * Starts a session in `tenantId` for the account and answers with it, ending the session
   * the request came from: one browser holds one organization session at a time.
   */
  async function sendOrganizationSession(
    req: OrganizationAccountRequest,
    res: Response,
    accountId: string,
    tenantId: string,
  ): Promise<Response> {
    await deps.revokeCurrentSession(req);
    const issued = await deps.issueAuthTokens(accountId, res, null, req, { tenantId });
    const organization = await organizations.getOrganization(tenantId);
    if (!issued.token || !issued.user || !organization) {
      throw new OrganizationError(OrganizationErrorCode.NOT_A_MEMBER, 403);
    }
    return res.status(200).json({
      token: issued.token,
      user: { ...sanitizeUserForAuthResponse(issued.user), id: issued.user._id.toString() },
      organization: toOrganization(organization),
    });
  }

  function accountOf(req: OrganizationAccountRequest): AuthUserRecord {
    if (!req.organizationAccount) {
      throw new OrganizationError(OrganizationErrorCode.NOT_A_MEMBER, 403);
    }
    return req.organizationAccount;
  }

  async function finishAccepted(
    req: OrganizationAccountRequest,
    res: Response,
    result: OrganizationResult<{ tenantId: string }>,
  ): Promise<Response> {
    if (!result.ok) {
      return sendFailure(res, result.error);
    }
    return sendOrganizationSession(req, res, accountOf(req)._id.toString(), result.value.tenantId);
  }

  return {
    async listOrganizations(req: OrganizationAccountRequest, res: Response) {
      try {
        const account = accountOf(req);
        const current = (req.user as { tenantId?: string } | undefined)?.tenantId;
        const list = await organizations.listAccountOrganizations(account._id.toString(), current);
        return res.status(200).json({ organizations: list });
      } catch (error) {
        return sendError(res, 'listOrganizations', error);
      }
    },

    async createOrganization(req: OrganizationAccountRequest, res: Response) {
      try {
        const account = accountOf(req);
        const result = await organizations.createOrganizationForAccount(account, req.body?.name);
        if (!result.ok) {
          return sendFailure(res, result.error);
        }
        return await sendOrganizationSession(
          req,
          res,
          account._id.toString(),
          result.value.organization.tenantId,
        );
      } catch (error) {
        return sendError(res, 'createOrganization', error);
      }
    },

    async switchOrganization(req: OrganizationAccountRequest, res: Response) {
      try {
        const account = accountOf(req);
        const tenantId = stringParam(req.body?.organizationId);
        if (!tenantId) {
          return sendFailure(res, { code: OrganizationErrorCode.NOT_A_MEMBER, status: 400 });
        }
        if (account.isPlatformOperator === true) {
          const entered = await organizations.enterAsOperator(account, tenantId);
          if (!entered.ok) {
            return sendFailure(res, entered.error);
          }
        }
        return await sendOrganizationSession(req, res, account._id.toString(), tenantId);
      } catch (error) {
        return sendError(res, 'switchOrganization', error);
      }
    },

    async getCurrentOrganization(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const organization = await organizations.getOrganization(actor.tenantId);
        if (!organization) {
          return sendFailure(res, { code: OrganizationErrorCode.NOT_A_MEMBER, status: 404 });
        }
        return res
          .status(200)
          .json({ organization: toOrganization(organization), role: actor.role });
      } catch (error) {
        return sendError(res, 'getCurrentOrganization', error);
      }
    },

    async renameOrganization(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const result = await organizations.renameCurrentOrganization(actor, req.body?.name);
        return result.ok
          ? res.status(200).json({ organization: toOrganization(result.value) })
          : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'renameOrganization', error);
      }
    },

    async listMembers(req: MemberRequest, res: Response) {
      try {
        actorOf(req);
        const limit = Number(req.query?.limit);
        const members = await organizations.listMembers({
          limit: Number.isFinite(limit) ? limit : undefined,
          after: stringParam(req.query?.after),
          search: stringParam(req.query?.search),
        });
        return res.status(200).json({ members: members.map(toOrganizationMember) });
      } catch (error) {
        return sendError(res, 'listMembers', error);
      }
    },

    async updateMember(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const result = await organizations.changeMemberRole(
          actor,
          String(req.params.memberId),
          req.body?.role,
        );
        return result.ok
          ? res.status(200).json({ member: toOrganizationMember(result.value) })
          : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'updateMember', error);
      }
    },

    async deactivateMember(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const memberId = String(req.params.memberId);
        if (memberId === actor.id) {
          /* Leaving is its own action, so an admin cannot lock themselves out by a misclick. */
          return sendFailure(res, { code: OrganizationErrorCode.MEMBER_NOT_FOUND, status: 400 });
        }
        const result = await organizations.deactivateMember(actor, memberId);
        return result.ok
          ? res.status(200).json({ member: toOrganizationMember(result.value) })
          : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'deactivateMember', error);
      }
    },

    /**
     * Leaving ends the session in that organization, so the answer carries the next one: the
     * account's next organization, or an onboarding token when it has none left.
     */
    async leaveOrganization(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        /* `actorOf` has established that the member has a login account. */
        const accountId = getAuthIdentity(req.user)?._id.toString() ?? '';
        const result = await organizations.leaveOrganization(actor);
        if (!result.ok) {
          return sendFailure(res, result.error);
        }
        await deps.revokeCurrentSession(req);
        const issued = await deps.issueAuthTokens(accountId, res, null, req);
        if (!issued.token || !issued.user?.tenantId) {
          return res.status(200).json({ left: true, onboardingToken: issued.onboardingToken });
        }
        const organization = await organizations.getOrganization(issued.user.tenantId);
        return res.status(200).json({
          left: true,
          token: issued.token,
          user: { ...sanitizeUserForAuthResponse(issued.user), id: issued.user._id.toString() },
          organization: organization ? toOrganization(organization) : undefined,
        });
      } catch (error) {
        return sendError(res, 'leaveOrganization', error);
      }
    },

    async listInvites(req: MemberRequest, res: Response) {
      try {
        actorOf(req);
        return res.status(200).json({ invites: await invites.listInvites() });
      } catch (error) {
        return sendError(res, 'listInvites', error);
      }
    },

    async createInvite(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const result = await invites.createInvite(actor, req.body ?? {});
        return result.ok ? res.status(201).json(result.value) : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'createInvite', error);
      }
    },

    async revokeInvite(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const result = await invites.revokeInvite(actor, String(req.params.inviteId));
        return result.ok ? res.status(200).json({ revoked: true }) : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'revokeInvite', error);
      }
    },

    async resendInvite(req: MemberRequest, res: Response) {
      try {
        const actor = actorOf(req);
        const result = await invites.resendInvite(actor, String(req.params.inviteId));
        return result.ok ? res.status(200).json(result.value) : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'resendInvite', error);
      }
    },

    async previewInvite(req: Request, res: Response) {
      try {
        const result = await invites.previewInvite(req.params.token);
        return result.ok ? res.status(200).json(result.value) : sendFailure(res, result.error);
      } catch (error) {
        return sendError(res, 'previewInvite', error);
      }
    },

    async acceptInvite(req: OrganizationAccountRequest, res: Response) {
      try {
        const result = await invites.acceptInvite(accountOf(req), req.params.token);
        return await finishAccepted(req, res, result);
      } catch (error) {
        return sendError(res, 'acceptInvite', error);
      }
    },

    async listPendingInvites(req: OrganizationAccountRequest, res: Response) {
      try {
        return res.status(200).json({ invites: await invites.listPendingInvites(accountOf(req)) });
      } catch (error) {
        return sendError(res, 'listPendingInvites', error);
      }
    },

    async acceptPendingInvite(req: OrganizationAccountRequest, res: Response) {
      try {
        const result = await invites.acceptPendingInvite(
          accountOf(req),
          String(req.params.inviteId),
        );
        return await finishAccepted(req, res, result);
      } catch (error) {
        return sendError(res, 'acceptPendingInvite', error);
      }
    },
  };
}

export interface CurrentSessionRevokerDeps {
  /** The request's refresh token cookie, if any. */
  readRefreshToken: (req: Request) => string | undefined;
  /** Looks a session up wherever its member lives (organizations mode reads across tenants). */
  findSession: (query: { refreshToken: string }) => Promise<{ _id: { toString(): string } } | null>;
  deleteSession: (query: { sessionId: string }) => Promise<unknown>;
}

/** Ends the session behind the request's refresh cookie; a missing one is not an error. */
export function createCurrentSessionRevoker(
  deps: CurrentSessionRevokerDeps,
): (req: Request) => Promise<void> {
  return async (req) => {
    const refreshToken = deps.readRefreshToken(req);
    if (!refreshToken) {
      return;
    }
    const session = await deps.findSession({ refreshToken });
    if (session) {
      await deps.deleteSession({ sessionId: session._id.toString() });
    }
  };
}
