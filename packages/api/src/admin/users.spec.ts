import { Types } from 'mongoose';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type { IUser, UserDeleteResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { createInvite } from '~/auth/invite';
import type { AdminUsersDeps } from './users';
import { createAdminUsersHandlers } from './users';

jest.mock('~/auth/invite', () => ({
  createInvite: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const validUserId = new Types.ObjectId().toString();

function mockUser(overrides: Partial<IUser> = {}): IUser {
  return {
    _id: new Types.ObjectId(),
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    avatar: 'https://example.com/avatar.png',
    role: 'USER',
    provider: 'local',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as IUser;
}

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, string | string[]>;
    body?: Record<string, unknown>;
    user?: { _id?: Types.ObjectId; id?: string; role?: string; tenantId?: string };
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    user: overrides.user ?? { _id: new Types.ObjectId(), role: 'admin' },
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createDeps(overrides: Partial<AdminUsersDeps> = {}): AdminUsersDeps {
  return {
    findUser: jest.fn().mockResolvedValue(null),
    createInviteToken: jest.fn(),
    findInviteToken: jest.fn(),
    sendInviteEmail: jest.fn().mockResolvedValue(undefined),
    getClientDomain: () => 'http://localhost:3080',
    getAppTitle: () => 'LibreChat',
    isEmailConfigured: () => true,
    findUsers: jest.fn().mockResolvedValue([]),
    countUsers: jest.fn().mockResolvedValue(0),
    deleteUserById: jest
      .fn()
      .mockResolvedValue({ deletedCount: 1, message: 'User was deleted successfully.' }),
    deleteConfig: jest.fn().mockResolvedValue(null),
    deleteAclEntries: jest.fn().mockResolvedValue(undefined),
    findPendingUserInvites: jest.fn().mockResolvedValue([]),
    findTokenById: jest.fn().mockResolvedValue(null),
    deleteTokenById: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    updateUser: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

const mockedCreateInvite = createInvite as jest.MockedFunction<typeof createInvite>;

describe('createAdminUsersHandlers', () => {
  describe('listUsers', () => {
    it('returns paginated users with total count', async () => {
      const users = [
        mockUser({ _id: new Types.ObjectId(validUserId) }),
        mockUser({ name: 'Other' }),
      ];
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue(users),
        countUsers: jest.fn().mockResolvedValue(2),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      expect(response.users).toHaveLength(2);
      expect(response.total).toBe(2);
      expect(response).toHaveProperty('limit');
      expect(response).toHaveProperty('offset');
      expect(response.users[0]).toHaveProperty('id');
      expect(response.users[0]).toHaveProperty('name');
      expect(response.users[0]).toHaveProperty('email');
      expect(response.users[0]).toHaveProperty('role');
    });

    it('passes pagination params to findUsers and unfiltered count', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const countUsers = jest.fn().mockResolvedValue(0);
      const deps = createDeps({ findUsers, countUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { limit: '10', offset: '20' } });

      await handlers.listUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith({}, expect.any(String), {
        limit: 10,
        offset: 20,
        sort: { createdAt: -1 },
      });
      expect(countUsers).toHaveBeenCalledWith({});
    });

    it('scopes list to caller tenantId for tenant admins', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const countUsers = jest.fn().mockResolvedValue(0);
      const deps = createDeps({ findUsers, countUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.listUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith(
        { tenantId: 'tenant-a' },
        expect.any(String),
        expect.any(Object),
      );
      expect(countUsers).toHaveBeenCalledWith({ tenantId: 'tenant-a' });
    });

    it('returns empty list when no users', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json.mock.calls[0][0].users).toEqual([]);
      expect(json.mock.calls[0][0].total).toBe(0);
    });

    it('returns 500 when findUsers throws', async () => {
      const deps = createDeps({ findUsers: jest.fn().mockRejectedValue(new Error('db down')) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to list users' });
    });

    it('returns 500 when countUsers throws', async () => {
      const deps = createDeps({
        countUsers: jest.fn().mockRejectedValue(new Error('count failed')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes();

      await handlers.listUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to list users' });
    });
  });

  describe('searchUsers', () => {
    it('returns matching users with total and capped flag', async () => {
      const users = [mockUser()];
      const deps = createDeps({ findUsers: jest.fn().mockResolvedValue(users) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(200);
      const response = json.mock.calls[0][0];
      expect(response.users).toHaveLength(1);
      expect(response.total).toBe(1);
      expect(response.capped).toBe(false);
      expect(response.users[0]).toHaveProperty('id');
      expect(response.users[0]).toHaveProperty('name');
      expect(response.users[0]).toHaveProperty('email');
      expect(response.users[0]).toHaveProperty('username');
    });

    it('sets capped to true when results hit the limit', async () => {
      const users = Array.from({ length: 20 }, () => mockUser());
      const deps = createDeps({ findUsers: jest.fn().mockResolvedValue(users) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, json } = createReqRes({ query: { q: 'test', limit: '20' } });

      await handlers.searchUsers(req, res);

      const response = json.mock.calls[0][0];
      expect(response.total).toBe(20);
      expect(response.capped).toBe(true);
    });

    it('scopes search to caller tenantId for tenant admins', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({
        query: { q: 'test' },
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.searchUsers(req, res);

      expect(findUsers.mock.calls[0][0]).toEqual(
        expect.objectContaining({ tenantId: 'tenant-a', $or: expect.any(Array) }),
      );
    });

    it('searches name, email, and username with anchored prefix regex', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      const filter = findUsers.mock.calls[0][0];
      expect(filter.$or).toHaveLength(3);
      expect(filter.$or[0]).toHaveProperty('name');
      expect(filter.$or[1]).toHaveProperty('email');
      expect(filter.$or[2]).toHaveProperty('username');
      expect(filter.$or[0].name.source).toBe('^test');
    });

    it('projects username in the field selection', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      const projection = findUsers.mock.calls[0][1];
      expect(projection).toContain('username');
    });

    it('escapes regex special characters in query', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'test.user+1' } });

      await handlers.searchUsers(req, res);

      const filter = findUsers.mock.calls[0][0];
      expect(filter.$or[0].name).toBeInstanceOf(RegExp);
      expect(filter.$or[0].name.source).toBe('^test\\.user\\+1');
    });

    it('returns 400 when query is missing', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: {} });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is empty string', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: '' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is whitespace-only', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: '   ' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('returns 400 when query is too short', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'a' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query must be at least 2 characters' });
    });

    it('returns 400 when query exceeds max length', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'a'.repeat(201) } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('200') }),
      );
    });

    it('treats array query param as missing', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: ['foo', 'bar'] } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Query parameter "q" is required' });
    });

    it('passes limit to findUsers', async () => {
      const findUsers = jest.fn().mockResolvedValue([mockUser()]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'User', limit: '3' } });

      await handlers.searchUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
        limit: 3,
        sort: { name: 1 },
      });
    });

    it('caps limit at 50', async () => {
      const findUsers = jest.fn().mockResolvedValue([]);
      const deps = createDeps({ findUsers });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res } = createReqRes({ query: { q: 'User', limit: '100' } });

      await handlers.searchUsers(req, res);

      expect(findUsers).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
        limit: 50,
        sort: { name: 1 },
      });
    });

    it('returns 500 on error', async () => {
      const deps = createDeps({ findUsers: jest.fn().mockRejectedValue(new Error('db down')) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ query: { q: 'test' } });

      await handlers.searchUsers(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to search users' });
    });
  });

  describe('inviteUser', () => {
    beforeEach(() => {
      mockedCreateInvite.mockReset();
    });

    it('sends invite with caller tenantId and USER role default', async () => {
      mockedCreateInvite.mockResolvedValue('invite-token');
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
        body: { email: 'user@example.com' },
      });

      await handlers.inviteUser(req, res);

      expect(mockedCreateInvite).toHaveBeenCalledWith(
        'user@example.com',
        { createToken: deps.createInviteToken, findToken: deps.findInviteToken },
        { tenantId: 'tenant-a' },
      );
      expect(deps.sendInviteEmail).toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(200);
    });

    it('returns invite link when email is not configured', async () => {
      mockedCreateInvite.mockResolvedValue('invite-token');
      const deps = createDeps({ isEmailConfigured: () => false });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
        body: { email: 'user@example.com' },
      });

      await handlers.inviteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({
        success: true,
        emailSent: false,
        inviteLink: 'http://localhost:3080/register?token=invite-token',
      });
      expect(deps.sendInviteEmail).not.toHaveBeenCalled();
    });

    it('rejects callers without tenantId', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN' },
        body: { email: 'user@example.com' },
      });

      await handlers.inviteUser(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(mockedCreateInvite).not.toHaveBeenCalled();
    });

    it('rejects existing users in the caller tenant', async () => {
      const findUser = jest.fn().mockResolvedValue(mockUser({ tenantId: 'tenant-a' }));
      const deps = createDeps({ findUser });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
        body: { email: 'existing@example.com' },
      });

      await handlers.inviteUser(req, res);

      expect(findUser).toHaveBeenCalledWith({ email: 'existing@example.com' });
      expect(status).toHaveBeenCalledWith(409);
      expect(mockedCreateInvite).not.toHaveBeenCalled();
    });

    it('rejects legacy users without tenantId', async () => {
      const findUser = jest.fn().mockResolvedValue(mockUser({ tenantId: undefined }));
      const deps = createDeps({ findUser });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
        body: { email: 'legacy@example.com' },
      });

      await handlers.inviteUser(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(mockedCreateInvite).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid email', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
        body: { email: 'not-an-email' },
      });

      await handlers.inviteUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(mockedCreateInvite).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    const withTargetUser = (overrides: Partial<AdminUsersDeps> = {}) =>
      createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: 'USER' })]),
        ...overrides,
      });

    it('deletes user and returns 200', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = withTargetUser({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User was deleted successfully.' });
    });

    it('returns fallback message when result.message is empty', async () => {
      const result: UserDeleteResult = { deletedCount: 1, message: '' };
      const deps = withTargetUser({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User deleted successfully' });
    });

    it('returns 403 when deleting own account', async () => {
      const userId = new Types.ObjectId();
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: userId.toString() },
        user: { _id: userId, role: 'admin' },
      });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete your own account' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
    });

    it('returns 400 when deleting the last admin', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: SystemRoles.ADMIN })]),
        countUsers: jest.fn().mockResolvedValue(1),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete the last admin user' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
      expect(deps.countUsers).toHaveBeenCalledWith({ role: SystemRoles.ADMIN });
    });

    it('allows deleting an admin when other admins exist', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: SystemRoles.ADMIN })]),
        countUsers: jest.fn().mockResolvedValue(3),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.deleteUserById).toHaveBeenCalledWith(targetId);
    });

    it('does not check admin count when target is a regular user', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([mockUser({ role: 'USER' })]),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: targetId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.countUsers).not.toHaveBeenCalled();
    });

    it('cascades cleanup of Config and AclEntries', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = withTargetUser({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(deps.deleteConfig).toHaveBeenCalledWith(PrincipalType.USER, validUserId);
      expect(deps.deleteAclEntries).toHaveBeenCalledWith({
        principalType: PrincipalType.USER,
        principalId: expect.any(Types.ObjectId),
      });
    });

    it('returns success even when cascade cleanup partially fails', async () => {
      const result: UserDeleteResult = {
        deletedCount: 1,
        message: 'User was deleted successfully.',
      };
      const deps = withTargetUser({
        deleteUserById: jest.fn().mockResolvedValue(result),
        deleteConfig: jest.fn().mockRejectedValue(new Error('cleanup failed')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ message: 'User was deleted successfully.' });
    });

    it('returns 403 when a tenant admin tries to delete another admin', async () => {
      const targetId = new Types.ObjectId().toString();
      const deps = createDeps({
        findUsers: jest
          .fn()
          .mockResolvedValue([mockUser({ role: SystemRoles.ADMIN, tenantId: 'tenant-a' })]),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: targetId },
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot delete tenant admin users' });
      expect(deps.deleteUserById).not.toHaveBeenCalled();
    });

    it('does not cascade when target user is outside caller tenant', async () => {
      const deps = createDeps({
        findUsers: jest.fn().mockResolvedValue([]),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status } = createReqRes({
        params: { id: validUserId },
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(deps.deleteConfig).not.toHaveBeenCalled();
      expect(deps.deleteAclEntries).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: 'not-valid' } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user ID format' });
    });

    it('returns 404 when user not found', async () => {
      const result: UserDeleteResult = { deletedCount: 0, message: '' };
      const deps = withTargetUser({ deleteUserById: jest.fn().mockResolvedValue(result) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('returns 500 on error', async () => {
      const deps = withTargetUser({
        deleteUserById: jest.fn().mockRejectedValue(new Error('db crash')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.deleteUser(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to delete user' });
    });
  });

  describe('promoteTenantAdmin', () => {
    const withTargetUser = (
      overrides: Partial<AdminUsersDeps> = {},
      userOverrides: Partial<IUser> = {},
    ) =>
      createDeps({
        findUsers: jest
          .fn()
          .mockResolvedValue([
            mockUser({ role: SystemRoles.USER, tenantId: 'tenant-a', ...userOverrides }),
          ]),
        updateUser: jest.fn().mockResolvedValue(mockUser({ role: SystemRoles.ADMIN })),
        ...overrides,
      });

    it('promotes an active tenant user to admin', async () => {
      const updateUser = jest.fn().mockResolvedValue(mockUser({ role: SystemRoles.ADMIN }));
      const deps = withTargetUser({ updateUser });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith({ success: true, promoted: true });
      expect(updateUser).toHaveBeenCalledWith(validUserId, { role: SystemRoles.ADMIN });
    });

    it('returns 403 when promoting own account', async () => {
      const callerId = new Types.ObjectId(validUserId);
      const deps = withTargetUser();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: validUserId },
        user: { _id: callerId, role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({ error: 'Cannot promote your own account' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('returns 404 when user is outside caller tenant', async () => {
      const deps = createDeps({ findUsers: jest.fn().mockResolvedValue([]) });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({
        params: { id: validUserId },
        user: { _id: new Types.ObjectId(), role: 'ADMIN', tenantId: 'tenant-a' },
      });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'User not found' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('returns 409 when user is already a tenant admin', async () => {
      const deps = withTargetUser({}, { role: SystemRoles.ADMIN, tenantId: 'tenant-a' });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'User is already a tenant admin' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('returns 409 when user has no tenant', async () => {
      const deps = withTargetUser({}, { tenantId: undefined });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(409);
      expect(json).toHaveBeenCalledWith({ error: 'User is not a tenant member' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid ObjectId', async () => {
      const deps = createDeps();
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: 'not-valid' } });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Invalid user ID format' });
    });

    it('returns 500 on error', async () => {
      const deps = withTargetUser({
        updateUser: jest.fn().mockRejectedValue(new Error('db crash')),
      });
      const handlers = createAdminUsersHandlers(deps);
      const { req, res, status, json } = createReqRes({ params: { id: validUserId } });

      await handlers.promoteTenantAdmin(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to promote user to tenant admin' });
    });
  });
});
