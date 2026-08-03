import { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  IUser,
  IConfig,
  AdminUserListItem,
  AdminUserSearchResult,
  UserDeleteResult,
} from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

const MAX_SEARCH_LENGTH = 200;

const USER_LIST_FIELDS = '_id name username email avatar role provider createdAt updatedAt';

export interface AdminUsersDeps {
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
  /**
   * Stops the user's scheduled work and confirms the drain. Unlike the rest of the
   * cascade this endpoint defers, scheduled runs are ACTIVE: a fire already generating
   * keeps persisting messages (and billing) after the user document is gone, and the
   * engine keeps claiming occurrences. Returns false when the drain could not be
   * confirmed, in which case deletion must be refused rather than proceed.
   */
  quiesceUserSchedules: (userId: string) => Promise<boolean>;
  /** Raises the durable, one-way account-deletion barrier. Must run BEFORE the quiesce:
   *  the quiesce is a one-shot scan, and only the barrier refuses admission to work
   *  created after it. */
  markUserDeleting: (userId: string) => Promise<Date | null>;
  /** Commits the deletion to automatic completion; only committed rows are swept. */
  markUserDeletionCommitted: (userId: string) => Promise<void>;
  /** Hard-deletes the user's Schedule/ScheduleRun rows. Not left to the reconciler's
   *  `deleting` sweep, which the clustered entrypoint never runs. */
  deleteSchedulesByUser: (userId: string) => Promise<void>;
}

export function createAdminUsersHandlers(deps: AdminUsersDeps): {
  listUsers: (req: ServerRequest, res: Response) => Promise<Response>;
  searchUsers: (req: ServerRequest, res: Response) => Promise<Response>;
  deleteUser: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    findUsers,
    countUsers,
    deleteUserById,
    deleteConfig,
    deleteAclEntries,
    quiesceUserSchedules,
    markUserDeleting,
    markUserDeletionCommitted,
    deleteSchedulesByUser,
  } = deps;

  async function listUsersHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const [users, total] = await Promise.all([
        findUsers({}, USER_LIST_FIELDS, { limit, offset, sort: { createdAt: -1 } }),
        countUsers(),
      ]);

      const mapped: AdminUserListItem[] = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        username: u.username ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? '',
        role: u.role ?? 'USER',
        provider: u.provider ?? 'local',
        createdAt: u.createdAt?.toISOString(),
        updatedAt: u.updatedAt?.toISOString(),
      }));

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

      const users = await findUsers(
        { $or: [{ name: regex }, { email: regex }, { username: regex }] },
        '_id name email username avatar',
        { limit: searchLimit, sort: { name: 1 } },
      );

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

      const [targetUser] = await findUsers({ _id: id }, 'role', { limit: 1 });
      if (targetUser?.role === SystemRoles.ADMIN) {
        const adminCount = await countUsers({ role: SystemRoles.ADMIN });
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot delete the last admin user' });
        }
      }

      // COMMIT to automatic completion BEFORE the barrier, exactly as the
      // self-service controller orders it: the barrier refuses authentication, and
      // the background sweep only finishes COMMITTED deletions — an uncommitted
      // barrier (worker exit here, or an unretried 503 below) locked the account
      // with its data retained indefinitely. Committed-without-barrier is inert.
      let committed = false;
      for (let attempt = 1; attempt <= 3 && !committed; attempt++) {
        committed = await markUserDeletionCommitted(id).then(
          () => true,
          (error) => {
            logger.error(`[adminUsers] Failed to commit deletion (attempt ${attempt}/3)`, error);
            return false;
          },
        );
      }
      if (!committed) {
        res.set('Retry-After', '30');
        return res.status(503).json({ error: 'Could not start deletion. Please retry shortly.' });
      }

      // Raise the durable barrier next, exactly as the self-service controller does.
      // The quiesce below is a one-shot disable + active-run scan, so a schedule create
      // or Run Now that overlaps it can pass its own admission check, land after the
      // scan, and arm or dispatch while the user document is being removed. Only the
      // barrier refuses that admission for the rest of the cascade.
      const barrierRaised = await markUserDeleting(id).then(
        () => true,
        (error) => {
          logger.error('[adminUsers] Failed to raise the deletion barrier', error);
          return false;
        },
      );
      if (!barrierRaised) {
        res.set('Retry-After', '30');
        return res.status(503).json({ error: 'Could not start deletion. Please retry shortly.' });
      }

      // Stop scheduled work BEFORE removing the user. The rest of this endpoint's
      // cascade is deliberately deferred (see deleteUserById), but scheduled runs are
      // not dormant data: an in-flight fire keeps persisting messages and billing after
      // the user document is gone. Refuse rather than delete on an unconfirmed drain,
      // mirroring the self-service controller.
      const quiesced = await quiesceUserSchedules(id).catch((error) => {
        logger.error('[adminUsers] Failed to quiesce scheduled chats', error);
        return false;
      });
      if (!quiesced) {
        res.set('Retry-After', '30');
        return res.status(503).json({
          error: 'Scheduled work for this user is still settling. Please retry shortly.',
        });
      }

      // Hard-delete the schedule rows rather than relying on the reconciler's
      // `deleting` sweep: the clustered `experimental.js` entrypoint never arms the
      // engine, so in that topology nothing would ever erase them and the deleted
      // user's prompt text would persist indefinitely. REFUSE on failure, before the
      // user document goes: once it is deleted this endpoint 404s on retry, making the
      // leftover rows unretryable — the exact retention this hard delete exists to
      // prevent. The barrier is up and quiesce confirmed, so refusing here is safe and
      // the admin simply retries. Mirrors the self-service controller's ordering.
      const schedulesDeleted = await deleteSchedulesByUser(id).then(
        () => true,
        (error) => {
          logger.error('[adminUsers] Failed to delete schedules for the removed user', error);
          return false;
        },
      );
      if (!schedulesDeleted) {
        res.set('Retry-After', '30');
        return res.status(503).json({
          error: 'Could not remove scheduled chats for this user. Please retry shortly.',
        });
      }

      const result = await deleteUserById(id);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUser?.role === SystemRoles.ADMIN) {
        const remaining = await countUsers({ role: SystemRoles.ADMIN });
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

  return {
    listUsers: listUsersHandler,
    searchUsers: searchUsersHandler,
    deleteUser: deleteUserHandler,
  };
}
