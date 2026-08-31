import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import { loadMCPServerCatalogs, recoverMCPServerCatalogs } from './recovery';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const user = { id: 'user-1' } as IUser;
const serverConfig = (name: string): ParsedServerConfig =>
  ({ type: 'streamable-http', url: `https://${name}.example.com/mcp` }) as ParsedServerConfig;
const withUserVars = (config: ParsedServerConfig): ParsedServerConfig =>
  ({
    ...config,
    customUserVars: { API_KEY: { title: 'API key', description: 'Server API key' } },
  }) as ParsedServerConfig;
const availableTools = (name: string): LCAvailableTools => ({
  [name]: {
    type: 'function',
    function: {
      name,
      description: '',
      parameters: { type: 'object', properties: {} },
    },
  },
});

describe('recoverMCPServerCatalogs', () => {
  it('loads user auth once and preserves config-only lookup context for each server', async () => {
    const servers = [
      { serverName: 'alpha', serverConfig: withUserVars(serverConfig('alpha')) },
      { serverName: 'beta', serverConfig: withUserVars(serverConfig('beta')) },
    ];
    const loadUserMCPAuthMap = jest.fn().mockResolvedValue({
      [`${Constants.mcp_prefix}alpha`]: { API_KEY: 'alpha-secret' },
      [`${Constants.mcp_prefix}beta`]: { API_KEY: 'beta-secret' },
    });
    const discoverServerTools = jest.fn(async ({ serverName }: ToolDiscoveryOptions) => ({
      tools: [{ name: `${serverName}-tool`, inputSchema: { type: 'object' as const } }],
    }));
    const formatServerTools = jest.fn((serverName: string) =>
      availableTools(`tool${Constants.mcp_delimiter}${serverName}`),
    );

    const result = await recoverMCPServerCatalogs(
      { user, servers },
      { loadUserMCPAuthMap, discoverServerTools, formatServerTools },
    );

    expect(loadUserMCPAuthMap).toHaveBeenCalledTimes(1);
    expect(loadUserMCPAuthMap).toHaveBeenCalledWith('user-1', ['alpha', 'beta']);
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        serverName: 'alpha',
        configServers: { alpha: servers[0].serverConfig },
        customUserVars: { API_KEY: 'alpha-secret' },
      }),
    );
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        serverName: 'beta',
        configServers: { beta: servers[1].serverConfig },
        customUserVars: { API_KEY: 'beta-secret' },
      }),
    );
    expect(result.size).toBe(2);
  });

  it('limits passive discovery to three concurrent servers across simultaneous catalog loads', async () => {
    const servers = Array.from({ length: 7 }, (_, index) => ({
      serverName: `server-${index}`,
      serverConfig: serverConfig(`server-${index}`),
    }));
    let active = 0;
    let maxActive = 0;
    const discoverServerTools = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { tools: [] };
    });

    const deps = {
      getCachedServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      cacheServerTools: jest.fn(),
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue({}),
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, () => loadMCPServerCatalogs({ user, servers }, deps)),
    );

    expect(discoverServerTools).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(3);
    expect(results).toHaveLength(4);
    expect(results.flatMap((result) => [...result.serverTools.keys()])).toHaveLength(3);
  });

  it('logs configuration-impossible discovery failures at debug, keeping error for the unexpected', async () => {
    const servers = [
      { serverName: 'policy-blocked', serverConfig: serverConfig('blocked') },
      { serverName: 'crashed', serverConfig: serverConfig('crashed') },
    ];

    const result = await recoverMCPServerCatalogs(
      { user, servers },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn(async ({ serverName }: ToolDiscoveryOptions) => {
          if (serverName === 'policy-blocked') {
            throw new McpError(
              ErrorCode.InvalidRequest,
              'Resolved MCP server URL is not allowed by the configured domain policy.',
            );
          }
          throw new Error('socket hang up');
        }),
        formatServerTools: jest.fn(),
      },
    );

    expect(result.size).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('policy-blocked is not recoverable under current configuration'),
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('crashed'),
      expect.any(Error),
    );
  });

  it('keeps successful catalogs when another server fails or has no authoritative tools', async () => {
    const servers = ['good', 'failed', 'missing'].map((serverName) => ({
      serverName,
      serverConfig: serverConfig(serverName),
    }));

    const result = await recoverMCPServerCatalogs(
      { user, servers },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn(async ({ serverName }: ToolDiscoveryOptions) => {
          if (serverName === 'failed') {
            throw new Error('offline');
          }
          return { tools: serverName === 'missing' ? null : [] };
        }),
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect([...result.keys()]).toEqual(['good']);
  });
});

