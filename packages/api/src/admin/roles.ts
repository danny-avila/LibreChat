import { SystemRoles } from 'librechat-data-provider';
import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { IRole, IUser, AdminMember } from '@librechat/data-schemas';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

const MAX_NAME_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

interface RoleNameParams {
  name: string;
}

interface RoleMemberParams extends RoleNameParams {
  userId: string;
}

export interface AdminRolesDeps {
  listRoles: () => Promise<IRole[]>;
  getRoleByName: (name: string, fields?: string | string[] | null) => Promise<IRole | null>;
  createRoleByName: (roleData: Partial<IRole>) => Promise<IRole>;
  updateRoleByName: (name: string, updates: Partial<IRole>) => Promise<IRole | null>;
  updateAccessPermissions: (
    name: string,
    perms: Record<string, Record<string, boolean>>,
    roleData?: IRole,
  ) => Promise<void>;
  deleteRoleByName: (name: string) => Promise<IRole | null>;
  findUser: (
    criteria: FilterQuery<IUser>,
    fields?: string | string[] | null,
  ) => Promise<IUser | null>;
  updateUser: (userId: string, data: Partial<IUser>) => Promise<IUser | null>;
  updateUsersByRole: (oldRole: string, newRole: string) => Promise<void>;
  listUsersByRole: (
    roleName: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<IUser[]>;
  countUsersByRole: (roleName: string) => Promise<number>;
}

export function createAdminRolesHandlers(deps: AdminRolesDeps) {
  const {
    listRoles,
    getRoleByName,
    createRoleByName,
    updateRoleByName,
    updateAccessPermissions,
    deleteRoleByName,
    findUser,
    updateUser,
    updateUsersByRole,
    listUsersByRole,
    countUsersByRole,
  } = deps;

  async function listRolesHandler(_req: ServerRequest, res: Response) {
    try {
      const roles = await listRoles();
      return res.status(200).json({ roles });
    } catch (error) {
      logger.error('[adminRoles] listRoles error:', error);
      return res.status(500).json({ error: 'Failed to list roles' });
    }
  }

  async function getRoleHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      const role = await getRoleByName(name);
      if (!role) {
        return res.status(404).json({ error: 'Role not found' });
      }
      return res.status(200).json({ role });
    } catch (error) {
      logger.error('[adminRoles] getRole error:', error);
      return res.status(500).json({ error: 'Failed to get role' });
    }
  }

  async function createRoleHandler(req: ServerRequest, res: Response) {
    try {
      const { name, description, permissions } = req.body as {
        name?: string;
        description?: string;
        permissions?: IRole['permissions'];
      };
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (name.trim().length > MAX_NAME_LENGTH) {
        return res
          .status(400)
          .json({ error: `name must not exceed ${MAX_NAME_LENGTH} characters` });
      }
      if (description !== undefined && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        return res
          .status(400)
          .json({ error: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
      }
      const role = await createRoleByName({
        name: name.trim(),
        description: description ?? '',
        permissions: permissions ?? {},
      });
      return res.status(201).json({ role });
    } catch (error) {
      logger.error('[adminRoles] createRole error:', error);
      const is409 =
        error instanceof Error &&
        (error.message.startsWith('Role "') ||
          error.message.startsWith('Cannot create role with reserved'));
      const message = is409 && error instanceof Error ? error.message : 'Failed to create role';
      return res.status(is409 ? 409 : 500).json({ error: message });
    }
  }

  async function updateRoleHandler(req: ServerRequest, res: Response) {
    const { name } = req.params as RoleNameParams;
    const body = req.body as Partial<IRole>;
    let isRename = false;
    let trimmedName = '';
    let migrationRan = false;
    try {
      if (
        body.name !== undefined &&
        (!body.name || typeof body.name !== 'string' || !body.name.trim())
      ) {
        return res.status(400).json({ error: 'name must be a non-empty string' });
      }
      if (body.name !== undefined && body.name.trim().length > MAX_NAME_LENGTH) {
        return res
          .status(400)
          .json({ error: `name must not exceed ${MAX_NAME_LENGTH} characters` });
      }
      if (body.description !== undefined && typeof body.description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' });
      }
      if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
        return res
          .status(400)
          .json({ error: `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters` });
      }

      trimmedName = body.name?.trim() ?? '';
      isRename = trimmedName !== '' && trimmedName !== name;

      if (isRename && SystemRoles[name as keyof typeof SystemRoles]) {
        return res.status(403).json({ error: 'Cannot rename system role' });
      }
      if (isRename && SystemRoles[trimmedName as keyof typeof SystemRoles]) {
        return res.status(409).json({ error: 'Cannot rename to a reserved system role name' });
      }

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      if (isRename) {
        const duplicate = await getRoleByName(trimmedName);
        if (duplicate) {
          return res.status(409).json({ error: `Role "${trimmedName}" already exists` });
        }
      }

      const updates: Partial<IRole> = {};
      if (isRename) {
        updates.name = trimmedName;
      }
      if (body.description !== undefined) {
        updates.description = body.description;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(200).json({ role: existing });
      }

      if (isRename) {
        await updateUsersByRole(name, trimmedName);
        migrationRan = true;
      }

      const role = await updateRoleByName(name, updates);
      if (!role) {
        if (migrationRan) {
          await updateUsersByRole(trimmedName, name);
        }
        return res.status(404).json({ error: 'Role not found' });
      }

      return res.status(200).json({ role });
    } catch (error) {
      if (migrationRan) {
        try {
          await updateUsersByRole(trimmedName, name);
        } catch (rollbackError) {
          logger.error('[adminRoles] rollback failed after updateRole error:', rollbackError);
        }
      }
      logger.error('[adminRoles] updateRole error:', error);
      return res.status(500).json({ error: 'Failed to update role' });
    }
  }

  async function updateRolePermissionsHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      const { permissions } = req.body as {
        permissions: Record<string, Record<string, boolean>>;
      };

      if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
        return res.status(400).json({ error: 'permissions object is required' });
      }

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      await updateAccessPermissions(name, permissions, existing);
      const updated = await getRoleByName(name);
      return res.status(200).json({ role: updated });
    } catch (error) {
      logger.error('[adminRoles] updateRolePermissions error:', error);
      return res.status(500).json({ error: 'Failed to update role permissions' });
    }
  }

  async function deleteRoleHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      if (SystemRoles[name as keyof typeof SystemRoles]) {
        return res.status(403).json({ error: 'Cannot delete system role' });
      }

      const deleted = await deleteRoleByName(name);
      if (!deleted) {
        return res.status(404).json({ error: 'Role not found' });
      }
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminRoles] deleteRole error:', error);
      return res.status(500).json({ error: 'Failed to delete role' });
    }
  }

  async function getRoleMembersHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [users, total] = await Promise.all([
        listUsersByRole(name, { limit, offset }),
        countUsersByRole(name),
      ]);
      const members: AdminMember[] = users.map((u) => ({
        userId: u._id?.toString() ?? '',
        name: u.name ?? u._id?.toString() ?? '',
        email: u.email ?? '',
        avatarUrl: u.avatar,
      }));
      return res.status(200).json({ members, total, limit, offset });
    } catch (error) {
      logger.error('[adminRoles] getRoleMembers error:', error);
      return res.status(500).json({ error: 'Failed to get role members' });
    }
  }

  async function addRoleMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      const { userId } = req.body as { userId: string };

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId is required' });
      }
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const user = await findUser({ _id: userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      await updateUser(userId, { role: name });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminRoles] addRoleMember error:', error);
      return res.status(500).json({ error: 'Failed to add role member' });
    }
  }

  async function removeRoleMemberHandler(req: ServerRequest, res: Response) {
    try {
      const { name, userId } = req.params as RoleMemberParams;
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const user = await findUser({ _id: userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role !== name) {
        return res.status(400).json({ error: 'User is not a member of this role' });
      }

      await updateUser(userId, { role: SystemRoles.USER });
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[adminRoles] removeRoleMember error:', error);
      return res.status(500).json({ error: 'Failed to remove role member' });
    }
  }

  return {
    listRoles: listRolesHandler,
    getRole: getRoleHandler,
    createRole: createRoleHandler,
    updateRole: updateRoleHandler,
    updateRolePermissions: updateRolePermissionsHandler,
    deleteRole: deleteRoleHandler,
    getRoleMembers: getRoleMembersHandler,
    addRoleMember: addRoleMemberHandler,
    removeRoleMember: removeRoleMemberHandler,
  };
}
