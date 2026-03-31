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
  interfaceConfig: { endpointsMenu: true, sidePanel: true },
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
    const configs = [fakeConfig({ interface: { endpointsMenu: false } }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.endpointsMenu).toBe(false);
    expect(iface.sidePanel).toBe(true);
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

  it('replaces arrays instead of concatenating', () => {
    const configs = [fakeConfig({ endpoints: ['anthropic', 'google'] }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    expect(result.endpoints).toEqual(['anthropic', 'google']);
  });

  it('does not mutate the base config', () => {
    const original = JSON.parse(JSON.stringify(baseConfig));
    const configs = [fakeConfig({ interface: { endpointsMenu: false } }, 10)];
    mergeConfigOverrides(baseConfig, configs);
    expect(baseConfig).toEqual(original);
  });

  it('handles null override values', () => {
    const configs = [fakeConfig({ interface: { endpointsMenu: null } }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.endpointsMenu).toBeNull();
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
      fakeConfig({ interface: { endpointsMenu: false } }, 0),
      fakeConfig({ interface: { endpointsMenu: true, sidePanel: false } }, 10),
      fakeConfig({ interface: { sidePanel: true } }, 100),
    ];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;
    expect(iface.endpointsMenu).toBe(true);
    expect(iface.sidePanel).toBe(true);
  });

  it('remaps all renamed YAML keys (exhaustiveness check)', () => {
    const base = {
      mcpConfig: null,
      interfaceConfig: { endpointsMenu: true },
      turnstileConfig: {},
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          mcpServers: { srv: { url: 'http://mcp' } },
          interface: { endpointsMenu: false },
          turnstile: { siteKey: 'key-123' },
        },
        10,
      ),
    ];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;

    expect(result.mcpConfig).toEqual({ srv: { url: 'http://mcp' } });
    expect((result.interfaceConfig as Record<string, unknown>).endpointsMenu).toBe(false);
    expect((result.turnstileConfig as Record<string, unknown>).siteKey).toBe('key-123');

    expect(result.mcpServers).toBeUndefined();
    expect(result.interface).toBeUndefined();
    expect(result.turnstile).toBeUndefined();
  });

  it('strips interface permission fields from overrides', () => {
    const base = {
      interfaceConfig: { endpointsMenu: true, sidePanel: true },
    } as unknown as AppConfig;

    const configs = [
      fakeConfig(
        {
          interface: {
            endpointsMenu: false,
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
    expect(iface.endpointsMenu).toBe(false);
    // Boolean permission fields should be stripped
    expect(iface.prompts).toBeUndefined();
    // Object permission fields with only permission sub-keys should be stripped
    expect(iface.agents).toBeUndefined();
    expect(iface.marketplace).toBeUndefined();
    // Untouched base field preserved
    expect(iface.sidePanel).toBe(true);
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
      interfaceConfig: { endpointsMenu: true },
    } as unknown as AppConfig;

    const configs = [fakeConfig({ interface: { prompts: false, agents: false } }, 10)];
    const result = mergeConfigOverrides(base, configs) as unknown as Record<string, unknown>;
    const iface = result.interfaceConfig as Record<string, unknown>;

    // Base should be unchanged
    expect(iface.endpointsMenu).toBe(true);
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
    const uiFields = ['endpointsMenu', 'modelSelect', 'parameters', 'presets', 'sidePanel'];
    for (const field of uiFields) {
      expect(INTERFACE_PERMISSION_FIELDS.has(field)).toBe(false);
    }
  });
});
