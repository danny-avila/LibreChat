import {
  isForbiddenAdminConfigPath,
  sanitizeAdminConfigOverrides,
  sanitizeAdminConfigTombstones,
} from './configOverrides';

describe('sanitizeAdminConfigOverrides', () => {
  it('keeps UI interface fields and strips permission flags', () => {
    expect(
      sanitizeAdminConfigOverrides({
        cache: true,
        interface: { prompts: false, modelSelect: true },
      }),
    ).toEqual({
      cache: true,
      interface: { modelSelect: true },
    });
  });

  it('strips non-object interface and internal alias keys', () => {
    expect(
      sanitizeAdminConfigOverrides({
        cache: true,
        interface: null,
        interfaceConfig: { prompts: false },
      }),
    ).toEqual({
      cache: true,
    });
  });

  it('strips unknown descendants of permission fields including boolean fields', () => {
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          runCode: { foo: true },
          mcpServers: { placeholder: 'Choose MCP', use: true, foo: 'nope' },
          modelSelect: true,
        },
      }),
    ).toEqual({
      interface: {
        mcpServers: { placeholder: 'Choose MCP' },
        modelSelect: true,
      },
    });
  });

  it('rejects UI keys that belong to a different permission field', () => {
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          runCode: { placeholder: 'nope' },
          prompts: { snapshotFiles: true },
          mcpServers: { verification: true, placeholder: 'Choose MCP' },
          skills: { defaultActiveOnShare: true, snapshotFiles: false },
          sharedLinks: { snapshotFiles: false, placeholder: 'nope' },
          modelSelect: true,
        },
      }),
    ).toEqual({
      interface: {
        mcpServers: { placeholder: 'Choose MCP' },
        skills: { defaultActiveOnShare: true },
        sharedLinks: { snapshotFiles: false },
        modelSelect: true,
      },
    });
  });

  it('strips nested containers at primitive leaves (placeholder, verification)', () => {
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          mcpServers: { placeholder: { foo: 'bad' } as never },
          marketplace: { verification: ['bad'] as never },
          skills: { defaultActiveOnShare: { nested: true } as never },
          sharedLinks: { snapshotFiles: false },
        },
      }),
    ).toEqual({
      interface: {
        sharedLinks: { snapshotFiles: false },
      },
    });
  });

  it('allows localized label records but strips nested objects within them', () => {
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          mcpServers: {
            trustCheckbox: {
              label: { en: 'Trust', fr: 'Confiance' },
              subLabel: { en: { nested: 'bad' } as never },
            },
          },
        },
      }),
    ).toEqual({
      interface: {
        mcpServers: {
          trustCheckbox: {
            label: { en: 'Trust', fr: 'Confiance' },
          },
        },
      },
    });
  });

  it('preserves runtime interface settings while stripping their permission bits', () => {
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          schedules: { use: true, create: true, maxPerUser: 2 },
        },
      }),
    ).toEqual({ interface: { schedules: { maxPerUser: 2 } } });
    expect(
      sanitizeAdminConfigOverrides({
        interface: {
          schedules: { use: false, maxPerUser: 2 },
        },
      }),
    ).toEqual({ interface: { schedules: { use: false, maxPerUser: 2 } } });
  });
});

describe('sanitizeAdminConfigTombstones', () => {
  it('strips forbidden interface permission tombstones', () => {
    expect(
      sanitizeAdminConfigTombstones(['interface.prompts', 'interface.modelSelect', 'cache']),
    ).toEqual(['interface.modelSelect', 'cache']);
  });

  it('strips protected ancestors and internal alias tombstones', () => {
    expect(
      sanitizeAdminConfigTombstones([
        'interface',
        'interface.mcpServers',
        'interfaceConfig.prompts',
        'interface.modelSelect',
      ]),
    ).toEqual(['interface.modelSelect']);
  });

  it('strips unknown descendants of permission fields', () => {
    expect(
      sanitizeAdminConfigTombstones([
        'interface.runCode.foo',
        'interface.mcpServers.placeholder',
        'cache',
      ]),
    ).toEqual(['interface.mcpServers.placeholder', 'cache']);
  });

  it('strips UI keys that belong to a different permission field', () => {
    expect(
      sanitizeAdminConfigTombstones([
        'interface.runCode.placeholder',
        'interface.prompts.snapshotFiles',
        'interface.mcpServers.trustCheckbox.label',
        'interface.marketplace.verification',
        'cache',
      ]),
    ).toEqual([
      'interface.mcpServers.trustCheckbox.label',
      'interface.marketplace.verification',
      'cache',
    ]);
  });

  it('allows runtime interface paths but strips their permission sub-paths', () => {
    expect(
      sanitizeAdminConfigTombstones([
        'interface.schedules',
        'interface.schedules.maxPerUser',
        'interface.schedules.use',
      ]),
    ).toEqual(['interface.schedules', 'interface.schedules.maxPerUser']);
  });
});

describe('isForbiddenAdminConfigPath – localized label traversal', () => {
  it('allows the label leaf itself', () => {
    expect(isForbiddenAdminConfigPath('interface.mcpServers.trustCheckbox.label')).toBe(false);
  });

  it('allows one language-key segment beneath a localized leaf', () => {
    expect(isForbiddenAdminConfigPath('interface.mcpServers.trustCheckbox.label.en')).toBe(false);
  });

  it('allows subLabel with a language-key', () => {
    expect(isForbiddenAdminConfigPath('interface.mcpServers.trustCheckbox.subLabel.fr')).toBe(
      false,
    );
  });

  it('blocks two segments beneath a localized leaf (depth exceeded)', () => {
    expect(isForbiddenAdminConfigPath('interface.mcpServers.trustCheckbox.label.en.foo')).toBe(
      true,
    );
  });

  it('blocks a child of a primitive leaf (placeholder is not a localized leaf)', () => {
    expect(isForbiddenAdminConfigPath('interface.mcpServers.placeholder.foo')).toBe(true);
  });

  it('blocks a child of a primitive leaf in another permission field', () => {
    expect(isForbiddenAdminConfigPath('interface.marketplace.verification.foo')).toBe(true);
  });
});
