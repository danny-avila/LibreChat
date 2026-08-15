/** Regression coverage for app-level MCP catalogs that never reach agents (#14857). */
import { CacheKeys, Constants, normalizeServerName } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from '../types';
import { getMCPAppToolsPublicationGeneration } from '../toolsChanged';
import { createMCPCatalogStore } from '../catalog/store';
import { createMCPToolCacheService } from '../tools';

const SERVER_NAME = 'shared';

const appConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  source: 'yaml',
};

const toolKey = (name: string) =>
  `${name}${Constants.mcp_delimiter}${normalizeServerName(SERVER_NAME)}`;

const description = (name: string) => `${name} the corpus`;

const catalogOf = (...names: string[]): LCAvailableTools =>
  Object.fromEntries(
    names.map((name) => [
      toolKey(name),
      {
        type: 'function' as const,
        ['function']: {
          name: toolKey(name),
          description: description(name),
          parameters: { type: 'object' as const, properties: {} },
        },
      },
    ]),
  );

function createService() {
  const cache = new Map<string, unknown>();
  const store = createMCPCatalogStore({
    cacheConfig: { FORCED_IN_MEMORY_CACHE_NAMESPACES: [CacheKeys.TOOL_CACHE] },
    getCache: () => ({
      get: async (key) => cache.get(key),
      set: async (key, value) => {
        cache.set(key, value);
        return true;
      },
      delete: async (key) => cache.delete(key),
    }),
  });

  const service = createMCPToolCacheService({
    getCachedTools: store.getCachedTools,
    updateCachedGlobalTools: store.updateCachedGlobalTools,
    setCachedTools: store.setCachedTools,
    setCachedToolsIfCurrent: store.setCachedToolsIfCurrent,
    getCachedAppServerTools: store.getCachedAppServerTools,
    setCachedAppServerTools: store.setCachedAppServerTools,
    getNextAppToolsPublicationRevision: store.getNextAppToolsPublicationRevision,
    getServerConfig: async () => appConfig,
    getAllServerConfigs: async () => ({ [SERVER_NAME]: appConfig }),
    isAppServerConfig: async () => true,
  });

  return { service, store };
}

describe('app-level tool publication', () => {
  const configGeneration = getMCPAppToolsPublicationGeneration(appConfig);

  it('publishes a first-connect snapshot that reserved no revision', async () => {
    const { service } = createService();

    await expect(
      service.replaceAppServerTools({
        serverName: SERVER_NAME,
        serverTools: catalogOf('search'),
        publicationGeneration: configGeneration,
      }),
    ).resolves.toBe(true);

    await expect(service.getMCPServerTools('user-1', SERVER_NAME, appConfig)).resolves.toEqual(
      catalogOf('search'),
    );
  });

  /** The reinitialize path an agent falls back to when the shared catalog is cold. Returning
   * null here is what surfaced as "configured to use MCP tools, but none are available". */
  it('returns the catalog when a user request republishes a shared server', async () => {
    const { service } = createService();

    await expect(
      service.updateMCPServerTools({
        userId: 'user-1',
        serverName: SERVER_NAME,
        serverConfig: appConfig,
        publicationGeneration: configGeneration,
        tools: [{ name: 'search', description: description('search') }],
      }),
    ).resolves.toEqual(catalogOf('search'));

    await expect(service.getMCPServerTools('user-1', SERVER_NAME, appConfig)).resolves.toEqual(
      catalogOf('search'),
    );
  });

  it('caches a shared catalog discovered on demand', async () => {
    const { service } = createService();

    await service.cacheMCPServerTools({
      userId: 'user-1',
      serverName: SERVER_NAME,
      serverConfig: appConfig,
      serverTools: catalogOf('search'),
      publicationGeneration: configGeneration,
    });

    await expect(service.getMCPServerTools('user-2', SERVER_NAME, appConfig)).resolves.toEqual(
      catalogOf('search'),
    );
  });

  it('keeps a newer catalog when a publication that reserved earlier lands last', async () => {
    const { service, store } = createService();
    const stale = await store.getNextAppToolsPublicationRevision(SERVER_NAME, configGeneration);

    await service.replaceAppServerTools({
      serverName: SERVER_NAME,
      serverTools: catalogOf('current'),
      publicationGeneration: configGeneration,
    });
    await service.replaceAppServerTools({
      serverName: SERVER_NAME,
      serverTools: catalogOf('stale'),
      publicationGeneration: configGeneration,
      publicationRevision: stale,
    });

    await expect(service.getMCPServerTools('user-1', SERVER_NAME, appConfig)).resolves.toEqual(
      catalogOf('current'),
    );
  });
});
