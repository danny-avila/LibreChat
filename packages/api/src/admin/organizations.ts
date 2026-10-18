import { logger, runInTenant, OrganizationStatus } from '@librechat/data-schemas';
import {
  AdminErrorCode,
  OrganizationErrorCode,
  OrganizationMemberStatus,
} from 'librechat-data-provider';
import type {
  TAdminAccount,
  TAdminPerson,
  TAdminOrganization,
  TAdminAccountDetail,
  TAdminOrganizationDetail,
} from 'librechat-data-provider';
import type { IUser, AllMethods, OrganizationRecord } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { RecordAuditEntry } from './audit';
import { createOrganizationAuditor } from '~/organizations/audit';
import { parseOrganizationName } from '~/organizations/service';
import { getSafeErrorMetadata } from '~/utils/errors';

export type AdminOrganizationsDb = Pick<
  AllMethods,
  | 'listOrganizations'
  | 'countOrganizationMembers'
  | 'findOrganization'
  | 'findOrganizationsByTenantIds'
  | 'findAccountsByIds'
  | 'listOrganizationAdmins'
  | 'listOrganizationInvites'
  | 'renameOrganization'
  | 'setOrganizationStatus'
  | 'deleteTenantSessions'
  | 'listTenantMemberIds'
  | 'invalidateAuthUserDocCache'
  | 'listAccounts'
  | 'findAccount'
  | 'listMembershipsForIdentity'
>;

export interface AdminOrganizationsDeps {
  db: AdminOrganizationsDb;
  /** Forgets a cached organization status after this handler changes it. */
  evictOrganizationStatus: (tenantId: string) => void;
  /** Starts erasing an organization marked `deleting`, in the background. */
  startOrganizationDeletion: (tenantId: string, requestedBy: { id: string; name?: string }) => void;
  recordAuditEntry?: RecordAuditEntry;
}

export interface AdminOrganizationsHandlers {
  listOrganizations: (req: ServerRequest, res: Response) => Promise<Response>;
  getOrganization: (req: ServerRequest, res: Response) => Promise<Response>;
  renameOrganization: (req: ServerRequest, res: Response) => Promise<Response>;
  suspendOrganization: (req: ServerRequest, res: Response) => Promise<Response>;
  reactivateOrganization: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteOrganization: (req: ServerRequest, res: Response) => Promise<Response>;
  listAccounts: (req: ServerRequest, res: Response) => Promise<Response>;
  getAccount: (req: ServerRequest, res: Response) => Promise<Response>;
}

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;

