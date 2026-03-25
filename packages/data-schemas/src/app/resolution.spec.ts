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
  interface: { endpointsMenu: true, sidePanel: true },
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

  it('deep merges a single override into base', () => {
    const configs = [fakeConfig({ interface: { endpointsMenu: false } }, 10)];
    const result = mergeConfigOverrides(baseConfig, configs) as unknown as Record<string, unknown>;
    const iface = result.interface as Record<string, unknown>;
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
    const iface = result.interface as Record<string, unknown>;
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
    const iface = result.interface as Record<string, unknown>;
    expect(iface.endpointsMenu).toBe(true);
    expect(iface.sidePanel).toBe(true);
  });
});
