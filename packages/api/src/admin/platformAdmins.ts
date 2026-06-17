import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import {
  logger,
  runAsSystem,
  SystemCapabilities,
  isValidObjectIdString,
} from '@librechat/data-schemas';
import type { AdminPlatformAdmin, IToken, IUser } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createInvite, type InviteDeps } from '~/auth/invite';
import {
  adjustPaginationForPending,
  collectRegisteredEmails,
  filterInvitesBySearch,
  filterPendingInvitesForRegisteredEmails,
  inviteDisplayName,
  isPlatformAdminInvite,
} from './pendingInvites';
import { parsePagination } from './pagination';

const MAX_SEARCH_LENGTH = 200;
const PLATFORM_ADMIN_FIELDS = '_id name email createdAt';
const PLATFORM_USER_FILTER: FilterQuery<IUser> = {
  $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }],
};

interface InvitePlatformAdminBody {
  email?: string;
}

interface UpdatePlatformAdminBody {
  name?: string;
}

export interface SendInviteEmailFn {
  (params: {
    email: string;
    subject: string;
    payload: Record<string, unknown>;
    template: string;
  }): Promise<unknown>;
}

export interface AdminPlatformAdminsDeps {
  findUser: (filter: FilterQuery<IUser>) => Promise<IUser | null>;
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
    options?: { limit?: number; offset?: number; sort?: Record<string, 1 | -1> },
  ) => Promise<IUser[]>;
  updateUser: (userId: string, data: Partial<IUser>) => Promise<IUser | null>;
  deleteUserById: (userId: string) => Promise<{ deletedCount: number; message?: string }>;
  deleteGrantsForPrincipal: (principalType: PrincipalType, principalId: string) => Promise<void>;
  seedSuperAdminGrants: (userId: string) => Promise<void>;
  getPlatformAdminUserIds: () => Promise<Set<string>>;
  createInviteToken: InviteDeps['createToken'];
  findInviteToken: InviteDeps['findToken'];
  sendInviteEmail: SendInviteEmailFn;
  getClientDomain: () => string;
  getAppTitle: () => string;
  isEmailConfigured: () => boolean;
  findPendingUserInvites: (filter: {
    tenantId?: string;
    role?: 'ADMIN' | 'USER';
  }) => Promise<IToken[]>;
}

function getCallerUserId(req: ServerRequest): string | undefined {
  return req.user?.id ?? req.user?._id?.toString();
}

