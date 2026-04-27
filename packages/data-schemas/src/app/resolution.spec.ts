import { INTERFACE_PERMISSION_FIELDS, PermissionTypes } from 'librechat-data-provider';
import { mergeConfigOverrides } from './resolution';
import type { AppConfig, IConfig } from '~/types';

function fakeConfig(overrides: Record<string, unknown>, priority: number): IConfig {
  return {
    _id: 'fake',
    principalType: 'role',
    principalId: 'test',
    principalModel: 'Role',
    priority,
    overrides,
    isActive: true,
    configVersion: 1,
  } as unknown as IConfig;
}

const baseConfig = {
  interfaceConfig: { modelSelect: true, parameters: true },
  registration: { enabled: true },
  endpoints: ['openAI'],
} as unknown as AppConfig;

describe('mergeConfigOverrides', () => {
  it('returns base config when configs array is empty', () => {
    expect(mergeConfigOverrides(baseConfig, [])).toBe(baseConfig);
  });

  it('returns base config when configs is null/undefined', () => {
    expect(mergeConfigOverrides(baseConfig, null as unknown as IConfig[])).toBe(baseConfig);
    expect(mergeConfigOverrides(baseConfig, undefined as unknown as IConfig[])).toBe(baseConfig);
  });

  it('deep merges interface UI fields into interfaceConfig', () => {
    const configs = [fakeConfig({ interface: { modelSelect: false } }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.modelSelect).toBe(false);
    expect(iface.parameters).toBe(true);
  });

  it('sorts by priority — higher priority wins', () => {
    const configs = [
      fakeConfig({ registration: { enabled: false } }, 100),
      fakeConfig({ registration: { enabled: true, custom: 'yes' } }, 10),
    ];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const reg = result.registration as Record<string, unknown>;
    expect(reg.enabled).toBe(false);
    expect(reg.custom).toBe('yes');
  });

  it('replaces plain arrays (no merge key) instead of concatenating', () => {
    const configs = [fakeConfig({ endpoints: ['anthropic', 'google'] }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    expect(result.endpoints).toEqual(['anthropic', 'google']);
  });

  it('merges endpoints.custom arrays by name instead of replacing', () => {
    const base = {
      endpoints: {
        custom: [
          { name: 'yaml-only', baseURL: 'https://yaml-only.com', apiKey: 'key1' },
          {
            name: 'shared',
            baseURL: 'https://original.com',
            apiKey: 'key2',
            models: { default: ['m1'] },
          },
        ],
      },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          endpoints: {
            custom: [
              { name: 'shared', baseURL: 'https://overridden.com' },
              { name: 'db-only', baseURL: 'https://db-only.com', apiKey: 'key3' },
            ],
          },
        },
        10,
      ),
    ];

    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const endpoints = result.endpoints as Record<string, unknown>;
    const custom = endpoints.custom as Array<Record<string, unknown>>;

    expect(custom).toHaveLength(3);
    // YAML-only item preserved
    expect(custom[0]).toEqual({
      name: 'yaml-only',
      baseURL: 'https://yaml-only.com',
      apiKey: 'key1',
    });
    // Shared item deep-merged: baseURL overridden, apiKey + models preserved from base
    expect(custom[1]).toEqual({
      name: 'shared',
      baseURL: 'https://overridden.com',
      apiKey: 'key2',
      models: { default: ['m1'] },
    });
    // DB-only item appended
    expect(custom[2]).toEqual({ name: 'db-only', baseURL: 'https://db-only.com', apiKey: 'key3' });
  });

  it('preserves all YAML custom endpoints when DB override is empty', () => {
    const base = {
      endpoints: {
        custom: [
          { name: 'ep1', baseURL: 'https://ep1.com' },
          { name: 'ep2', baseURL: 'https://ep2.com' },
        ],
      },
    } as unknown as AppConfig;

    const configs = [fakeConfig({ endpoints: { custom: [] } }, 10)];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const endpoints = result.endpoints as Record<string, unknown>;
    const custom = endpoints.custom as Array<Record<string, unknown>>;

    expect(custom).toHaveLength(2);
    expect(custom[0].name).toBe('ep1');
    expect(custom[1].name).toBe('ep2');
  });

  it('deduplicates when source contains repeated endpoint names', () => {
    const base = {
      endpoints: { custom: [] },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          endpoints: {
            custom: [
              { name: 'dup', baseURL: 'https://first.com' },
              { name: 'dup', baseURL: 'https://second.com' },
            ],
          },
        },
        10,
      ),
    ];

    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const custom = (result.endpoints as Record<string, unknown>).custom as Array<
      Record<string, unknown>
    >;

    expect(custom).toHaveLength(1);
    expect(custom[0].name).toBe('dup');
    // last-write-wins: Map.set overwrites on duplicate keys
    expect(custom[0].baseURL).toBe('https://second.com');
  });

  it('silently drops source items without a name field', () => {
    const base = {
      endpoints: { custom: [{ name: 'ep1', baseURL: 'https://ep1.com' }] },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig({ endpoints: { custom: [{ baseURL: 'https://nameless.com' }] } }, 10),
    ];

    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const custom = (result.endpoints as Record<string, unknown>).custom as Array<
      Record<string, unknown>
    >;

    expect(custom).toHaveLength(1);
    expect(custom[0].name).toBe('ep1');
  });

  it('preserves base items without a name field', () => {
    const base = {
      endpoints: { custom: [{ baseURL: 'https://ep1.com' }] },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig({ endpoints: { custom: [{ name: 'db-only', baseURL: 'https://db.com' }] } }, 10),
    ];

    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const custom = (result.endpoints as Record<string, unknown>).custom as Array<
      Record<string, unknown>
    >;

    expect(custom).toHaveLength(2);
    expect(custom[0].baseURL).toBe('https://ep1.com');
    expect(custom[1].name).toBe('db-only');
  });

  it('does not mutate base custom endpoint items', () => {
    const base = {
      endpoints: { custom: [{ name: 'ep1', baseURL: 'https://ep1.com' }] },
    } as unknown as AppConfig;

    const configs = [fakeConfig({ endpoints: { custom: [] } }, 10)];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const custom = (result.endpoints as Record<string, unknown>).custom as Array<
      Record<string, unknown>
    >;

    custom[0].baseURL = 'https://mutated.com';
    const original = (base as unknown as Record<string, unknown>).endpoints as Record<
      string,
      unknown
    >;
    expect((original.custom as Array<Record<string, unknown>>)[0].baseURL).toBe('https://ep1.com');
  });

  it('respects priority for custom endpoint merges — higher priority wins', () => {
    const base = {
      endpoints: { custom: [{ name: 'shared', baseURL: 'https://yaml.com' }] },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig({ endpoints: { custom: [{ name: 'shared', baseURL: 'https://low.com' }] } }, 10),
      fakeConfig({ endpoints: { custom: [{ name: 'shared', baseURL: 'https://high.com' }] } }, 100),
    ];

    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const custom = (result.endpoints as Record<string, unknown>).custom as Array<
      Record<string, unknown>
    >;

    expect(custom[0].baseURL).toBe('https://high.com');
  });

  it('does not mutate the base config', () => {
    const original = JSON.parse(JSON.stringify(baseConfig));
    const configs = [fakeConfig({ interface: { modelSelect: false } }, 10)];
    mergeConfigOverrides(baseConfig, configs);
    expect(baseConfig).toEqual(original);
  });

  it('handles null override values', () => {
    const configs = [fakeConfig({ interface: { modelSelect: null } }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.modelSelect).toBeNull();
  });

  it('skips configs with no overrides object', () => {
    const configs = [fakeConfig(undefined as unknown as Record<string, unknown>, 10)];
    const result = mergeConfigOverrides(baseConfig, configs);
    expect(result).toEqual(baseConfig);
  });

  it('strips __proto__, constructor, and prototype keys from overrides', () => {
    const configs = [
      fakeConfig(
        {
          __proto__: { polluted: true },
          constructor: { bad: true },
          prototype: { evil: true },
          safe: 'ok',
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    expect(result.safe).toBe('ok');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'prototype')).toBe(false);
  });

  it('merges three priority levels in order', () => {
    const configs = [
      fakeConfig({ interface: { modelSelect: false } }, 0),
      fakeConfig({ interface: { modelSelect: true, parameters: false } }, 10),
      fakeConfig({ interface: { parameters: true } }, 100),
    ];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.modelSelect).toBe(true);
    expect(iface.parameters).toBe(true);
  });

  it('remaps all renamed YAML keys (exhaustiveness check)', () => {
    const base = {
      mcpConfig: null,
      interfaceConfig: { modelSelect: true },
      turnstileConfig: {},
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          mcpServers: { srv: { url: 'http://mcp' } },
          interface: { modelSelect: false },
          turnstile: { siteKey: 'key-123' },
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;

    expect(result.mcpConfig).toEqual({ srv: { url: 'http://mcp' } });
    expect((result.interfaceConfig as Record<string, unknown>).modelSelect).toBe(false);
    expect((result.turnstileConfig as Record<string, unknown>).siteKey).toBe('key-123');

    expect(result.mcpServers).toBeUndefined();
    expect(result.interface).toBeUndefined();
    expect(result.turnstile).toBeUndefined();
  });

  it('strips interface permission fields from overrides', () => {
    const base = {
      interfaceConfig: { modelSelect: true, parameters: true },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          interface: {
            modelSelect: false,
            prompts: false,
            agents: { use: false },
            marketplace: { use: false },
          },
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;

    // UI field should be merged
    expect(iface.modelSelect).toBe(false);
    // Boolean permission fields should be stripped
    expect(iface.prompts).toBeUndefined();
    // Object permission fields with only permission sub-keys should be stripped
    expect(iface.agents).toBeUndefined();
    expect(iface.marketplace).toBeUndefined();
    // Untouched base field preserved
    expect(iface.parameters).toBe(true);
  });

  it('preserves UI sub-keys in composite permission fields like mcpServers', () => {
    const base = {
      interfaceConfig: {},
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          interface: {
            mcpServers: {
              use: true,
              create: false,
              share: false,
              public: false,
              placeholder: 'Search MCP servers...',
              trustCheckbox: { label: 'I trust this server' },
            },
          },
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    const mcp = iface.mcpServers as Record<string, unknown>;

    // UI sub-keys preserved
    expect(mcp.placeholder).toBe('Search MCP servers...');
    expect(mcp.trustCheckbox).toEqual({ label: 'I trust this server' });
    // Permission sub-keys stripped
    expect(mcp.use).toBeUndefined();
    expect(mcp.create).toBeUndefined();
    expect(mcp.share).toBeUndefined();
    expect(mcp.public).toBeUndefined();
  });

  it('strips peoplePicker permission sub-keys (users, groups, roles)', () => {
    const base = {
      interfaceConfig: {},
    } as unknown as AppConfig;

    const configs = [
      fakeConfig({ interface: { peoplePicker: { users: false, groups: true, roles: true } } }, 10),
    ];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;

    // All sub-keys are permission bits → entire field stripped
    expect(iface.peoplePicker).toBeUndefined();
  });

  it('drops interface entirely when only permission fields are present', () => {
    const base = {
      interfaceConfig: { modelSelect: true },
    } as unknown as AppConfig;

    const configs = [fakeConfig({ interface: { prompts: false, agents: false } }, 10)];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;

    // Base should be unchanged
    expect(iface.modelSelect).toBe(true);
    expect(iface.prompts).toBeUndefined();
    expect(iface.agents).toBeUndefined();
  });

  it('remaps YAML-level keys to AppConfig equivalents', () => {
    const configs = [
      fakeConfig(
        {
          mcpServers: { 'test-server': { type: 'streamable-http', url: 'https://example.com' } },
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const mcpConfig = result.mcpConfig as Record<string, unknown>;
    expect(mcpConfig).toBeDefined();
    expect(mcpConfig['test-server']).toEqual({
      type: 'streamable-http',
      url: 'https://example.com',
    });
    expect(result.mcpServers).toBeUndefined();
  });
});

describe('INTERFACE_PERMISSION_FIELDS', () => {
  it('contains all expected permission fields', () => {
    const expected = [
      'prompts',
      'agents',
      'bookmarks',
      'memories',
      'multiConvo',
      'temporaryChat',
      'runCode',
      'webSearch',
      'fileSearch',
      'fileCitations',
      'peoplePicker',
      'marketplace',
      'mcpServers',
      'remoteAgents',
    ];
    for (const field of expected) {
      expect(INTERFACE_PERMISSION_FIELDS.has(field)).toBe(true);
    }
  });

  it('has one entry per PermissionType — no duplicates or missing', () => {
    expect(INTERFACE_PERMISSION_FIELDS.size).toBe(Object.values(PermissionTypes).length);
  });

  it('does not contain UI-only fields', () => {
    const uiFields = ['modelSelect', 'parameters', 'presets'];
    for (const field of uiFields) {
      expect(INTERFACE_PERMISSION_FIELDS.has(field)).toBe(false);
    }
  });
});
