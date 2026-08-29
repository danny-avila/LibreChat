import { Constants } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import {
  loadMCPServerCatalogs,
  recoverMCPServerCatalogs,
  createMCPCatalogRecoveryCooldown,
} from './recovery';

const user = { id: 'user-1' } as IUser;
const serverConfig = (name: string): ParsedServerConfig =>
  ({ type: 'streamable-http', url: `https://${name}.example.com/mcp` }) as ParsedServerConfig;
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
      { serverName: 'alpha', serverConfig: serverConfig('alpha') },
      { serverName: 'beta', serverConfig: serverConfig('beta') },
    ];
    const loadUserMCPAuthMap = jest.fn().mockResolvedValue({
      [`${Constants.mcp_prefix}alpha`]: { API_KEY: 'alpha-secret' },
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
        customUserVars: undefined,
      }),
    );
    expect(result.size).toBe(2);
  });

  it('limits passive discovery to three concurrent servers', async () => {
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

    const result = await recoverMCPServerCatalogs(
      { user, servers },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools,
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect(discoverServerTools).toHaveBeenCalledTimes(7);
    expect(maxActive).toBe(3);
    expect(result.size).toBe(7);
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

  it('bounds each connection attempt the factory makes', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'slow', serverConfig: serverConfig('slow') }] },
      recoveryDeps(discoverServerTools),
    );

    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'slow', connectionTimeout: 5000 }),
    );
  });

  it('keeps a shorter configured initTimeout instead of raising it to the cap', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const impatient = { ...serverConfig('impatient'), initTimeout: 1500 } as ParsedServerConfig;

    await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'impatient', serverConfig: impatient }] },
      recoveryDeps(discoverServerTools),
    );

    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 1500 }),
    );
  });

  it('leaves a server the config tier marked unreachable to that tier’s retry window', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const deps = recoveryDeps(discoverServerTools);
    const failed = { ...serverConfig('failed'), inspectionFailed: true } as ParsedServerConfig;

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

    expect(deps.loadUserMCPAuthMap).toHaveBeenCalledWith('user-1', ['healthy']);
    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ serverName: 'healthy' }),
    );
    expect([...result.keys()]).toEqual(['healthy']);
  });

  it('skips a server whose user-provided variables are unset and recovers its siblings', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const needsVars = {
      ...serverConfig('needs-vars'),
      customUserVars: { API_KEY: { title: 'API key', description: 'Server API key' } },
    } as ParsedServerConfig;

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
    const needsVars = {
      ...serverConfig('needs-vars'),
      customUserVars: { API_KEY: { title: 'API key', description: 'Server API key' } },
    } as ParsedServerConfig;

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

  it('does not re-dial a server that just failed discovery', async () => {
    const discoverServerTools = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ tools: [] });
    const recoveryCooldown = createMCPCatalogRecoveryCooldown();
    const servers = [{ serverName: 'offline', serverConfig: serverConfig('offline') }];
    const deps = { ...recoveryDeps(discoverServerTools), recoveryCooldown };

    await recoverMCPServerCatalogs({ user, servers }, deps);
    const second = await recoverMCPServerCatalogs({ user, servers }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(second.size).toBe(0);
  });

  it('keeps re-dialing a server that recovers successfully', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const recoveryCooldown = createMCPCatalogRecoveryCooldown();
    const servers = [{ serverName: 'healthy', serverConfig: serverConfig('healthy') }];
    const deps = { ...recoveryDeps(discoverServerTools), recoveryCooldown };

    await recoverMCPServerCatalogs({ user, servers }, deps);
    await recoverMCPServerCatalogs({ user, servers }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(2);
  });

  it('skips the auth lookup entirely when every cold server is ineligible', async () => {
    const discoverServerTools = jest.fn();
    const deps = recoveryDeps(discoverServerTools);
    const failed = { ...serverConfig('failed'), inspectionFailed: true } as ParsedServerConfig;

    const result = await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'failed', serverConfig: failed }] },
      deps,
    );

    expect(deps.loadUserMCPAuthMap).not.toHaveBeenCalled();
    expect(discoverServerTools).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});

