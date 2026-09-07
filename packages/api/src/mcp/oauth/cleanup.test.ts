import type { ParsedServerConfig } from '~/mcp/types';
import { getMCPServerGeneration } from './cleanup';

describe('getMCPServerGeneration', () => {
  it('includes the durable database identity for user servers', () => {
    const config = { type: 'streamable-http', url: 'https://example.com', dbId: 'server-1' };

    expect(getMCPServerGeneration(config as ParsedServerConfig)).toMatch(/^db:server-1:/);
  });

  it('ignores inspection-only fields for config servers', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      source: 'config',
      initDuration: 12,
      updatedAt: 100,
    } as ParsedServerConfig;
    const reinspected = { ...config, initDuration: 987, updatedAt: 200 };

    expect(getMCPServerGeneration(reinspected)).toBe(getMCPServerGeneration(config));
  });

  it('changes when the stable server definition changes', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      source: 'config',
    } as ParsedServerConfig;

    expect(getMCPServerGeneration({ ...config, url: 'https://other.example.com/mcp' })).not.toBe(
      getMCPServerGeneration(config),
    );
  });

  it('versions DB-backed servers when their definition changes', () => {
    const config = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      dbId: 'server-1',
    } as ParsedServerConfig;

    expect(getMCPServerGeneration({ ...config, url: 'https://other.example.com/mcp' })).not.toBe(
      getMCPServerGeneration(config),
    );
  });
});
