import type { IRole } from '@librechat/data-schemas';
import { createRoleAdminService } from './service';

const role = { name: 'BETA', permissions: {} } as IRole;

function createDeps() {
  return {
    getRoleByName: jest.fn(async () => role as IRole | null),
    createRoleByName: jest.fn(async () => role),
    updateRoleByName: jest.fn(async () => role as IRole | null),
    updateAccessPermissions: jest.fn(async () => undefined),
    findUserIdsByRole: jest.fn(async (): Promise<string[]> => []),
    updateUsersByRole: jest.fn(async () => undefined),
    updateUsersRoleByIds: jest.fn(async () => undefined),
    findConfigByPrincipal: jest.fn(async () => null),
    upsertConfig: jest.fn(async () => null),
    invalidateConfigCaches: jest.fn(async () => undefined),
  };
}

describe('role admin service', () => {
  it('creates a normalized role', async () => {
    const deps = createDeps();
    const service = createRoleAdminService(deps);

    await service.createRole({ name: ' BETA ', permissions: {} });

    expect(deps.createRoleByName).toHaveBeenCalledWith({ name: 'BETA', permissions: {} });
  });

  it('updates role metadata', async () => {
    const deps = createDeps();
    const service = createRoleAdminService(deps);

    await service.updateRole('BETA', { description: 'Beta users' });

    expect(deps.updateRoleByName).toHaveBeenCalledWith('BETA', { description: 'Beta users' });
  });

  it('migrates members when renaming a role', async () => {
    const deps = createDeps();
    deps.getRoleByName.mockResolvedValueOnce(role).mockResolvedValueOnce(null);
    deps.findUserIdsByRole.mockResolvedValueOnce(['user-1']);
    const service = createRoleAdminService(deps);

    await service.updateRole('BETA', { name: 'REVIEWER' });

    expect(deps.updateUsersByRole).toHaveBeenCalledWith('BETA', 'REVIEWER');
    expect(deps.updateRoleByName).toHaveBeenCalledWith('BETA', { name: 'REVIEWER' });
  });

  it('updates permissions through the existing Admin API operation', async () => {
    const deps = createDeps();
    const service = createRoleAdminService(deps);

    await service.updateRolePermissions('BETA', { AGENTS: { USE: true } });

    expect(deps.updateAccessPermissions).toHaveBeenCalledWith(
      'BETA',
      { AGENTS: { USE: true } },
      role,
    );
  });

  it('prepares and stores role config, then invalidates caches', async () => {
    const deps = createDeps();
    const service = createRoleAdminService(deps);

    await service.upsertRoleConfig('BETA', {
      priority: 10,
      overrides: { filters: {}, memory: { disabled: false } },
    });

    expect(deps.upsertConfig).toHaveBeenCalledWith(
      expect.anything(),
      'BETA',
      expect.anything(),
      { memory: { disabled: false } },
      10,
    );
    expect(deps.invalidateConfigCaches).toHaveBeenCalledTimes(1);
  });

  it('rejects names that are invalid in the Admin API', async () => {
    const deps = createDeps();
    const service = createRoleAdminService(deps);

    await expect(service.createRole({ name: 'members', permissions: {} })).rejects.toThrow(
      'reserved path segment',
    );
    expect(deps.createRoleByName).not.toHaveBeenCalled();
  });
});
