import { createInvite } from '~/auth/invite';
import { createAdminTenantsHandlers } from './tenants';

jest.mock('~/auth/invite', () => ({
  createInvite: jest.fn(),
}));

describe('createAdminTenantsHandlers', () => {
  const findUser = jest.fn();
  const findUsers = jest.fn();
  const countUsers = jest.fn();
  const findTenantById = jest.fn();
  const createInviteToken = jest.fn();
  const findInviteToken = jest.fn();
  const sendInviteEmail = jest.fn();
  const findTenantByObjectId = jest.fn();
  const listTenants = jest.fn();
  const countTenants = jest.fn();
  const createTenant = jest.fn();
  const deleteTenantByObjectId = jest.fn();
  const updateTenantByObjectId = jest.fn();
  const seedTenantSystemGrants = jest.fn();
  const countUsersByTenantId = jest.fn();
  const deleteGrantsForTenant = jest.fn();
  const isPlatformAdmin = jest.fn();
  const findPendingUserInvites = jest.fn();

  const handlers = createAdminTenantsHandlers({
    findUser,
    findUsers,
    countUsers,
    findTenantById,
    createInviteToken,
    findInviteToken,
    sendInviteEmail,
    getClientDomain: () => 'http://localhost:3080',
    getAppTitle: () => 'Test App',
    isEmailConfigured: () => true,
    findTenantByObjectId,
    listTenants,
    countTenants,
    createTenant,
    deleteTenantByObjectId,
    updateTenantByObjectId,
    seedTenantSystemGrants,
    countUsersByTenantId,
    deleteGrantsForTenant,
    isPlatformAdmin,
    findPendingUserInvites,
  });

  const mongoId = '507f1f77bcf86cd799439011';
  const mockedCreateInvite = createInvite as jest.MockedFunction<typeof createInvite>;

  beforeEach(() => {
    jest.clearAllMocks();
    countUsersByTenantId.mockResolvedValue(0);
    findPendingUserInvites.mockResolvedValue([]);
  });

  it('createTenant provisions tenant and seeds grants', async () => {
    createTenant.mockResolvedValue({
      _id: mongoId,
      tenantId: 'acme',
      name: 'Acme',
      status: 'active',
    });
    seedTenantSystemGrants.mockResolvedValue(undefined);

    const req = {
      body: { name: 'Acme' },
      user: { _id: 'admin-id', role: 'ADMIN' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.createTenant(req as never, res as never);

    expect(createTenant).toHaveBeenCalledWith({
      name: 'Acme',
      createdBy: 'admin-id',
    });
    expect(seedTenantSystemGrants).toHaveBeenCalledWith('acme');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createTenant rolls back when seeding fails', async () => {
    createTenant.mockResolvedValue({
      _id: mongoId,
      tenantId: 'acme',
      name: 'Acme',
      status: 'active',
    });
    seedTenantSystemGrants.mockRejectedValue(new Error('seed failed'));
    deleteTenantByObjectId.mockResolvedValue(true);

    const req = {
      body: { name: 'Acme' },
      user: { _id: 'admin-id', role: 'ADMIN' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.createTenant(req as never, res as never);

    expect(deleteTenantByObjectId).toHaveBeenCalledWith(mongoId);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('getTenant allows tenant admin for own tenant only', async () => {
    isPlatformAdmin.mockResolvedValue(false);
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
    });

    const req = {
      params: { id: mongoId },
      user: { _id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.getTenant(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTenant rejects tenant admin for other tenant', async () => {
    isPlatformAdmin.mockResolvedValue(false);
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'tenant-b',
      name: 'Tenant B',
      status: 'active',
    });

    const req = {
      params: { id: mongoId },
      user: { _id: 'user-1', role: 'ADMIN', tenantId: 'tenant-a' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handlers.getTenant(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('listTenantAdmins returns tenant-scoped admins', async () => {
    findUsers.mockResolvedValue([
      {
        _id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        tenantId: 'tenant-a',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    countUsers.mockResolvedValue(1);
    findTenantById.mockResolvedValue({
      _id: mongoId,
      tenantId: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
    });

    const req = { query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlers.listTenantAdmins(req as never, res as never);

    expect(findUsers).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ADMIN', tenantId: { $exists: true, $nin: [null, ''] } }),
      expect.any(String),
      expect.any(Object),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 1,
        admins: [
          expect.objectContaining({
            name: 'Alice',
            email: 'alice@example.com',
            tenantName: 'Tenant A',
          }),
        ],
      }),
    );
  });

  it('inviteTenantAdmin sends invite for tenant admin role', async () => {
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
    });
    findUser.mockResolvedValue(null);
    mockedCreateInvite.mockResolvedValue('invite-token');
    sendInviteEmail.mockResolvedValue(undefined);

    const req = {
      params: { id: mongoId },
      body: { email: 'admin@example.com' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlers.inviteTenantAdmin(req as never, res as never);

    expect(mockedCreateInvite).toHaveBeenCalledWith(
      'admin@example.com',
      { createToken: createInviteToken, findToken: findInviteToken },
      { role: 'ADMIN', tenantId: 'tenant-a' },
    );
    expect(sendInviteEmail).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('inviteTenantAdmin rejects existing users in the target tenant', async () => {
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'tenant-a',
      name: 'Tenant A',
      status: 'active',
    });
    findUser.mockResolvedValue({ _id: 'existing' });

    const req = {
      params: { id: mongoId },
      body: { email: 'admin@example.com' },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlers.inviteTenantAdmin(req as never, res as never);

    expect(findUser).toHaveBeenCalledWith({ email: 'admin@example.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockedCreateInvite).not.toHaveBeenCalled();
  });

  it('deleteTenant removes tenant when it has no users', async () => {
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'acme',
      name: 'Acme',
      status: 'active',
    });
    countUsersByTenantId.mockResolvedValue(0);
    deleteGrantsForTenant.mockResolvedValue(undefined);
    deleteTenantByObjectId.mockResolvedValue(true);

    const req = { params: { id: mongoId } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlers.deleteTenant(req as never, res as never);

    expect(deleteGrantsForTenant).toHaveBeenCalledWith('acme');
    expect(deleteTenantByObjectId).toHaveBeenCalledWith(mongoId);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteTenant rejects tenants with users', async () => {
    findTenantByObjectId.mockResolvedValue({
      _id: mongoId,
      tenantId: 'acme',
      name: 'Acme',
      status: 'active',
    });
    countUsersByTenantId.mockResolvedValue(3);

    const req = { params: { id: mongoId } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlers.deleteTenant(req as never, res as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteGrantsForTenant).not.toHaveBeenCalled();
    expect(deleteTenantByObjectId).not.toHaveBeenCalled();
  });
});