describe('loadMCPServerCatalogs', () => {
  it('loads cache hits and connected snapshots in parallel, then caches only the snapshot', async () => {
    const cachedTools = availableTools('cached');
    const snapshotTools = availableTools('live');
    const servers = [
      { serverName: 'cached-server', serverConfig: serverConfig('cached') },
      { serverName: 'live-server', serverConfig: serverConfig('live') },
    ];
    const getCachedServerTools = jest.fn(
      async (
        _userId: string,
        serverName: string,
        _serverConfig: ParsedServerConfig,
      ): Promise<LCAvailableTools | null> => (serverName === 'cached-server' ? cachedTools : null),
    );
    const getServerToolFunctionsSnapshot = jest.fn().mockResolvedValue({
      tools: snapshotTools,
      publicationGeneration: 'generation-1',
    });
    const cacheServerTools = jest.fn().mockResolvedValue(undefined);
    const loadUserMCPAuthMap = jest.fn();

    const result = await loadMCPServerCatalogs(
      { user, servers },
      {
        getCachedServerTools,
        getServerToolFunctionsSnapshot,
        cacheServerTools,
        loadUserMCPAuthMap,
        discoverServerTools: jest.fn(),
        formatServerTools: jest.fn(),
      },
    );

    expect(getCachedServerTools).toHaveBeenCalledTimes(2);
    expect(getServerToolFunctionsSnapshot).toHaveBeenCalledTimes(1);
    expect(loadUserMCPAuthMap).not.toHaveBeenCalled();
    expect(cacheServerTools).toHaveBeenCalledWith({
      userId: user.id,
      serverName: 'live-server',
      serverTools: snapshotTools,
      serverConfig: servers[1].serverConfig,
      publicationGeneration: 'generation-1',
      publicationRevision: undefined,
    });
    expect(result.serverTools).toEqual(
      new Map([
        ['cached-server', cachedTools],
        ['live-server', snapshotTools],
      ]),
    );
    expect(result.serversWithoutTools).toEqual([]);
  });

  it('serves passive recovery only to the request and does not cache it without a fence', async () => {
    const servers = [{ serverName: 'cold-server', serverConfig: serverConfig('cold') }];
    const recoveredTools = availableTools('recovered');
    const cacheServerTools = jest.fn();

    const result = await loadMCPServerCatalogs(
      { user, servers },
      {
        getCachedServerTools: jest.fn().mockResolvedValue(null),
        getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
        cacheServerTools,
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'recovered', inputSchema: { type: 'object' as const } }],
        }),
        formatServerTools: jest.fn().mockReturnValue(recoveredTools),
      },
    );

    expect(result.serverTools).toEqual(new Map([['cold-server', recoveredTools]]));
    expect(result.serversWithoutTools).toEqual([]);
    expect(cacheServerTools).not.toHaveBeenCalled();
  });

  it('isolates cache and snapshot failures and reports only unresolved servers', async () => {
    const servers = [
      { serverName: 'recovered', serverConfig: serverConfig('recovered') },
      { serverName: 'missing', serverConfig: serverConfig('missing') },
    ];

    const result = await loadMCPServerCatalogs(
      { user, servers },
      {
        getCachedServerTools: jest.fn().mockRejectedValue(new Error('cache unavailable')),
        getServerToolFunctionsSnapshot: jest
          .fn()
          .mockRejectedValueOnce(new Error('connection unavailable'))
          .mockResolvedValueOnce({ tools: null }),
        cacheServerTools: jest.fn(),
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn(async ({ serverName }: ToolDiscoveryOptions) => ({
          tools: serverName === 'recovered' ? [] : null,
        })),
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect(result.serverTools).toEqual(new Map([['recovered', {}]]));
    expect(result.serversWithoutTools).toEqual(['missing']);
  });
});

