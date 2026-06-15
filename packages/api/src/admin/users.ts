import { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import { logger, isValidObjectIdString, runAsSystem } from '@librechat/data-schemas';
import type {
  IUser,
  IToken,
  IConfig,
  AdminUserListItem,
  AdminUserSearchResult,
  UserDeleteResult,
} from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createInvite, type InviteDeps } from '~/auth/invite';
import {
  adjustPaginationForPending,
  collectRegisteredEmails,
  filterPendingInvitesForRegisteredEmails,
  getInviteRoleFromMetadata,
  inviteDisplayName,
} from './pendingInvites';
import { getCallerTenantId, getTenantScopedUserFilter } from './tenant';
import { parsePagination } from './pagination';

const MAX_SEARCH_LENGTH = 200;

const USER_LIST_FIELDS = '_id name username email avatar role provider createdAt updatedAt';

interface InviteUserBody {
  email?: string;
}

async function findExistingUserForTenantInvite(
  findUser: AdminUsersDeps['findUser'],
  email: string,
  targetTenantId: string,
): Promise<IUser | null> {
  const existingUser = await runAsSystem(async () => findUser({ email }));
  if (!existingUser) {
    return null;
  }
  const userTenantId = existingUser.tenantId?.trim();
  if (!userTenantId || userTenantId === targetTenantId) {
    return existingUser;
  }
  return null;
}

export interface SendInviteEmailFn {
  (params: {
    email: string;
    subject: string;
    payload: Record<string, unknown>;
    template: string;
  }): Promise<unknown>;
}

export interface AdminUsersDeps {
  findUser: (filter: FilterQuery<IUser>) => Promise<IUser | null>;
  createInviteToken: InviteDeps['createToken'];
  findInviteToken: InviteDeps['findToken'];
  sendInviteEmail: SendInviteEmailFn;
  getClientDomain: () => string;
  getAppTitle: () => string;
  isEmailConfigured: () => boolean;
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
    options?: { limit?: number; offset?: number; sort?: Record<string, 1 | -1> },
  ) => Promise<IUser[]>;
  countUsers: (filter?: FilterQuery<IUser>) => Promise<number>;
  /**
   * Thin data-layer delete — removes the User document only.
   * Full cascade of user-owned resources (conversations, messages, files, tokens, etc.)
   * is handled by `UserController.deleteUserController` in the self-delete flow.
   * This admin endpoint currently cascades Config and AclEntries.
   * A future iteration should consolidate the full cascade into a shared service function.
   */
  deleteUserById: (userId: string) => Promise<UserDeleteResult>;
  deleteConfig: (
    principalType: PrincipalType,
    principalId: string | Types.ObjectId,
  ) => Promise<IConfig | null>;
  deleteAclEntries: (filter: {
    principalType: PrincipalType;
    principalId: string | Types.ObjectId;
  }) => Promise<void>;
  findPendingUserInvites: (filter: {
    tenantId?: string;
    role?: 'ADMIN' | 'USER';
  }) => Promise<IToken[]>;
}

