const {
  getDeploymentScope,
  loadRoleDefinitions,
  mergePermissions,
  validateRoleDefinitions,
} = require('../deploy-role');

describe('deploy role script', () => {
  it('requires an explicit base or tenant scope', () => {
    expect(getDeploymentScope(['--base'])).toEqual({ base: true });
    expect(getDeploymentScope(['--tenant', 'tenant-123'])).toEqual({ tenantId: 'tenant-123' });
    expect(() => getDeploymentScope([])).toThrow('exactly one deployment scope');
    expect(() => getDeploymentScope(['--tenant'])).toThrow('requires a tenant ID');
    expect(() => getDeploymentScope(['--tenant', '__SYSTEM__'])).toThrow('reserved tenant ID');
    expect(() => getDeploymentScope(['--tenant=__SYSTEM__'])).toThrow('reserved tenant ID');
    expect(() => getDeploymentScope(['--base', '--tenant', 'tenant-123'])).toThrow(
      'exactly one deployment scope',
    );
  });

  it('does not interpret the tenant ID as a definitions file', () => {
    process.env.ROLE_DEFINITIONS_JSON = JSON.stringify([
      {
        name: 'BETA',
        inheritPermissionsFrom: 'USER',
        permissionOverrides: {},
        config: { priority: 10, overrides: {} },
      },
    ]);

    expect(loadRoleDefinitions(['--tenant', 'tenant-123'])[0].name).toBe('BETA');
    delete process.env.ROLE_DEFINITIONS_JSON;
  });

  it('merges permission overrides without mutating the baseline', () => {
    const baseline = { AGENTS: { USE: true, CREATE: false } };

    expect(mergePermissions(baseline, { AGENTS: { CREATE: true } })).toEqual({
      AGENTS: { USE: true, CREATE: true },
    });
    expect(baseline.AGENTS.CREATE).toBe(false);
  });

  it('loads definitions from an inline parameter', () => {
    const definitions = loadRoleDefinitions([
      '--roles',
      JSON.stringify([
        {
          name: 'BETA',
          inheritPermissionsFrom: 'USER',
          permissionOverrides: {},
          config: { priority: 10, overrides: {} },
        },
      ]),
    ]);

    expect(definitions[0].name).toBe('BETA');
  });

  it('does not add config defaults to partial overrides', () => {
    const [definition] = validateRoleDefinitions([
      {
        name: 'BETA',
        inheritPermissionsFrom: 'USER',
        permissionOverrides: {},
        config: {
          priority: 10,
          overrides: { endpoints: { agents: { capabilities: ['memory'] } } },
        },
      },
    ]);

    expect(definition.config.overrides).toEqual({
      endpoints: { agents: { capabilities: ['memory'] } },
    });
  });

  it('rejects unknown permission and config fields', () => {
    const definition = {
      name: 'BETA',
      inheritPermissionsFrom: 'USER',
      permissionOverrides: {},
      config: { priority: 10, overrides: {} },
    };

    expect(() =>
      validateRoleDefinitions([{ ...definition, permissionOverrides: { AGNETS: {} } }]),
    ).toThrow('AGNETS');
    expect(() =>
      validateRoleDefinitions([
        { ...definition, config: { priority: 10, overrides: { memroy: {} } } },
      ]),
    ).toThrow('memroy');
    expect(() =>
      validateRoleDefinitions([
        { ...definition, config: { priority: 10, overrides: { toString: true } } },
      ]),
    ).toThrow('toString');
  });

  it('rejects system roles as deployment targets', () => {
    expect(() =>
      validateRoleDefinitions([
        {
          name: 'USER',
          inheritPermissionsFrom: 'USER',
          permissionOverrides: {},
          config: { priority: 10, overrides: {} },
        },
      ]),
    ).toThrow('System roles');
  });

  it('does not add config defaults inside arrays', () => {
    const [definition] = validateRoleDefinitions([
      {
        name: 'BETA',
        inheritPermissionsFrom: 'USER',
        permissionOverrides: {},
        config: {
          priority: 10,
          overrides: {
            modelSpecs: {
              list: [{ name: 'beta', label: 'Beta', preset: { endpoint: 'agents' } }],
            },
          },
        },
      },
    ]);

    expect(definition.config.overrides.modelSpecs.list[0]).toEqual({
      name: 'beta',
      label: 'Beta',
      preset: { endpoint: 'agents' },
    });
  });
});