describe('recoverMCPServerCatalogs — bounded, skippable discovery', () => {
  const recoveryDeps = (
    discoverServerTools: jest.Mock,
    userMCPAuthMap: Record<string, Record<string, string>> = {},
  ) => ({
    loadUserMCPAuthMap: jest.fn().mockResolvedValue(userMCPAuthMap),
    discoverServerTools,
    formatServerTools: jest.fn().mockReturnValue({}),
  });

  it('bounds each server discovery end to end rather than per attempt', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const before = Date.now();

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'slow', serverConfig: serverConfig('slow') }] },
      recoveryDeps(discoverServerTools),
    );

    const [options] = discoverServerTools.mock.calls[0];
    expect(options.serverName).toBe('slow');
    expect(options.connectionTimeout).toBeUndefined();
    expect(options.deadlineMs).toBeGreaterThanOrEqual(before + 3000);
    expect(options.deadlineMs).toBeLessThanOrEqual(Date.now() + 3000);
  });

  it('keeps a shorter configured initTimeout instead of raising it to the cap', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const impatient = { ...serverConfig('impatient'), initTimeout: 900 } as ParsedServerConfig;
    const before = Date.now();

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'impatient', serverConfig: impatient }] },
      recoveryDeps(discoverServerTools),
    );

    const [options] = discoverServerTools.mock.calls[0];
    expect(options.deadlineMs).toBeGreaterThanOrEqual(before + 900);
    expect(options.deadlineMs).toBeLessThanOrEqual(Date.now() + 900);
  });

  it('leaves a server the config tier marked unreachable to that tier’s retry window', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const deps = recoveryDeps(discoverServerTools);
    const failed = {
      ...serverConfig('failed'),
      inspectionFailed: true,
      source: 'config',
    } as ParsedServerConfig;

    const result = await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          { serverName: 'failed', serverConfig: failed },
          { serverName: 'healthy', serverConfig: serverConfig('healthy') },
        ],
      },
      deps,
    );

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'healthy' }),
    );
    expect([...result.keys()]).toEqual(['healthy']);
  });

  it('skips a server whose user-provided variables are unset and recovers its siblings', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const needsVars = withUserVars(serverConfig('needs-vars'));

    const result = await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          { serverName: 'needs-vars', serverConfig: needsVars },
          { serverName: 'open', serverConfig: serverConfig('open') },
        ],
      },
      recoveryDeps(discoverServerTools),
    );

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'open' }),
    );
    expect([...result.keys()]).toEqual(['open']);
  });

  it('discovers a server whose user-provided variables are satisfied', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const needsVars = withUserVars(serverConfig('needs-vars'));

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'needs-vars', serverConfig: needsVars }] },
      recoveryDeps(discoverServerTools, {
        [`${Constants.mcp_prefix}needs-vars`]: { API_KEY: 'set' },
      }),
    );

    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'needs-vars',
        customUserVars: { API_KEY: 'set' },
      }),
    );
  });

  it('skips the auth lookup entirely when every cold server is ineligible', async () => {
    const discoverServerTools = jest.fn();
    const deps = recoveryDeps(discoverServerTools);
    const failed = {
      ...serverConfig('failed'),
      inspectionFailed: true,
      source: 'config',
    } as ParsedServerConfig;

    const result = await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'failed', serverConfig: failed }] },
      deps,
    );

    expect(deps.loadUserMCPAuthMap).not.toHaveBeenCalled();
    expect(discoverServerTools).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it('still attempts a yaml stub, which has no retry timer of its own', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const stub = {
      ...serverConfig('yaml-stub'),
      inspectionFailed: true,
      source: 'yaml',
    } as ParsedServerConfig;

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'yaml-stub', serverConfig: stub }] },
      recoveryDeps(discoverServerTools),
    );

    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'yaml-stub' }),
    );
  });

  it('reads plugin auth only when a cold server actually declares user variables', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const deps = recoveryDeps(discoverServerTools);

    await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          { serverName: 'open-a', serverConfig: serverConfig('open-a') },
          { serverName: 'open-b', serverConfig: serverConfig('open-b') },
        ],
      },
      deps,
    );

    expect(deps.loadUserMCPAuthMap).not.toHaveBeenCalled();
    expect(discoverServerTools).toHaveBeenCalledTimes(2);
  });

  it('asks plugin auth only for the credential-bearing servers in a mixed list', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const deps = recoveryDeps(discoverServerTools, {
      [`${Constants.mcp_prefix}guarded`]: { API_KEY: 'set' },
    });

    await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          { serverName: 'open', serverConfig: serverConfig('open') },
          { serverName: 'guarded', serverConfig: withUserVars(serverConfig('guarded')) },
        ],
      },
      deps,
    );

    expect(deps.loadUserMCPAuthMap).toHaveBeenCalledWith('user-1', ['guarded']);
    expect(discoverServerTools).toHaveBeenCalledTimes(2);
  });

  it('holds a limiter slot until its discovery settles, so concurrency stays honest', async () => {
    /** A slot released while its network operation is still running would let a fourth
     *  discovery start; awaiting the work rather than racing it keeps the limit real. */
    let active = 0;
    let maxActive = 0;
    const discoverServerTools = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { tools: null };
    });
    const servers = Array.from({ length: 9 }, (_, index) => ({
      serverName: `slow-${index}`,
      serverConfig: serverConfig(`slow-${index}`),
    }));

    const result = await recoverMCPServerCatalogs(
      { user, servers },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools,
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect(discoverServerTools).toHaveBeenCalledTimes(9);
    expect(maxActive).toBe(3);
    expect(result.size).toBe(0);
  });

  it('attempts every cold server, so none is starved by those ahead of it', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const servers = Array.from({ length: 12 }, (_, index) => ({
      serverName: `server-${index}`,
      serverConfig: serverConfig(`server-${index}`),
    }));

    await recoverMCPServerCatalogs({ user, servers }, recoveryDeps(discoverServerTools));
    await recoverMCPServerCatalogs({ user, servers }, recoveryDeps(discoverServerTools));

    expect(discoverServerTools).toHaveBeenCalledTimes(24);
    for (const { serverName } of servers) {
      expect(discoverServerTools).toHaveBeenCalledWith(expect.objectContaining({ serverName }));
    }
  });

  it('bounds snapshot refreshes, which each issue a real tools/list', async () => {
    let active = 0;
    let maxActive = 0;
    const servers = Array.from({ length: 9 }, (_, index) => ({
      serverName: `server-${index}`,
      serverConfig: serverConfig(`server-${index}`),
    }));

    await loadMCPServerCatalogs(
      { user, servers },
      {
        getCachedServerTools: jest.fn().mockResolvedValue(null),
        getServerToolFunctionsSnapshot: jest.fn(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active -= 1;
          return { tools: null };
        }),
        cacheServerTools: jest.fn(),
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn().mockResolvedValue({ tools: null }),
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect(maxActive).toBe(3);
  });
});
