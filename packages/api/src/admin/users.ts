import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { IUser, AdminUserSearchResult, UserDeleteResult } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types/http';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';

export interface AdminUsersDeps {
  findUsers: (
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
  ) => Promise<IUser[]>;
  deleteUserById: (userId: string) => Promise<UserDeleteResult>;
}

export function createAdminUsersHandlers(deps: AdminUsersDeps) {
  const { findUsers, deleteUserById } = deps;

  async function listUsersHandler(_req: ServerRequest, res: Response) {
    try {
      const users = await findUsers(
        {},
        '_id name username email avatar role provider createdAt updatedAt',
      );

      const mapped = users.map((u) => ({
        id: u._id?.toString() ?? '',
        name: u.name ?? '',
        username: u.username ?? '',
        email: u.email ?? '',
        avatar: u.avatar ?? '',
        role: u.role ?? 'USER',
        provider: u.provider ?? 'local',
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : new Date().toISOString(),
      }));

      return res.status(200).json({ users: mapped, total: users.length });
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
      );

      const results: AdminUserSearchResult[] = users.slice(0, searchLimit).map((u) => ({
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