describe('createMCPCatalogRecoveryCooldown', () => {
  it('holds a failure for the cooldown window and releases it afterwards', () => {
    jest.useFakeTimers();
    try {
      const cooldown = createMCPCatalogRecoveryCooldown(60_000);
      cooldown.recordFailure('user-1:alpha:gen-1');

      expect(cooldown.isCoolingDown('user-1:alpha:gen-1')).toBe(true);
      jest.advanceTimersByTime(59_000);
      expect(cooldown.isCoolingDown('user-1:alpha:gen-1')).toBe(true);
      jest.advanceTimersByTime(2_000);
      expect(cooldown.isCoolingDown('user-1:alpha:gen-1')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps distinct identities apart and clears one on success', () => {
    const cooldown = createMCPCatalogRecoveryCooldown(60_000);
    cooldown.recordFailure('user-1:alpha:gen-1');

    expect(cooldown.isCoolingDown('user-1:beta:gen-1')).toBe(false);
    expect(cooldown.isCoolingDown('user-2:alpha:gen-1')).toBe(false);
    expect(cooldown.isCoolingDown('user-1:alpha:gen-2')).toBe(false);

    cooldown.recordSuccess('user-1:alpha:gen-1');
    expect(cooldown.isCoolingDown('user-1:alpha:gen-1')).toBe(false);
  });

  it('sweeps expired entries so the failure map cannot grow without bound', () => {
    jest.useFakeTimers();
    try {
      const cooldown = createMCPCatalogRecoveryCooldown(60_000);
      for (let i = 0; i < 50; i++) {
        cooldown.recordFailure(`user-${i}:alpha:gen-1`);
      }
      jest.advanceTimersByTime(61_000);
      cooldown.recordFailure('user-current:alpha:gen-1');

      expect(cooldown.isCoolingDown('user-current:alpha:gen-1')).toBe(true);
      for (let i = 0; i < 50; i++) {
        expect(cooldown.isCoolingDown(`user-${i}:alpha:gen-1`)).toBe(false);
      }
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('recoverMCPServerCatalogs — request-level bounds', () => {
  const hangingDeps = (discoverServerTools: jest.Mock) => ({
    loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
    discoverServerTools,
    formatServerTools: jest.fn().mockReturnValue({}),
  });

  it('gives up on a server that outlives the deadline, however long the factory waits', async () => {
    jest.useFakeTimers();
    try {
      /** Mirrors MCPConnectionFactory spending `connectionTimeout` on the authenticated attempt
       *  and again on the unauthenticated one: the deadline must bound the pair, not each. */
      const discoverServerTools = jest.fn(
        ({ connectionTimeout }: ToolDiscoveryOptions) =>
          new Promise<{ tools: null }>((resolve) =>
            setTimeout(() => resolve({ tools: null }), (connectionTimeout ?? 0) * 2),
          ),
      );
      const servers = [{ serverName: 'unreachable', serverConfig: serverConfig('unreachable') }];

      const pending = recoverMCPServerCatalogs({ user, servers }, hangingDeps(discoverServerTools));
      /** Only the 5s deadline can settle this; the discovery itself resolves at 10s. */
      await jest.advanceTimersByTimeAsync(5_000);
      const result = await pending;

      expect(discoverServerTools).toHaveBeenCalledWith(
        expect.objectContaining({ connectionTimeout: 5000 }),
      );
      expect(result.size).toBe(0);
      await jest.advanceTimersByTimeAsync(10_000);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops dialing once the request budget is spent and records no cooldown for the untried', async () => {
    jest.useFakeTimers();
    try {
      const recoveryCooldown = createMCPCatalogRecoveryCooldown(60_000);
      const recordFailure = jest.spyOn(recoveryCooldown, 'recordFailure');
      /** Each discovery consumes the full per-server deadline, so the 10s budget funds two waves. */
      const discoverServerTools = jest.fn(
        () =>
          new Promise<{ tools: null }>((resolve) =>
            setTimeout(() => resolve({ tools: null }), 5000),
          ),
      );
      const servers = Array.from({ length: 9 }, (_, index) => ({
        serverName: `server-${index}`,
        serverConfig: serverConfig(`server-${index}`),
      }));

      const pending = recoverMCPServerCatalogs(
        { user, servers },
        { ...hangingDeps(discoverServerTools), recoveryCooldown },
      );
      await jest.advanceTimersByTimeAsync(30_000);
      const result = await pending;

      expect(discoverServerTools).toHaveBeenCalledTimes(6);
      expect(recordFailure).toHaveBeenCalledTimes(6);
      expect(result.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries immediately once a failed server’s configuration changes', async () => {
    const recoveryCooldown = createMCPCatalogRecoveryCooldown(60_000);
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: null });
    const deps = { ...hangingDeps(discoverServerTools), recoveryCooldown };
    const broken = { serverName: 'edited', serverConfig: serverConfig('typo') };
    const corrected = { serverName: 'edited', serverConfig: serverConfig('fixed') };

    await recoverMCPServerCatalogs({ user, servers: [broken] }, deps);
    await recoverMCPServerCatalogs({ user, servers: [broken] }, deps);
    await recoverMCPServerCatalogs({ user, servers: [corrected] }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(2);
    expect(discoverServerTools).toHaveBeenLastCalledWith(
      expect.objectContaining({ configServers: { edited: corrected.serverConfig } }),
    );
  });
});