export function createAdminUsersHandlers(deps: AdminUsersDeps) {
  const {
    findUser,
    createInviteToken,
    findInviteToken,
    sendInviteEmail,
    getClientDomain,
    getAppTitle,
    isEmailConfigured,
    findUsers,
    countUsers,
    deleteUserById,
    deleteConfig,
    deleteAclEntries,
    findPendingUserInvites,
  } = deps;

  async function listUsersHandler(req: ServerRequest, res: Response) {
    try {
      const filter = getTenantScopedUserFilter(req);
      const callerTenantId = getCallerTenantId(req);
      const { limit, offset } = parsePagination(req.query);

      let pendingInvites: IToken[] = [];
      if (callerTenantId) {
        const [registeredUsers, rawInvites] = await Promise.all([
          findUsers(filter, 'email'),
          findPendingUserInvites({ tenantId: callerTenantId, role: SystemRoles.USER }),
        ]);
        pendingInvites = filterPendingInvitesForRegisteredEmails(
          rawInvites,
          collectRegisteredEmails(registeredUsers),
        );
      }

      const { userLimit, userOffset } = adjustPaginationForPending(
        limit,
        offset,
        pendingInvites.length,
      );
      const [users, totalUsers] = await Promise.all([
        findUsers(filter, USER_LIST_FIELDS, {
          limit: userLimit,
          offset: userOffset,
          sort: { createdAt: -1 },
        }),
        countUsers(filter),
      ]);

      const mappedActive: AdminUserListItem[] = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        username: u.username ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? '',
        role: u.role ?? 'USER',
        provider: u.provider ?? 'local',
        status: 'active',
        createdAt: u.createdAt?.toISOString(),
        updatedAt: u.updatedAt?.toISOString(),
      }));

      const pendingRows: AdminUserListItem[] =
        offset === 0
          ? pendingInvites.map((invite) => {
              const email = invite.email?.trim().toLowerCase() ?? '';
              return {
                id: `invite:${invite._id?.toString() ?? email}`,
                name: inviteDisplayName(email),
                username: '',
                email,
                avatar: '',
                role: getInviteRoleFromMetadata(invite.metadata),
                provider: 'invite',
                status: 'pending',
                invitedAt: invite.createdAt?.toISOString(),
              };
            })
          : [];

      const mapped = [...pendingRows, ...mappedActive];
      const total = totalUsers + pendingInvites.length;

      return res.status(200).json({ users: mapped, total, limit, offset });
    } catch (error) {
      logger.error('[adminUsers] listUsers error:', error);
      return res.status(500).json({ error: 'Failed to list users' });
    }
  }

  async function searchUsersHandler(req: ServerRequest, res: Response) {
    try {
      const rawQ = req.query.q;
      const rawLimit = req.query.limit;
      const query = typeof rawQ === 'string' ? rawQ : undefined;
      const limitStr = typeof rawLimit === 'string' ? rawLimit : '20';
      const trimmed = query?.trim() ?? '';

      if (!trimmed) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      if (trimmed.length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
      }

      if (trimmed.length > MAX_SEARCH_LENGTH) {
        return res
          .status(400)
          .json({ error: `Query must not exceed ${MAX_SEARCH_LENGTH} characters` });
      }

      const searchLimit = Math.min(Math.max(1, parseInt(limitStr, 10) || 20), 50);
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped}`, 'i');

      const filter: FilterQuery<IUser> = {
        ...getTenantScopedUserFilter(req),
        $or: [{ name: regex }, { email: regex }, { username: regex }],
      };

      const users = await findUsers(filter, '_id name email username avatar', {
        limit: searchLimit,
        sort: { name: 1 },
      });

      const results: AdminUserSearchResult[] = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        email: u.email ?? '',
        username: u.username,
        avatarUrl: u.avatar,
      }));

      return res
        .status(200)
        .json({ users: results, total: results.length, capped: results.length >= searchLimit });
    } catch (error) {
      logger.error('[adminUsers] searchUsers error:', error);
      return res.status(500).json({ error: 'Failed to search users' });
    }
  }

  async function deleteUserHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };

      if (!isValidObjectIdString(id)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const callerId = req.user?._id?.toString() ?? req.user?.id;
      if (callerId === id) {
        return res.status(403).json({ error: 'Cannot delete your own account' });
      }

      const tenantFilter = getTenantScopedUserFilter(req);
      const [targetUser] = await findUsers({ _id: id, ...tenantFilter }, 'role tenantId', {
        limit: 1,
      });
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const callerTenantId = getCallerTenantId(req);
      if (callerTenantId && targetUser.role === SystemRoles.ADMIN) {
        return res.status(403).json({ error: 'Cannot delete tenant admin users' });
      }

      if (targetUser.role === SystemRoles.ADMIN) {
        const adminCount = await countUsers({ role: SystemRoles.ADMIN, ...tenantFilter });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
      }

      const result = await deleteUserById(id);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUser.role === SystemRoles.ADMIN) {
        const remaining = await countUsers({ role: SystemRoles.ADMIN, ...tenantFilter });
        if (remaining === 0) {
          logger.error(
            `[adminUsers] CRITICAL: last admin deleted via race condition, user: ${id}. ` +
              'Manual DB intervention required to restore an ADMIN user.',
          );
        }
      }

      const objectId = new Types.ObjectId(id);
      const cleanupResults = await Promise.allSettled([
        deleteConfig(PrincipalType.USER, id),
        deleteAclEntries({ principalType: PrincipalType.USER, principalId: objectId }),
      ]);
      for (const r of cleanupResults) {
        if (r.status === 'rejected') {
          logger.error('[adminUsers] cascade cleanup failed for user:', id, r.reason);
        }
      }

      return res.status(200).json({ message: result.message || 'User deleted successfully' });
    } catch (error) {
      logger.error('[adminUsers] deleteUser error:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  async function inviteUserHandler(req: ServerRequest, res: Response) {
    try {
      const callerTenantId = getCallerTenantId(req);
      if (!callerTenantId) {
        return res.status(403).json({ error: 'Only tenant admins can invite users' });
      }

      const email = (req.body as InviteUserBody).email?.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }

      const existingUser = await findExistingUserForTenantInvite(findUser, email, callerTenantId);
      if (existingUser) {
        return res.status(409).json({ error: 'A user with that email already exists' });
      }

      const token = await createInvite(
        email,
        { createToken: createInviteToken, findToken: findInviteToken },
        { tenantId: callerTenantId },
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
    } catch (error) {
      logger.error('[adminUsers] inviteUser error:', error);
      return res.status(500).json({ error: 'Failed to send user invite' });
    }
  }

  return {
    listUsers: listUsersHandler,
    searchUsers: searchUsersHandler,
    deleteUser: deleteUserHandler,
    inviteUser: inviteUserHandler,
  };
}