function pageSize(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(PAGE_MAX, Math.max(1, Math.floor(value))) : PAGE_DEFAULT;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toPerson(user: Pick<IUser, '_id' | 'name' | 'email'>): TAdminPerson {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

function toAccount(account: IUser): TAdminAccount {
  return {
    id: account._id.toString(),
    name: account.name,
    email: account.email,
    username: account.username,
    emailVerified: account.emailVerified,
    isPlatformOperator: account.isPlatformOperator === true || undefined,
    createdAt: account.createdAt ? new Date(account.createdAt).toISOString() : undefined,
  };
}

function refuse(res: Response, status: number, error: string, errorCode: string): Response {
  return res.status(status).json({ error, error_code: errorCode });
}

/**
 * The platform operator's view of every organization and login account: listing, renaming,
 * suspending, reactivating and permanently deleting organizations. Reached only through the
 * admin scope, which admits the operator alone. Every change is audited on the platform chain.
 */
export function createAdminOrganizationsHandlers(
  deps: AdminOrganizationsDeps,
): AdminOrganizationsHandlers {
  const { db } = deps;
  const audit = createOrganizationAuditor(deps.recordAuditEntry);

  const actorOf = (req: ServerRequest) => ({
    id: req.user?.id ?? req.user?._id?.toString() ?? '',
    name: req.user?.name || req.user?.email,
  });

  async function describe(organizations: OrganizationRecord[]): Promise<TAdminOrganization[]> {
    const [counts, creators] = await Promise.all([
      db.countOrganizationMembers(organizations.map((organization) => organization.tenantId)),
      db.findAccountsByIds(organizations.map((organization) => organization.createdBy)),
    ]);
    const byId = new Map(creators.map((creator) => [creator._id.toString(), toPerson(creator)]));
    return organizations.map((organization) => ({
      id: organization.tenantId,
      name: organization.name,
      status: organization.status ?? OrganizationStatus.ACTIVE,
      createdAt: organization.createdAt
        ? new Date(organization.createdAt).toISOString()
        : undefined,
      createdBy: byId.get(organization.createdBy.toString()),
      memberCount: counts[organization.tenantId]?.members ?? 0,
      adminCount: counts[organization.tenantId]?.admins ?? 0,
    }));
  }

  /** The organization a route names, or `undefined` after answering 404. */
  async function loadOrganization(
    req: ServerRequest,
    res: Response,
  ): Promise<OrganizationRecord | undefined> {
    const tenantId = stringParam((req.params as Record<string, unknown>).tenantId);
    const organization = tenantId ? await db.findOrganization(tenantId) : null;
    if (!organization) {
      refuse(res, 404, 'Organization not found', AdminErrorCode.ORGANIZATION_NOT_FOUND);
      return undefined;
    }
    return organization;
  }

  /** Ends every session in the organization and every cached sign-in of its members. */
  async function signEveryoneOut(tenantId: string): Promise<void> {
    await db.deleteTenantSessions(tenantId);
    const memberIds = await db.listTenantMemberIds(tenantId);
    await Promise.all(memberIds.map((memberId) => db.invalidateAuthUserDocCache(memberId)));
  }

  function sendError(res: Response, action: string, error: unknown): Response {
    logger.error(`[adminOrganizations] ${action} failed`, getSafeErrorMetadata(error));
    return res.status(500).json({ error: `Failed to ${action}` });
  }

  return {
    async listOrganizations(req, res) {
      try {
        const query = req.query as Record<string, unknown>;
        const limit = pageSize(query.limit);
        const page = await db.listOrganizations({
          search: stringParam(query.search),
          status: stringParam(query.status),
          after: stringParam(query.after),
          limit: limit + 1,
        });
        const organizations = await describe(page.slice(0, limit));
        const nextCursor = page.length > limit ? page[limit - 1]._id.toString() : undefined;
        return res.status(200).json({ organizations, nextCursor });
      } catch (error) {
        return sendError(res, 'list organizations', error);
      }
    },

    async getOrganization(req, res) {
      try {
        const organization = await loadOrganization(req, res);
        if (!organization) {
          return res;
        }
        const [[summary], admins, invites] = await Promise.all([
          describe([organization]),
          db.listOrganizationAdmins(organization.tenantId),
          runInTenant(organization.tenantId, () => db.listOrganizationInvites()),
        ]);
        const detail: TAdminOrganizationDetail = {
          ...summary,
          admins: admins.map(toPerson),
          pendingInviteCount: invites.length,
        };
        return res.status(200).json({ organization: detail });
      } catch (error) {
        return sendError(res, 'get organization', error);
      }
    },

    async renameOrganization(req, res) {
      try {
        const organization = await loadOrganization(req, res);
        if (!organization) {
          return res;
        }
        const name = parseOrganizationName((req.body as { name?: unknown } | undefined)?.name);
        if (!name) {
          return res.status(400).json({ code: OrganizationErrorCode.ORG_NAME_INVALID });
        }
        const renamed = await db.renameOrganization(organization.tenantId, name);
        if (!renamed) {
          return refuse(res, 404, 'Organization not found', AdminErrorCode.ORGANIZATION_NOT_FOUND);
        }
        await audit({
          tenantId: organization.tenantId,
          action: 'organization.renamed',
          actor: actorOf(req),
          target: { type: 'organization', id: organization.tenantId, name },
          metadata: { from: organization.name },
        });
        const [described] = await describe([renamed]);
        return res.status(200).json({ organization: described });
      } catch (error) {
        return sendError(res, 'rename organization', error);
      }
    },

    async suspendOrganization(req, res) {
      try {
        const organization = await loadOrganization(req, res);
        if (!organization) {
          return res;
        }
        if (organization.status === OrganizationStatus.DELETING) {
          return refuse(
            res,
            409,
            'Organization is being deleted',
            AdminErrorCode.ORGANIZATION_DELETING,
          );
        }
        if (organization.status !== OrganizationStatus.SUSPENDED) {
          await db.setOrganizationStatus(organization.tenantId, OrganizationStatus.SUSPENDED);
          deps.evictOrganizationStatus(organization.tenantId);
          await signEveryoneOut(organization.tenantId);
          await audit({
            tenantId: organization.tenantId,
            action: 'organization.suspended',
            actor: actorOf(req),
            target: { type: 'organization', id: organization.tenantId, name: organization.name },
          });
        }
        const [described] = await describe([
          { ...organization, status: OrganizationStatus.SUSPENDED },
        ]);
        return res.status(200).json({ organization: described });
      } catch (error) {
        return sendError(res, 'suspend organization', error);
      }
    },

    async reactivateOrganization(req, res) {
      try {
        const organization = await loadOrganization(req, res);
        if (!organization) {
          return res;
        }
        if (organization.status === OrganizationStatus.DELETING) {
          return refuse(
            res,
            409,
            'Organization is being deleted',
            AdminErrorCode.ORGANIZATION_DELETING,
          );
        }
        if (organization.status === OrganizationStatus.SUSPENDED) {
          await db.setOrganizationStatus(organization.tenantId, OrganizationStatus.ACTIVE);
          deps.evictOrganizationStatus(organization.tenantId);
          await audit({
            tenantId: organization.tenantId,
            action: 'organization.reactivated',
            actor: actorOf(req),
            target: { type: 'organization', id: organization.tenantId, name: organization.name },
          });
        }
        const [described] = await describe([
          { ...organization, status: OrganizationStatus.ACTIVE },
        ]);
        return res.status(200).json({ organization: described });
      } catch (error) {
        return sendError(res, 'reactivate organization', error);
      }
    },

    async deleteOrganization(req, res) {
      try {
        const organization = await loadOrganization(req, res);
        if (!organization) {
          return res;
        }
        const confirmName = (req.body as { confirmName?: unknown } | undefined)?.confirmName;
        if (typeof confirmName !== 'string' || confirmName.trim() !== organization.name) {
          return refuse(
            res,
            400,
            'Type the organization name to confirm',
            AdminErrorCode.CONFIRMATION_MISMATCH,
          );
        }
        if (organization.status !== OrganizationStatus.DELETING) {
          await db.setOrganizationStatus(organization.tenantId, OrganizationStatus.DELETING);
          deps.evictOrganizationStatus(organization.tenantId);
          await signEveryoneOut(organization.tenantId);
        }
        deps.startOrganizationDeletion(organization.tenantId, actorOf(req));
        return res
          .status(202)
          .json({ id: organization.tenantId, status: OrganizationStatus.DELETING });
      } catch (error) {
        return sendError(res, 'delete organization', error);
      }
    },

    async listAccounts(req, res) {
      try {
        const query = req.query as Record<string, unknown>;
        const limit = pageSize(query.limit);
        const page = await db.listAccounts({
          search: stringParam(query.search),
          after: stringParam(query.after),
          limit: limit + 1,
        });
        const accounts = page.slice(0, limit).map(toAccount);
        const nextCursor = page.length > limit ? page[limit - 1]._id.toString() : undefined;
        return res.status(200).json({ accounts, nextCursor });
      } catch (error) {
        return sendError(res, 'list accounts', error);
      }
    },

    async getAccount(req, res) {
      try {
        const accountId = stringParam((req.params as Record<string, unknown>).accountId);
        const account = accountId ? await db.findAccount(accountId) : null;
        if (!account) {
          return res.status(404).json({ error: 'Account not found' });
        }
        /* The operator's own visits are not memberships the account was given. */
        const memberships = (await db.listMembershipsForIdentity(account._id)).filter(
          (membership) => membership.operatorAccess !== true,
        );
        const organizations = await db.findOrganizationsByTenantIds(
          memberships.map((membership) => membership.tenantId),
        );
        const byTenant = new Map(organizations.map((org) => [org.tenantId, org]));
        const detail: TAdminAccountDetail = {
          ...toAccount(account),
          memberships: memberships.flatMap((membership) => {
            const organization = byTenant.get(membership.tenantId);
            return organization
              ? [
                  {
                    organization: {
                      id: organization.tenantId,
                      name: organization.name,
                      status: organization.status ?? OrganizationStatus.ACTIVE,
                    },
                    role: membership.role ?? '',
                    status: membership.status ?? OrganizationMemberStatus.ACTIVE,
                  },
                ]
              : [];
          }),
        };
        return res.status(200).json({ account: detail });
      } catch (error) {
        return sendError(res, 'get account', error);
      }
    },
  };
}
