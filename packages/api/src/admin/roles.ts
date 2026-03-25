import { logger } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { IRole, IUser } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types/http';
import type { FilterQuery } from 'mongoose';
import type { Response } from 'express';

interface RoleNameParams {
  name: string;
}

interface RoleMemberParams extends RoleNameParams {
  userId: string;
}

interface AdminMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  joinedAt: string;
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
  listUsersByRole: (roleName: string) => Promise<IUser[]>;
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
    listUsersByRole,
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
      const { name, permissions } = req.body as {
        name?: string;
        permissions?: IRole['permissions'];
      };
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      const role = await createRoleByName({
        name: name.trim(),
        permissions: permissions || {},
      });
      return res.status(201).json({ role });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create role';
      logger.error('[adminRoles] createRole error:', error);
      const status = message.includes('already exists') || message.includes('reserved') ? 409 : 500;
      return res.status(status).json({ error: message });
    }
  }

  async function updateRoleHandler(req: ServerRequest, res: Response) {
    try {
      const { name } = req.params as RoleNameParams;
      const body = req.body as Partial<IRole>;

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      const updates: Partial<IRole> = {};
      if (body.name !== undefined) {
        updates.name = body.name;
      }

      const role = await updateRoleByName(name, updates);
      return res.status(200).json({ role });
    } catch (error) {
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

      if (!permissions || typeof permissions !== 'object') {
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

      const existing = await getRoleByName(name);
      if (!existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      await deleteRoleByName(name);
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

      const users = await listUsersByRole(name);
      const members: AdminMember[] = users.map((u) => ({
        userId: u._id?.toString() ?? '',
        name: u.name ?? u._id?.toString() ?? '',
        email: u.email ?? '',
        avatarUrl: u.avatar,
        joinedAt: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
      }));
      return res.status(200).json({ members });
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
