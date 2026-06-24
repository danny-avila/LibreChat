jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/models', () => ({
  findTenantById: jest.fn(),
}));

const { logger } = require('@librechat/data-schemas');
const db = require('~/models');
const { enrichUserWithTenant } = require('./enrichUserTenant');

describe('enrichUserWithTenant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns input unchanged when tenantId is missing', async () => {
    const userData = { id: 'user-1', email: 'a@test.com' };
    const result = await enrichUserWithTenant(userData);
    expect(result).toEqual(userData);
    expect(db.findTenantById).not.toHaveBeenCalled();
  });

  it('adds tenantName when tenant is found', async () => {
    db.findTenantById.mockResolvedValue({ tenantId: 'tenant-a', name: 'Acme Corp' });
    const userData = { id: 'user-1', tenantId: 'tenant-a' };

    const result = await enrichUserWithTenant(userData);

    expect(db.findTenantById).toHaveBeenCalledWith('tenant-a');
    expect(result.tenantName).toBe('Acme Corp');
  });

  it('leaves tenantName unset when tenant lookup returns no name', async () => {
    db.findTenantById.mockResolvedValue(null);
    const userData = { id: 'user-1', tenantId: 'tenant-a' };

    const result = await enrichUserWithTenant(userData);

    expect(result.tenantName).toBeUndefined();
  });

  it('logs and continues when tenant lookup fails', async () => {
    const error = new Error('db down');
    db.findTenantById.mockRejectedValue(error);
    const userData = { id: 'user-1', tenantId: 'tenant-a' };

    const result = await enrichUserWithTenant(userData);

    expect(result).toEqual(userData);
    expect(logger.error).toHaveBeenCalled();
  });
});
