import { SystemRoles } from 'librechat-data-provider';
import { logger, runAsSystem, tenantStorage, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  AdminTenant,
  AdminTenantAdmin,
  ITenant,
  IToken,
  IUser,
  TenantStatus,
} from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { IsPlatformAdminFn } from '~/middleware/platform';
import { createInvite, type InviteDeps } from '~/auth/invite';
import {
  adjustPaginationForPending,
  collectRegisteredEmails,
  filterInvitesBySearch,
  filterPendingInvitesForRegisteredEmails,
  inviteDisplayName,
} from './pendingInvites';
import { parsePagination } from './pagination';

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SEARCH_LENGTH = 200;
const VALID_STATUSES: ReadonlySet<string> = new Set(['active', 'suspended', 'archived']);

interface CreateTenantBody {
  name?: string;
  description?: string;
}

interface UpdateTenantBody {
  name?: string;
  description?: string;
  status?: string;
}

interface InviteTenantAdminBody {
  email?: string;
}

export interface SendInviteEmailFn {
  (params: {
    email: string;
    subject: string;
    payload: Record<string, unknown>;
    template: string;
  }): Promise<unknown>;
}

const TENANT_ADMIN_FIELDS = '_id name email tenantId createdAt';

const TENANT_ADMIN_FILTER: FilterQuery<IUser> = {
  role: SystemRoles.ADMIN,
  tenantId: { $exists: true, $nin: [null, ''] },
};

export interface AdminTenantsDeps {
  findUser: (filter: { email: string }) => Promise<IUser | null>;
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
    options?: { limit?: number; offset?: number; sort?: Record<string, 1 | -1> },
  ) => Promise<IUser[]>;
  countUsers: (filter?: FilterQuery<IUser>) => Promise<number>;
  findTenantById: (tenantId: string) => Promise<ITenant | null>;
  createInviteToken: InviteDeps['createToken'];
  findInviteToken: InviteDeps['findToken'];
  sendInviteEmail: SendInviteEmailFn;
  getClientDomain: () => string;
  getAppTitle: () => string;
  isEmailConfigured: () => boolean;
  findTenantByObjectId: (id: string) => Promise<ITenant | null>;
  listTenants: (options?: {
    status?: TenantStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }) => Promise<ITenant[]>;
  countTenants: (filter?: { status?: TenantStatus; search?: string }) => Promise<number>;
  createTenant: (input: {
    name: string;
    description?: string;
    createdBy?: string;
  }) => Promise<ITenant>;
  deleteTenantByObjectId: (id: string) => Promise<boolean>;
  updateTenantByObjectId: (
    id: string,
    data: { name?: string; description?: string; status?: TenantStatus },
  ) => Promise<ITenant | null>;
  seedTenantSystemGrants: (tenantId: string) => Promise<void>;
  seedDefaultRolesForTenant: (tenantId: string) => Promise<Record<string, unknown>>;
  countUsersByTenantId: (tenantId: string) => Promise<number>;
  deleteGrantsForTenant: (tenantId: string) => Promise<void>;
  isPlatformAdmin: IsPlatformAdminFn;
  findPendingUserInvites: (filter: {
    tenantId?: string;
    role?: 'ADMIN' | 'USER';
  }) => Promise<IToken[]>;
}

function toAdminTenant(tenant: ITenant, userCount?: number): AdminTenant {
  return {
    id: tenant._id.toString(),
    tenantId: tenant.tenantId,
    name: tenant.name,
    description: tenant.description ?? '',
    status: tenant.status,
    ...(userCount != null && { userCount }),
    ...(tenant.createdAt && { createdAt: tenant.createdAt.toISOString() }),
    ...(tenant.updatedAt && { updatedAt: tenant.updatedAt.toISOString() }),
  };
}

function getRequestUserId(req: ServerRequest): string | undefined {
  return req.user?.id ?? req.user?._id?.toString();
}