export function createAdminPlatformAdminsHandlers(deps: AdminPlatformAdminsDeps) {
  const {
    findUser,
    findUsers,
    updateUser,
    deleteUserById,
    deleteGrantsForPrincipal,
    seedSuperAdminGrants,
    getPlatformAdminUserIds,
    createInviteToken,
    findInviteToken,
    sendInviteEmail,
    getClientDomain,
    getAppTitle,
    isEmailConfigured,
    findPendingUserInvites,
  } = deps;

  async function countActivePlatformAdmins(): Promise<number> {
    const ids = await getPlatformAdminUserIds();
    return ids.size;
  }

  async function ensureCanRemovePlatformAdmin(
    targetUserId: string,
    callerUserId: string | undefined,
  ): Promise<string | null> {
    if (callerUserId && targetUserId === callerUserId) {
      return 'Cannot remove your own platform admin access';
    }
    const adminIds = await getPlatformAdminUserIds();
    if (adminIds.size <= 1 && adminIds.has(targetUserId)) {
      return 'Cannot remove the last platform admin';
    }
    return null;
  }

  async function listPlatformAdminsHandler(req: ServerRequest, res: Response) {
    try {
      const { search } = req.query as { search?: string };
      if (search && search.length > MAX_SEARCH_LENGTH) {
        return res
          .status(400)
          .json({ error: `search must not exceed ${MAX_SEARCH_LENGTH} characters` });
      }

      const { limit, offset } = parsePagination(req.query);
      const adminIds = await getPlatformAdminUserIds();

      const [registeredUsers, rawInvites] = await runAsSystem(() =>
        Promise.all([
          findUsers(PLATFORM_USER_FILTER, 'email'),
          findPendingUserInvites({ role: SystemRoles.ADMIN }),
        ]),
      );

      const platformInvites = filterInvitesBySearch(
        rawInvites.filter(isPlatformAdminInvite),
        search,
      );
      const pendingInvites = filterPendingInvitesForRegisteredEmails(
        platformInvites,
        collectRegisteredEmails(registeredUsers),
      );

      const { userLimit, userOffset } = adjustPaginationForPending(
        limit,
        offset,
        pendingInvites.length,
      );

      const userFilter: FilterQuery<IUser> = {
        _id: { $in: [...adminIds] },
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }],
      };
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'i');
        userFilter.$and = [
          { _id: { $in: [...adminIds] } },
          { $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }] },
          { $or: [{ name: pattern }, { email: pattern }] },
        ];
        delete userFilter._id;
        delete userFilter.$or;
      }

      const users = await runAsSystem(() =>
        findUsers(userFilter, PLATFORM_ADMIN_FIELDS, {
          limit: userLimit,
          offset: userOffset,
          sort: { createdAt: -1 },
        }),
      );

      const activeAdmins: AdminPlatformAdmin[] = users.map((user) => ({
        id: user._id?.toString() ?? '',
        name: user.name ?? '',
        email: user.email ?? '',
        status: 'active',
        ...(user.createdAt && { createdAt: user.createdAt.toISOString() }),
      }));

      const pendingRows: AdminPlatformAdmin[] =
        offset === 0
          ? pendingInvites.map((invite) => {
              const email = invite.email?.trim().toLowerCase() ?? '';
              return {
                id: `invite:${invite._id?.toString() ?? email}`,
                name: inviteDisplayName(email),
                email,
                status: 'pending' as const,
                invitedAt: invite.createdAt?.toISOString(),
              };
            })
          : [];

      const admins = [...pendingRows, ...activeAdmins];
      const total = adminIds.size + pendingInvites.length;

      return res.status(200).json({ admins, total });
    } catch (err) {
      logger.error('[admin/platform-admins] listPlatformAdmins failed', err);
      return res.status(500).json({ error: 'Failed to list platform admins' });
    }
  }

  async function invitePlatformAdminHandler(req: ServerRequest, res: Response) {
    try {
      const email = (req.body as InvitePlatformAdminBody).email?.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      const existingUser = await runAsSystem(() => findUser({ email }));
      if (existingUser) {
        const tenantId = existingUser.tenantId?.trim();
        if (tenantId) {
          return res.status(409).json({
            error: 'User belongs to a tenant and cannot be promoted to platform admin',
          });
        }
        const adminIds = await getPlatformAdminUserIds();
        const userId = existingUser._id?.toString() ?? '';
        if (adminIds.has(userId)) {
          return res.status(409).json({ error: 'User is already a platform admin' });
        }
        await runAsSystem(() => seedSuperAdminGrants(userId));
        return res.status(200).json({ success: true, promoted: true });
      }

      const token = await createInvite(
        email,
        { createToken: createInviteToken, findToken: findInviteToken },
        { role: SystemRoles.ADMIN, scope: 'platform' },
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
        subject: `Platform admin invite for ${appName}`,
        payload: {
          appName,
          inviteLink,
          year: new Date().getFullYear(),
        },
        template: 'inviteUser.handlebars',
      });

      return res.status(200).json({ success: true, emailSent: true });
    } catch (err) {
      logger.error('[admin/platform-admins] invitePlatformAdmin failed', err);
      return res.status(500).json({ error: 'Failed to invite platform admin' });
    }
  }

  async function updatePlatformAdminHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const adminIds = await getPlatformAdminUserIds();
      if (!adminIds.has(id)) {
        return res.status(404).json({ error: 'Platform admin not found' });
      }

      const name = (req.body as UpdatePlatformAdminBody).name?.trim();
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const updated = await runAsSystem(() => updateUser(id, { name }));
      if (!updated) {
        return res.status(404).json({ error: 'Platform admin not found' });
      }

      return res.status(200).json({
        admin: {
          id,
          name: updated.name ?? name,
          email: updated.email ?? '',
          status: 'active' as const,
          ...(updated.createdAt && { createdAt: updated.createdAt.toISOString() }),
        },
      });
    } catch (err) {
      logger.error('[admin/platform-admins] updatePlatformAdmin failed', err);
      return res.status(500).json({ error: 'Failed to update platform admin' });
    }
  }

  async function revokePlatformAdminHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const adminIds = await getPlatformAdminUserIds();
      if (!adminIds.has(id)) {
        return res.status(404).json({ error: 'Platform admin not found' });
      }

      const guardError = await ensureCanRemovePlatformAdmin(id, getCallerUserId(req));
      if (guardError) {
        return res.status(400).json({ error: guardError });
      }

      await runAsSystem(() => deleteGrantsForPrincipal(PrincipalType.USER, id));
      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('[admin/platform-admins] revokePlatformAdmin failed', err);
      return res.status(500).json({ error: 'Failed to revoke platform admin access' });
    }
  }

  async function deletePlatformAdminHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const adminIds = await getPlatformAdminUserIds();
      if (!adminIds.has(id)) {
        return res.status(404).json({ error: 'Platform admin not found' });
      }

      const guardError = await ensureCanRemovePlatformAdmin(id, getCallerUserId(req));
      if (guardError) {
        return res.status(400).json({ error: guardError });
      }

      await runAsSystem(async () => {
        await deleteGrantsForPrincipal(PrincipalType.USER, id);
        await deleteUserById(id);
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error('[admin/platform-admins] deletePlatformAdmin failed', err);
      return res.status(500).json({ error: 'Failed to delete platform admin' });
    }
  }

  return {
    listPlatformAdmins: listPlatformAdminsHandler,
    invitePlatformAdmin: invitePlatformAdminHandler,
    updatePlatformAdmin: updatePlatformAdminHandler,
    revokePlatformAdmin: revokePlatformAdminHandler,
    deletePlatformAdmin: deletePlatformAdminHandler,
    countActivePlatformAdmins,
  };
}
