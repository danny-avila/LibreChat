import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { IUser, AdminUserSearchResult, UserDeleteResult } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';

const USER_LIST_FIELDS = '_id name username email avatar role provider createdAt updatedAt';

export interface AdminUsersDeps {
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
    options?: { limit?: number; offset?: number },
  ) => Promise<IUser[]>;
  countUsers: (filter?: FilterQuery<IUser>) => Promise<number>;
  deleteUserById: (userId: string) => Promise<UserDeleteResult>;
}

export function createAdminUsersHandlers(deps: AdminUsersDeps) {
  const { findUsers, countUsers, deleteUserById } = deps;

  async function listUsersHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const [users, total] = await Promise.all([
        findUsers({}, USER_LIST_FIELDS, { limit, offset }),
        countUsers(),
      ]);

      const mapped = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        username: u.username ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? '',
        role: u.role ?? 'USER',
        provider: u.provider ?? 'local',
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : undefined,
        updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : undefined,
      }));

      return res.status(200).json({ users: mapped, total, limit, offset });
    } catch (error) {
      logger.error('[adminUsers] listUsers error:', error);
      return res.status(500).json({ error: 'Failed to list users' });
    }
  }

  async function searchUsersHandler(req: ServerRequest, res: Response) {
    try {
      const { q: query, limit = '20' } = req.query as { q?: string; limit?: string };

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }

      if (query.trim().length < 2) {
        return res.status(400).json({ error: 'Query must be at least 2 characters' });
      }

      const searchLimit = Math.min(Math.max(1, parseInt(limit) || 20), 50);
      const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      const users = await findUsers(
        { $or: [{ name: regex }, { email: regex }, { username: regex }] },
        '_id name email avatar',
        { limit: searchLimit },
      );

      const results: AdminUserSearchResult[] = users.map((u) => ({
        userId: u._id?.toString() ?? '',
        name: u.name ?? '',
        email: u.email ?? '',
        avatarUrl: u.avatar,
      }));

      return res.status(200).json({ users: results });
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

      const result = await deleteUserById(id);

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ message: result.message });
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
