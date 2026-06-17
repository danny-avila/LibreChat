import { PrincipalType } from 'librechat-data-provider';
import { createAdminPlatformAdminsHandlers } from './platformAdmins';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  runAsSystem: (fn: () => Promise<unknown>) => fn(),
}));

describe('createAdminPlatformAdminsHandlers', () => {
  const findUser = jest.fn();
  const findUsers = jest.fn();
  const updateUser = jest.fn();
  const deleteUserById = jest.fn();
  const deleteGrantsForPrincipal = jest.fn();
  const seedSuperAdminGrants = jest.fn();
  const getPlatformAdminUserIds = jest.fn();
  const createInviteToken = jest.fn();
  const findInviteToken = jest.fn();
  const sendInviteEmail = jest.fn();
  const findPendingUserInvites = jest.fn();

  const handlers = createAdminPlatformAdminsHandlers({
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
    getClientDomain: () => 'http://localhost:3080',
    getAppTitle: () => 'Test App',
    isEmailConfigured: () => true,
    findPendingUserInvites,
  });

  const mongoId = '507f1f77bcf86cd799439011';
  const otherId = '507f1f77bcf86cd799439012';

  beforeEach(() => {
    jest.clearAllMocks();
    getPlatformAdminUserIds.mockResolvedValue(new Set([mongoId]));
    findUsers.mockResolvedValue([]);
    findPendingUserInvites.mockResolvedValue([]);
  });

  it('lists active platform admins', async () => {
    findUsers.mockResolvedValue([
      {
        _id: mongoId,
        name: 'Super Admin',
        email: 'admin@test.com',
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const req = { query: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.listPlatformAdmins(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      admins: [
        expect.objectContaining({
          id: mongoId,
          email: 'admin@test.com',
          status: 'active',
        }),
      ],
      total: 1,
    });
  });

  it('promotes an existing platform user without tenantId', async () => {
    getPlatformAdminUserIds.mockResolvedValue(new Set());
    findUser.mockResolvedValue({
      _id: otherId,
      email: 'new@test.com',
      tenantId: undefined,
    });
    seedSuperAdminGrants.mockResolvedValue(undefined);

    const req = { body: { email: 'new@test.com' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.invitePlatformAdmin(req as never, res as never);

    expect(seedSuperAdminGrants).toHaveBeenCalledWith(otherId);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, promoted: true });
  });

  it('rejects promoting a tenant-scoped user', async () => {
    findUser.mockResolvedValue({
      _id: otherId,
      email: 'tenant@test.com',
      tenantId: 'acme',
    });

    const req = { body: { email: 'tenant@test.com' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.invitePlatformAdmin(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(seedSuperAdminGrants).not.toHaveBeenCalled();
  });

  it('blocks revoking the last platform admin', async () => {
    getPlatformAdminUserIds.mockResolvedValue(new Set([mongoId]));

    const req = {
      params: { id: mongoId },
      user: { id: mongoId },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.revokePlatformAdmin(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(deleteGrantsForPrincipal).not.toHaveBeenCalled();
  });

  it('blocks revoking your own platform admin access', async () => {
    getPlatformAdminUserIds.mockResolvedValue(new Set([mongoId, otherId]));

    const req = {
      params: { id: mongoId },
      user: { id: mongoId },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.revokePlatformAdmin(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(deleteGrantsForPrincipal).not.toHaveBeenCalled();
  });

  it('revokes platform admin when another admin exists', async () => {
    getPlatformAdminUserIds.mockResolvedValue(new Set([mongoId, otherId]));
    deleteGrantsForPrincipal.mockResolvedValue(undefined);

    const req = {
      params: { id: mongoId },
      user: { id: otherId },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.revokePlatformAdmin(req as never, res as never);

    expect(deleteGrantsForPrincipal).toHaveBeenCalledWith(PrincipalType.USER, mongoId);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('blocks deleting your own platform admin account', async () => {
    getPlatformAdminUserIds.mockResolvedValue(new Set([mongoId, otherId]));

    const req = {
      params: { id: mongoId },
      user: { id: mongoId },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.deletePlatformAdmin(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(deleteUserById).not.toHaveBeenCalled();
    expect(deleteGrantsForPrincipal).not.toHaveBeenCalled();
  });

  it('updates platform admin name', async () => {
    updateUser.mockResolvedValue({
      _id: mongoId,
      name: 'Updated Name',
      email: 'admin@test.com',
    });

    const req = {
      params: { id: mongoId },
      body: { name: 'Updated Name' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.updatePlatformAdmin(req as never, res as never);

    expect(updateUser).toHaveBeenCalledWith(mongoId, { name: 'Updated Name' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