export function createAdminTenantsHandlers(deps: AdminTenantsDeps) {
  const {
    findUser,
    findUsers,
    countUsers,
    findTenantById,
    createInviteToken,
    findInviteToken,
    sendInviteEmail,
    getClientDomain,
    getAppTitle,
    isEmailConfigured,
    findTenantByObjectId,
    listTenants,
    countTenants,
    createTenant,
    deleteTenantByObjectId,
    updateTenantByObjectId,
    seedTenantSystemGrants,
    seedDefaultRolesForTenant,
    countUsersByTenantId,
    deleteGrantsForTenant,
    isPlatformAdmin,
    findPendingUserInvites,
  } = deps;

  async function listTenantsHandler(req: ServerRequest, res: Response) {
    try {
      const { search, status } = req.query as { search?: string; status?: string };
      if (search && search.length > MAX_SEARCH_LENGTH) {
        return res
          .status(400)
          .json({ error: `search must not exceed ${MAX_SEARCH_LENGTH} characters` });
      }
      const filter: { status?: TenantStatus; search?: string } = {};
      if (status && VALID_STATUSES.has(status)) {
        filter.status = status as TenantStatus;
      }
      if (search) {
        filter.search = search;
      }
      const { limit, offset } = parsePagination(req.query);
      const [tenants, total] = await Promise.all([
        listTenants({ ...filter, limit, offset }),
        countTenants(filter),
      ]);
      const tenantsWithCounts = await Promise.all(
        tenants.map(async (tenant) => {
          const userCount = await countUsersByTenantId(tenant.tenantId);
          return toAdminTenant(tenant, userCount);
        }),
      );
      return res.status(200).json({ tenants: tenantsWithCounts, total });
    } catch (err) {
      logger.error('[admin/tenants] listTenants failed', err);
      return res.status(500).json({ error: 'Failed to list tenants' });
    }
  }

  async function createTenantHandler(req: ServerRequest, res: Response) {
    try {
      const body = req.body as CreateTenantBody;
      const name = body.name?.trim();
      const description = body.description?.trim();
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return res
          .status(400)
          .json({ error: `name must not exceed ${MAX_NAME_LENGTH} characters` });
      }
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        return res
          .status(400)
          .json({ error: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
      }

      const createdBy = getRequestUserId(req);
      let tenant: ITenant | null = null;
      try {
        tenant = await createTenant({
          name,
          ...(description && { description }),
          ...(createdBy && { createdBy }),
        });
        const tenantSlug = tenant.tenantId;
        await tenantStorage.run({ tenantId: tenantSlug }, async () => {
          await seedDefaultRolesForTenant(tenantSlug);
          await seedTenantSystemGrants(tenantSlug);
        });
      } catch (provisionErr) {
        if (tenant) {
          await deleteTenantByObjectId(tenant._id.toString()).catch((rollbackErr) => {
            logger.error('[admin/tenants] Failed to roll back tenant after provision error', {
              tenantId: tenant?.tenantId,
              rollbackErr,
            });
          });
        }
        throw provisionErr;
      }

      return res.status(201).json({ tenant: toAdminTenant(tenant, 0) });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return res.status(409).json({ error: 'Tenant already exists' });
      }
      logger.error('[admin/tenants] createTenant failed', err);
      return res.status(500).json({ error: 'Failed to create tenant' });
    }
  }

  async function getTenantHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid tenant ID format' });
      }

      const tenant = await findTenantByObjectId(id);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const capabilityUser = {
        id: getRequestUserId(req) ?? '',
        role: req.user?.role ?? '',
        tenantId: (req.user as { tenantId?: string } | undefined)?.tenantId,
      };
      const platformAdmin = capabilityUser.id ? await isPlatformAdmin(capabilityUser) : false;
      if (!platformAdmin && capabilityUser.tenantId !== tenant.tenantId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const userCount = await countUsersByTenantId(tenant.tenantId);
      return res.status(200).json({ tenant: toAdminTenant(tenant, userCount) });
    } catch (err) {
      logger.error('[admin/tenants] getTenant failed', err);
      return res.status(500).json({ error: 'Failed to get tenant' });
    }
  }

  async function updateTenantHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid tenant ID format' });
      }

      const body = req.body as UpdateTenantBody;
      const update: { name?: string; description?: string; status?: TenantStatus } = {};
      if (body.name != null) {
        const name = body.name.trim();
        if (!name) {
          return res.status(400).json({ error: 'name cannot be empty' });
        }
        if (name.length > MAX_NAME_LENGTH) {
          return res
            .status(400)
            .json({ error: `name must not exceed ${MAX_NAME_LENGTH} characters` });
        }
        update.name = name;
      }
      if (body.description != null) {
        const description = body.description.trim();
        if (description.length > MAX_DESCRIPTION_LENGTH) {
          return res
            .status(400)
            .json({ error: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
        }
        update.description = description;
      }
      if (body.status != null) {
        if (!VALID_STATUSES.has(body.status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        update.status = body.status as TenantStatus;
      }
      if (!Object.keys(update).length) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const tenant = await updateTenantByObjectId(id, update);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }
      const userCount = await countUsersByTenantId(tenant.tenantId);
      return res.status(200).json({ tenant: toAdminTenant(tenant, userCount) });
    } catch (err) {
      logger.error('[admin/tenants] updateTenant failed', err);
      return res.status(500).json({ error: 'Failed to update tenant' });
    }
  }

  async function deleteTenantHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid tenant ID format' });
      }

      const tenant = await findTenantByObjectId(id);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const tenantSlug = tenant.tenantId;
      const deleted = await runAsSystem(async () => {
        const userCount = await countUsersByTenantId(tenantSlug);
        if (userCount > 0) {
          return {
            ok: false as const,
            status: 409,
            error: 'Tenant has users and cannot be deleted',
          };
        }

        await deleteGrantsForTenant(tenantSlug);
        const removed = await deleteTenantByObjectId(id);
        if (!removed) {
          return { ok: false as const, status: 404, error: 'Tenant not found' };
        }

        return { ok: true as const };
      });

      if (!deleted.ok) {
        return res.status(deleted.status).json({ error: deleted.error });
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('[admin/tenants] deleteTenant failed', err);
      return res.status(500).json({ error: 'Failed to delete tenant' });
    }
  }

  async function listTenantAdminsHandler(req: ServerRequest, res: Response) {
    try {
      const { search, tenant: tenantMongoId } = req.query as {
        search?: string;
        tenant?: string;
      };
      if (search && search.length > MAX_SEARCH_LENGTH) {
        return res
          .status(400)
          .json({ error: `search must not exceed ${MAX_SEARCH_LENGTH} characters` });
      }

      const filter: FilterQuery<IUser> = { ...TENANT_ADMIN_FILTER };
      let tenantSlugFilter: string | undefined;

      if (tenantMongoId) {
        if (!isValidObjectIdString(tenantMongoId)) {
          return res.status(400).json({ error: 'Invalid tenant ID format' });
        }
        const tenant = await findTenantByObjectId(tenantMongoId);
        if (!tenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        tenantSlugFilter = tenant.tenantId;
        filter.tenantId = tenant.tenantId;
      }

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'i');
        filter.$or = [{ name: pattern }, { email: pattern }];
      }

      const { limit, offset } = parsePagination(req.query);

      const registeredUserFilter: FilterQuery<IUser> = tenantSlugFilter
        ? { tenantId: tenantSlugFilter }
        : {};
      const [registeredUsers, rawInvites] = await runAsSystem(() =>
        Promise.all([
          findUsers(registeredUserFilter, 'email'),
          findPendingUserInvites({
            ...(tenantSlugFilter && { tenantId: tenantSlugFilter }),
            role: SystemRoles.ADMIN,
          }),
        ]),
      );

      const pendingInvites = filterPendingInvitesForRegisteredEmails(
        filterInvitesBySearch(rawInvites, search),
        collectRegisteredEmails(registeredUsers),
      );
      const { userLimit, userOffset } = adjustPaginationForPending(
        limit,
        offset,
        pendingInvites.length,
      );

      const [users, totalAdmins] = await runAsSystem(() =>
        Promise.all([
          findUsers(filter, TENANT_ADMIN_FIELDS, {
            limit: userLimit,
            offset: userOffset,
            sort: { createdAt: -1 },
          }),
          countUsers(filter),
        ]),
      );

      const tenantSlugs = [
        ...new Set(
          [...users.map((u) => u.tenantId), ...pendingInvites.map((i) => i.tenantId)].filter(
            Boolean,
          ),
        ),
      ] as string[];
      const tenantNames = await Promise.all(
        tenantSlugs.map(async (slug) => {
          const tenant = await findTenantById(slug);
          return [slug, tenant?.name ?? slug] as const;
        }),
      );
      const tenantNameBySlug = new Map(tenantNames);

      const activeAdmins: AdminTenantAdmin[] = users.map((user) => ({
        id: user._id?.toString() ?? '',
        name: user.name ?? '',
        email: user.email ?? '',
        tenantId: user.tenantId ?? '',
        tenantName: tenantNameBySlug.get(user.tenantId ?? '') ?? user.tenantId ?? '',
        status: 'active',
        ...(user.createdAt && { createdAt: user.createdAt.toISOString() }),
      }));

      const pendingRows: AdminTenantAdmin[] =
        offset === 0
          ? pendingInvites.map((invite) => {
              const email = invite.email?.trim().toLowerCase() ?? '';
              const slug = invite.tenantId ?? '';
              return {
                id: `invite:${invite._id?.toString() ?? email}`,
                name: inviteDisplayName(email),
                email,
                tenantId: slug,
                tenantName: tenantNameBySlug.get(slug) ?? slug,
                status: 'pending' as const,
                invitedAt: invite.createdAt?.toISOString(),
              };
            })
          : [];

      const admins = [...pendingRows, ...activeAdmins];
      const total = totalAdmins + pendingInvites.length;

      return res.status(200).json({ admins, total });
    } catch (err) {
      logger.error('[admin/tenants] listTenantAdmins failed', err);
      return res.status(500).json({ error: 'Failed to list tenant admins' });
    }
  }

  async function inviteTenantAdminHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid tenant ID format' });
      }

      const email = (req.body as InviteTenantAdminBody).email?.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      const tenant = await findTenantByObjectId(id);
      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found' });
      }

      const existingUser = await runAsSystem(async () => findUser({ email }));
      const userTenantId = existingUser?.tenantId?.trim();
      if (existingUser && (!userTenantId || userTenantId === tenant.tenantId)) {
        return res.status(409).json({ error: 'A user with that email already exists' });
      }

      const token = await createInvite(
        email,
        { createToken: createInviteToken, findToken: findInviteToken },
        { role: SystemRoles.ADMIN, tenantId: tenant.tenantId },
      );
      if (typeof token !== 'string') {
        return res.status(500).json({ error: token.message ?? 'Failed to create invite' });
      }

      const inviteLink = `${getClientDomain()}/register?token=${token}`;
      const emailConfigured = isEmailConfigured();

      if (!emailConfigured) {
        return res.status(200).json({
          success: true,
          emailSent: false,
          inviteLink,
        });
      }

      const appName = getAppTitle();
      await sendInviteEmail({
        email,
        subject: `Invite to join ${appName}`,
        payload: {
          appName,
          inviteLink,
          year: new Date().getFullYear(),
        },
        template: 'inviteUser.handlebars',
      });

      return res.status(200).json({ success: true, emailSent: true });
    } catch (err) {
      logger.error('[admin/tenants] inviteTenantAdmin failed', err);
      return res.status(500).json({ error: 'Failed to send tenant admin invite' });
    }
  }

  return {
    listTenants: listTenantsHandler,
    listTenantAdmins: listTenantAdminsHandler,
    createTenant: createTenantHandler,
    getTenant: getTenantHandler,
    updateTenant: updateTenantHandler,
    deleteTenant: deleteTenantHandler,
    inviteTenantAdmin: inviteTenantAdminHandler,
  };
}
