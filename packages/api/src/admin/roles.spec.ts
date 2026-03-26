import { Types } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import type { IRole, IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminRolesDeps } from './roles';
import { createAdminRolesHandlers } from './roles';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn() },
}));

const validUserId = new Types.ObjectId().toString();

function mockRole(overrides: Partial<IRole> = {}): IRole {
  return {
    name: 'editor',
    description: 'Can edit content',
    permissions: {},
    ...overrides,
  } as IRole;
}

function mockUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(validUserId),
    name: 'Test User',
    email: 'test@example.com',
    avatar: 'https://example.com/avatar.png',
    role: 'editor',
    ...overrides,
  } as IUser;
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminRolesDeps> = {}): AdminRolesDeps {
  return {
    listRoles: jest.fn().mockResolvedValue([]),
    getRoleByName: jest.fn().mockResolvedValue(null),
    createRoleByName: jest.fn().mockResolvedValue(mockRole()),
    updateRoleByName: jest.fn().mockResolvedValue(mockRole()),
    updateAccessPermissions: jest.fn().mockResolvedValue(undefined),
    deleteRoleByName: jest.fn().mockResolvedValue(mockRole()),
    findUser: jest.fn().mockResolvedValue(null),
    updateUser: jest.fn().mockResolvedValue(mockUser()),
    updateUsersByRole: jest.fn().mockResolvedValue(undefined),
    listUsersByRole: jest.fn().mockResolvedValue([]),
    countUsersByRole: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

describe('createAdminRolesHandlers', () => {
  describe('listRoles', () => {
    it('returns roles with 200', async () => {
      const roles = [mockRole()];
      const deps = createDeps({ listRoles: jest.fn().mockResolvedValue(roles) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listRoles(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ roles });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({ listRoles: jest.fn().mockRejectedValue(new Error('db down')) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listRoles(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to list roles' });
    });
  });

  describe('getRole', () => {
    it('returns role with 200', async () => {
      const role = mockRole();
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(role) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRole(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ role });
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'nonexistent' } });

      await handlers.getRole(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRole(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to get role' });
    });
  });

  describe('createRole', () => {
    it('creates role and returns 201', async () => {
      const role = mockRole();
      const deps = createDeps({ createRoleByName: jest.fn().mockResolvedValue(role) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { name: 'editor', description: 'Can edit' },
      });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(201);
      expect(json).toHaveBeenCalledWith({ role });
      expect(deps.createRoleByName).toHaveBeenCalledWith({
        name: 'editor',
        description: 'Can edit',
        permissions: {},
      });
    });

    it('returns 400 when name is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: {} });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name is required' });
      expect(deps.createRoleByName).not.toHaveBeenCalled();
    });

    it('returns 400 when name is whitespace-only', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: { name: '   ' } });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name is required' });
    });

    it('returns 400 when name exceeds max length', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        body: { name: 'a'.repeat(501) },
      });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name must not exceed 500 characters' });
      expect(deps.createRoleByName).not.toHaveBeenCalled();
    });

    it('returns 409 when role already exists', async () => {
      const deps = createDeps({
        createRoleByName: jest.fn().mockRejectedValue(new Error('Role "editor" already exists')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: { name: 'editor' } });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'Role "editor" already exists' });
    });

    it('returns 409 when name is reserved system role', async () => {
      const deps = createDeps({
        createRoleByName: jest
          .fn()
          .mockRejectedValue(new Error('Cannot create role with reserved system name: ADMIN')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: { name: 'ADMIN' } });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({
        error: 'Cannot create role with reserved system name: ADMIN',
      });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        createRoleByName: jest.fn().mockRejectedValue(new Error('db crash')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ body: { name: 'editor' } });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'db crash' });
    });

    it('does not classify unrelated errors as 409', async () => {
      const deps = createDeps({
        createRoleByName: jest
          .fn()
          .mockRejectedValue(new Error('Disk space reserved for system use')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status } = createReqRes({ body: { name: 'test' } });

      await handlers.createRole(req, res);

      expect(status).toHaveBeenCalledWith(500);
    });
  });

  describe('updateRole', () => {
    it('updates role and returns 200', async () => {
      const role = mockRole({ name: 'senior-editor' });
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValueOnce(mockRole()).mockResolvedValueOnce(null),
        updateRoleByName: jest.fn().mockResolvedValue(role),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: 'senior-editor' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ role });
      expect(deps.updateRoleByName).toHaveBeenCalledWith('editor', { name: 'senior-editor' });
    });

    it('trims name before storage', async () => {
      const role = mockRole({ name: 'trimmed' });
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValueOnce(mockRole()).mockResolvedValueOnce(null),
        updateRoleByName: jest.fn().mockResolvedValue(role),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res } = createReqRes({
        params: { name: 'editor' },
        body: { name: '  trimmed  ' },
      });

      await handlers.updateRole(req, res);

      expect(deps.updateRoleByName).toHaveBeenCalledWith('editor', { name: 'trimmed' });
    });

    it('migrates users after rename', async () => {
      const role = mockRole({ name: 'new-name' });
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValueOnce(mockRole()).mockResolvedValueOnce(null),
        updateRoleByName: jest.fn().mockResolvedValue(role),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { name: 'editor' },
        body: { name: 'new-name' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.updateUsersByRole).toHaveBeenCalledWith('editor', 'new-name');
    });

    it('does not migrate users when name unchanged', async () => {
      const role = mockRole({ description: 'updated' });
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        updateRoleByName: jest.fn().mockResolvedValue(role),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res } = createReqRes({
        params: { name: 'editor' },
        body: { description: 'updated' },
      });

      await handlers.updateRole(req, res);

      expect(deps.updateUsersByRole).not.toHaveBeenCalled();
    });

    it('returns 403 when renaming a system role', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: SystemRoles.ADMIN },
        body: { name: 'custom-admin' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot rename system role' });
      expect(deps.getRoleByName).not.toHaveBeenCalled();
    });

    it('returns 409 when renaming to a system role name', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: SystemRoles.ADMIN },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot rename to a reserved system role name' });
    });

    it('returns 409 when target name already exists', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: 'viewer' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'Role "viewer" already exists' });
    });

    it('returns 400 when name is empty string', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: '' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name must be a non-empty string' });
      expect(deps.getRoleByName).not.toHaveBeenCalled();
    });

    it('returns 400 when name is whitespace-only', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: '   ' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name must be a non-empty string' });
    });

    it('returns 400 when name exceeds max length', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { name: 'a'.repeat(501) },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'name must not exceed 500 characters' });
      expect(deps.getRoleByName).not.toHaveBeenCalled();
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'nonexistent' },
        body: { description: 'updated' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 404 when updateRoleByName returns null', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        updateRoleByName: jest.fn().mockResolvedValue(null),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { description: 'updated' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        updateRoleByName: jest.fn().mockRejectedValue(new Error('db error')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { description: 'updated' },
      });

      await handlers.updateRole(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to update role' });
    });
  });

  describe('updateRolePermissions', () => {
    it('updates permissions and returns 200', async () => {
      const role = mockRole();
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(role),
      });
      const handlers = createAdminRolesHandlers(deps);
      const perms = { chat: { read: true, write: true } };
      const { req, res, status } = createReqRes({
        params: { name: 'editor' },
        body: { permissions: perms },
      });

      await handlers.updateRolePermissions(req, res);

      expect(deps.updateAccessPermissions).toHaveBeenCalledWith('editor', perms, role);
      expect(status).toHaveBeenCalledWith(200);
    });

    it('returns 400 when permissions is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: {},
      });

      await handlers.updateRolePermissions(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'permissions object is required' });
    });

    it('returns 400 when permissions is an array', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { permissions: [1, 2, 3] },
      });

      await handlers.updateRolePermissions(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'permissions object is required' });
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'nonexistent' },
        body: { permissions: { chat: { read: true } } },
      });

      await handlers.updateRolePermissions(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        updateAccessPermissions: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { permissions: { chat: { read: true } } },
      });

      await handlers.updateRolePermissions(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to update role permissions' });
    });
  });

  describe('deleteRole', () => {
    it('deletes role and returns 200', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(mockRole()) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.deleteRole(req, res);

      expect(deps.deleteRoleByName).toHaveBeenCalledWith('editor');
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 403 for system role', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: SystemRoles.ADMIN } });

      await handlers.deleteRole(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete system role' });
      expect(deps.deleteRoleByName).not.toHaveBeenCalled();
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'nonexistent' } });

      await handlers.deleteRole(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        deleteRoleByName: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.deleteRole(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to delete role' });
    });
  });

  describe('getRoleMembers', () => {
    it('returns paginated members with 200', async () => {
      const user = mockUser();
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        listUsersByRole: jest.fn().mockResolvedValue([user]),
        countUsersByRole: jest.fn().mockResolvedValue(1),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRoleMembers(req, res);

      expect(deps.listUsersByRole).toHaveBeenCalledWith('editor', { limit: 50, offset: 0 });
      expect(deps.countUsersByRole).toHaveBeenCalledWith('editor');
      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      expect(response.members).toHaveLength(1);
      expect(response.members[0]).toEqual({
        userId: validUserId,
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: 'https://example.com/avatar.png',
      });
      expect(response.total).toBe(1);
      expect(response.limit).toBe(50);
      expect(response.offset).toBe(0);
    });

    it('passes pagination parameters from query', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        countUsersByRole: jest.fn().mockResolvedValue(0),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res } = createReqRes({
        params: { name: 'editor' },
        query: { limit: '10', offset: '20' },
      });

      await handlers.getRoleMembers(req, res);

      expect(deps.listUsersByRole).toHaveBeenCalledWith('editor', { limit: 10, offset: 20 });
    });

    it('clamps limit to 200', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        countUsersByRole: jest.fn().mockResolvedValue(0),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res } = createReqRes({
        params: { name: 'editor' },
        query: { limit: '999' },
      });

      await handlers.getRoleMembers(req, res);

      expect(deps.listUsersByRole).toHaveBeenCalledWith('editor', { limit: 200, offset: 0 });
    });

    it('does not include joinedAt in response', async () => {
      const user = mockUser();
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        listUsersByRole: jest.fn().mockResolvedValue([user]),
        countUsersByRole: jest.fn().mockResolvedValue(1),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRoleMembers(req, res);

      const member = json.mock.calls[0][0].members[0];
      expect(member).not.toHaveProperty('joinedAt');
    });

    it('returns empty array when no members', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        countUsersByRole: jest.fn().mockResolvedValue(0),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRoleMembers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ members: [], total: 0, limit: 50, offset: 0 });
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'nonexistent' } });

      await handlers.getRoleMembers(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        listUsersByRole: jest.fn().mockRejectedValue(new Error('db down')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { name: 'editor' } });

      await handlers.getRoleMembers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to get role members' });
    });
  });

  describe('addRoleMember', () => {
    it('adds member and returns 200', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(mockUser()),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { userId: validUserId },
      });

      await handlers.addRoleMember(req, res);

      expect(deps.updateUser).toHaveBeenCalledWith(validUserId, { role: 'editor' });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 when userId is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: {},
      });

      await handlers.addRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'userId is required' });
    });

    it('returns 400 for invalid ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { userId: 'not-valid' },
      });

      await handlers.addRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user ID format' });
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'nonexistent' },
        body: { userId: validUserId },
      });

      await handlers.addRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
    });

    it('returns 404 when user not found', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(null),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { userId: validUserId },
      });

      await handlers.addRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(mockUser()),
        updateUser: jest.fn().mockRejectedValue(new Error('timeout')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor' },
        body: { userId: validUserId },
      });

      await handlers.addRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to add role member' });
    });
  });

  describe('removeRoleMember', () => {
    it('removes member and returns 200', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(mockUser({ role: 'editor' })),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor', userId: validUserId },
      });

      await handlers.removeRoleMember(req, res);

      expect(deps.updateUser).toHaveBeenCalledWith(validUserId, { role: SystemRoles.USER });
      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 for invalid ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor', userId: 'bad' },
      });

      await handlers.removeRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user ID format' });
      expect(deps.findUser).not.toHaveBeenCalled();
    });

    it('returns 404 when role not found', async () => {
      const deps = createDeps({ getRoleByName: jest.fn().mockResolvedValue(null) });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'nonexistent', userId: validUserId },
      });

      await handlers.removeRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Role not found' });
      expect(deps.findUser).not.toHaveBeenCalled();
    });

    it('returns 404 when user not found', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(null),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor', userId: validUserId },
      });

      await handlers.removeRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 400 when user is not a member of the role', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(mockUser({ role: 'other-role' })),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor', userId: validUserId },
      });

      await handlers.removeRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'User is not a member of this role' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('returns 500 on unexpected error', async () => {
      const deps = createDeps({
        getRoleByName: jest.fn().mockResolvedValue(mockRole()),
        findUser: jest.fn().mockResolvedValue(mockUser({ role: 'editor' })),
        updateUser: jest.fn().mockRejectedValue(new Error('timeout')),
      });
      const handlers = createAdminRolesHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { name: 'editor', userId: validUserId },
      });

      await handlers.removeRoleMember(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to remove role member' });
    });
  });
});
