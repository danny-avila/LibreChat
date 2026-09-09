import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import { ErrorCode, McpError, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type { IUser } from '@librechat/data-schemas';
import type { LCAvailableTools, ParsedServerConfig, ToolDiscoveryOptions } from '../types';
import {
  MCPCatalogCapacityError,
  MCPServerCatalogRecoveryTracker,
  loadMCPServerCatalogs,
  publishMCPAuthorizationMutation,
  readMCPRecoveryGeneration,
  readMCPRecoveryGenerationAround,
  recoverMCPServerCatalogs,
} from './recovery';

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const user = { id: 'user-1' } as IUser;
const recoveryTracker = new MCPServerCatalogRecoveryTracker();
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

afterEach(() => {
  recoveryTracker.clear(user.id);
  jest.restoreAllMocks();
});

describe('readMCPRecoveryGeneration', () => {
  it('keeps recovery available when the injected shared cache is unavailable', async () => {
    const reader = jest.fn().mockRejectedValue(new Error('cache unavailable'));

    await expect(
      readMCPRecoveryGeneration({ userId: user.id, serverName: 'oauth-server' }, reader),
    ).resolves.toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('oauth-server'),
      expect.any(Error),
    );
  });

  it('returns unknown instead of waiting indefinitely for the shared cache', async () => {
    const reader = jest.fn(() => new Promise<string>(() => undefined));

    await expect(
      readMCPRecoveryGeneration({ userId: user.id, serverName: 'slow-cache' }, reader, {
        timeoutMs: 5,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('readMCPRecoveryGenerationAround', () => {
  it('returns a generation only when both reads coherently bracket the operation', async () => {
    const operation = jest.fn().mockResolvedValue('authorized');
    const changedReader = jest
      .fn()
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-2');

    await expect(
      readMCPRecoveryGenerationAround(
        { userId: user.id, serverName: 'oauth' },
        changedReader,
        operation,
      ),
    ).resolves.toEqual({ value: 'authorized' });
  });
});

describe('publishMCPAuthorizationMutation', () => {
  it('retries the shared fence and clears local suppression only after it advances', async () => {
    const invalidateRecoveryGeneration = jest
      .fn()
      .mockRejectedValueOnce(new Error('cache unavailable'))
      .mockResolvedValue(undefined);
    const clearLocalRecovery = jest.fn();
    const persistPublicationRetry = jest.fn().mockResolvedValue(undefined);
    const clearPublicationRetry = jest.fn().mockResolvedValue(undefined);

    await publishMCPAuthorizationMutation(
      { userId: user.id, serverName: 'oauth' },
      {
        invalidateRecoveryGeneration,
        clearLocalRecovery,
        persistPublicationRetry,
        clearPublicationRetry,
        retryDelaysMs: [0, 0],
      },
    );

    expect(invalidateRecoveryGeneration).toHaveBeenCalledTimes(2);
    expect(persistPublicationRetry.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateRecoveryGeneration.mock.invocationCallOrder[0],
    );
    expect(clearPublicationRetry).toHaveBeenCalledWith({ userId: user.id, serverName: 'oauth' });
    expect(clearLocalRecovery).toHaveBeenCalledWith(user.id, 'oauth');
  });

  it('bounds each shared fence attempt', async () => {
    const invalidateRecoveryGeneration = jest.fn(() => new Promise(() => undefined));
    const persistPublicationRetry = jest.fn().mockResolvedValue(undefined);
    const clearPublicationRetry = jest.fn();

    await expect(
      publishMCPAuthorizationMutation(
        { userId: user.id, serverName: 'oauth' },
        {
          invalidateRecoveryGeneration,
          persistPublicationRetry,
          clearPublicationRetry,
          retryDelaysMs: [0],
          attemptTimeoutMs: 5,
        },
      ),
    ).rejects.toThrow('MCP authorization generation publication timed out');

    expect(invalidateRecoveryGeneration).toHaveBeenCalledTimes(1);
    expect(persistPublicationRetry).toHaveBeenCalledTimes(1);
    expect(clearPublicationRetry).not.toHaveBeenCalled();
  });
});

describe('MCPServerCatalogRecoveryTracker capacity', () => {
  const policy = {
    discoveryBackoffMs: [60_000],
    reauthRetryMs: 60_000,
    maxStateEntries: 2,
    generationReadTimeoutMs: 500,
    authorizationFenceRetryMs: [0],
    authorizationFenceTimeoutMs: 1_000,
  };

  const candidate = (serverName: string) => ({
    serverName,
    serverConfig: serverConfig(serverName),
  });
  const failed = (serverName: string) => async () => ({
    serverName,
    tools: null,
    state: 'backoff' as const,
  });

  it('keeps one process-wide capacity when requests carry different limits', async () => {
    const tracker = new MCPServerCatalogRecoveryTracker(2);
    const discoverA = jest.fn(failed('a'));

    await tracker.run(user, candidate('a'), policy, 'generation-1', discoverA);
    await tracker.run(
      user,
      candidate('b'),
      { ...policy, maxStateEntries: 1 },
      'generation-1',
      failed('b'),
    );
    await tracker.run(user, candidate('a'), policy, 'generation-1', discoverA);

    expect(discoverA).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used completed entry', async () => {
    const tracker = new MCPServerCatalogRecoveryTracker(2);
    const discoverA = jest.fn(failed('a'));
    const discoverB = jest.fn(failed('b'));

    await tracker.run(user, candidate('a'), policy, 'generation-1', discoverA);
    await tracker.run(user, candidate('b'), policy, 'generation-1', discoverB);
    await tracker.run(user, candidate('a'), policy, 'generation-1', discoverA);
    await tracker.run(user, candidate('c'), policy, 'generation-1', failed('c'));
    await tracker.run(user, candidate('a'), policy, 'generation-1', discoverA);
    await tracker.run(user, candidate('b'), policy, 'generation-1', discoverB);

    expect(discoverA).toHaveBeenCalledTimes(1);
    expect(discoverB).toHaveBeenCalledTimes(2);
  });
});

describe('recoverMCPServerCatalogs', () => {
  it('does not discover with a credential snapshot superseded while auth was loading', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const getRecoveryGeneration = jest
      .fn()
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-2');

    const result = await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          {
            serverName: 'guarded',
            serverConfig: withUserVars(serverConfig('guarded')),
          },
        ],
      },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({
          [`${Constants.mcp_prefix}guarded`]: { API_KEY: 'old-value' },
        }),
        discoverServerTools,
        formatServerTools: jest.fn().mockReturnValue({}),
        getRecoveryGeneration,
        recoveryTracker,
      },
    );

    expect(result.size).toBe(0);
    expect(discoverServerTools).not.toHaveBeenCalled();
  });

  it('does not discover custom credentials when either bracketing generation is unknown', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: [] });
    const getRecoveryGeneration = jest
      .fn()
      .mockRejectedValueOnce(new Error('cache unavailable'))
      .mockResolvedValueOnce('generation-2');

    await recoverMCPServerCatalogs(
      {
        user,
        servers: [
          {
            serverName: 'guarded',
            serverConfig: withUserVars(serverConfig('guarded')),
          },
        ],
      },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({
          [`${Constants.mcp_prefix}guarded`]: { API_KEY: 'possibly-stale' },
        }),
        discoverServerTools,
        formatServerTools: jest.fn().mockReturnValue({}),
        getRecoveryGeneration,
        recoveryTracker,
      },
    );

    expect(discoverServerTools).not.toHaveBeenCalled();
  });

  it('discards discovery completed after its authorization generation was superseded', async () => {
    const getRecoveryGeneration = jest
      .fn()
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-2');

    const result = await recoverMCPServerCatalogs(
      { user, servers: [{ serverName: 'oauth', serverConfig: serverConfig('oauth') }] },
      {
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn().mockResolvedValue({
          tools: [{ name: 'stale', inputSchema: { type: 'object' } }],
        }),
        formatServerTools: jest.fn().mockReturnValue(availableTools('stale')),
        getRecoveryGeneration,
        recoveryTracker,
      },
    );

    expect(result.size).toBe(0);
  });

  it('preserves backoff when generation reads intermittently fail', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: null });
    const getRecoveryGeneration = jest
      .fn()
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-1')
      .mockRejectedValue(new Error('cache unavailable'));
    const deps = {
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue({}),
      getRecoveryGeneration,
      recoveryTracker,
    };
    const servers = [{ serverName: 'offline', serverConfig: serverConfig('offline') }];

    await recoverMCPServerCatalogs({ user, servers }, deps);
    await recoverMCPServerCatalogs({ user, servers }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
  });

  it('retains a known generation when a due retry runs during a cache outage', async () => {
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: null });
    const getRecoveryGeneration = jest
      .fn()
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-1')
      .mockResolvedValueOnce('generation-1');
    const deps = {
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue({}),
      getRecoveryGeneration,
      recoveryTracker,
    };
    const servers = [{ serverName: 'offline', serverConfig: serverConfig('offline') }];
    const recoveryPolicy = { discoveryBackoffMs: [10, 20] };

    await recoverMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);
    now += 10;
    getRecoveryGeneration.mockRejectedValue(new Error('cache unavailable'));
    await recoverMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);
    now += 1;
    getRecoveryGeneration.mockResolvedValue('generation-1');
    await recoverMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(2);
  });

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
      {
        loadUserMCPAuthMap,
        discoverServerTools,
        formatServerTools,
        getRecoveryGeneration: jest.fn().mockResolvedValue('generation-1'),
      },
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
    const getServerToolFunctionsSnapshot = jest.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { tools: null };
    });

    const deps = {
      getCachedServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot,
      cacheServerTools: jest.fn(),
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue({}),
    };
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => loadMCPServerCatalogs({ user, servers }, deps)),
    );

    expect(getServerToolFunctionsSnapshot).toHaveBeenCalledTimes(21);
    expect(discoverServerTools.mock.calls.length).toBeGreaterThan(0);
    expect(discoverServerTools.mock.calls.length).toBeLessThanOrEqual(21);
    expect(maxActive).toBe(3);
    expect(results).toHaveLength(4);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(3);
    expect(results.filter(({ status }) => status === 'rejected')).toEqual([
      { status: 'rejected', reason: expect.any(MCPCatalogCapacityError) },
    ]);
    expect(
      results.flatMap((result) =>
        result.status === 'fulfilled' ? [...result.value.serverTools.keys()] : [],
      ),
    ).toHaveLength(21);
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

  it('single-flights concurrent discovery for the same user and server', async () => {
    let release: ((value: { tools: Tool[] }) => void) | undefined;
    const discoverServerTools = jest.fn(
      () =>
        new Promise<{ tools: Tool[] }>((resolve) => {
          release = resolve;
        }),
    );
    const servers = [{ serverName: 'shared', serverConfig: serverConfig('shared') }];
    const deps = {
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue(availableTools('shared-tool')),
      recoveryTracker,
    };

    const first = recoverMCPServerCatalogs({ user, servers }, deps);
    const second = recoverMCPServerCatalogs({ user, servers }, deps);
    await new Promise((resolve) => setImmediate(resolve));

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    release?.({ tools: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([
      new Map([['shared', availableTools('shared-tool')]]),
      new Map([['shared', availableTools('shared-tool')]]),
    ]);
  });

  it('retains reauthorization state and recovered public tools during the retry window', async () => {
    let recoveryGeneration = 'generation-1';
    const discoverServerTools = jest.fn().mockResolvedValue({
      tools: [{ name: 'public-tool', inputSchema: { type: 'object' as const } }],
      oauthRequired: true,
      authenticationKind: 'oauth' as const,
    });
    const servers = [{ serverName: 'oauth-server', serverConfig: serverConfig('oauth-server') }];
    const deps = {
      getCachedServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      cacheServerTools: jest.fn(),
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn().mockReturnValue(availableTools('public-tool')),
      recoveryTracker,
      getRecoveryGeneration: jest.fn(async () => recoveryGeneration),
    };

    const first = await loadMCPServerCatalogs({ user, servers }, deps);
    const second = await loadMCPServerCatalogs({ user, servers }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(first.reauthRequiredServers).toEqual(new Set(['oauth-server']));
    expect(first.reauthRequiredGenerations).toEqual(new Map([['oauth-server', 'generation-1']]));
    expect(first.serverTools).toEqual(new Map([['oauth-server', availableTools('public-tool')]]));
    expect(second.reauthRequiredServers).toEqual(new Set(['oauth-server']));
    expect(second.serverTools).toEqual(new Map());

    recoveryGeneration = 'generation-2';
    const afterCredentialMutation = await loadMCPServerCatalogs({ user, servers }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(2);
    expect(afterCredentialMutation.reauthRequiredGenerations).toEqual(
      new Map([['oauth-server', 'generation-2']]),
    );
  });

  it('backs off non-OAuth authorization failures instead of requesting reauthorization', async () => {
    const discoverServerTools = jest.fn().mockResolvedValue({
      tools: null,
      oauthRequired: true,
      authenticationKind: 'server' as const,
    });
    const servers = [{ serverName: 'server-auth', serverConfig: serverConfig('server-auth') }];
    const deps = {
      getCachedServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      cacheServerTools: jest.fn(),
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn(),
      recoveryTracker,
    };

    const first = await loadMCPServerCatalogs({ user, servers }, deps);
    const second = await loadMCPServerCatalogs({ user, servers }, deps);

    expect(discoverServerTools).toHaveBeenCalledTimes(1);
    expect(first.reauthRequiredServers).toEqual(new Set());
    expect(second.reauthRequiredServers).toEqual(new Set());
  });

  it.each([
    [
      'OBO',
      {
        ...serverConfig('request-auth'),
        obo: { scopes: 'api://mcp/.default' },
      } as ParsedServerConfig,
    ],
    [
      'direct OpenID bearer',
      {
        ...serverConfig('request-auth'),
        source: 'yaml',
        headers: { Authorization: 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}' },
      } as ParsedServerConfig,
    ],
  ])('keeps %s discovery request-bound', async (_kind, requestAuthConfig) => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: null });
    const servers = [{ serverName: 'request-auth', serverConfig: requestAuthConfig }];
    const deps = {
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn(),
      recoveryTracker,
    };

    await Promise.all([
      recoverMCPServerCatalogs({ user, servers, signal: firstController.signal }, deps),
      recoverMCPServerCatalogs({ user, servers, signal: secondController.signal }, deps),
    ]);

    expect(discoverServerTools).toHaveBeenCalledTimes(2);
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ signal: firstController.signal }),
    );
    expect(discoverServerTools).toHaveBeenCalledWith(
      expect.objectContaining({ signal: secondController.signal }),
    );
  });

  it('backs off failed discovery progressively and resets after explicit reconnect', async () => {
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const discoverServerTools = jest.fn().mockRejectedValue(new Error('offline'));
    const servers = [{ serverName: 'offline', serverConfig: serverConfig('offline') }];
    const deps = {
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn(),
      recoveryTracker,
    };

    await recoverMCPServerCatalogs({ user, servers }, deps);
    await recoverMCPServerCatalogs({ user, servers }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(1);

    now += 5 * 60_000;
    await recoverMCPServerCatalogs({ user, servers }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(2);

    now += 5 * 60_000;
    await recoverMCPServerCatalogs({ user, servers }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(2);

    recoveryTracker.clear(user.id, 'offline');
    await recoverMCPServerCatalogs({ user, servers }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(3);
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

  it('applies the configured recovery policy through the catalog loader', async () => {
    let now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const servers = [{ serverName: 'offline', serverConfig: serverConfig('offline') }];
    const discoverServerTools = jest.fn().mockResolvedValue({ tools: null });
    const deps = {
      getCachedServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      cacheServerTools: jest.fn(),
      loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
      discoverServerTools,
      formatServerTools: jest.fn(),
      recoveryTracker,
    };
    const recoveryPolicy = {
      discoveryBackoffMs: [10],
      reauthRetryMs: 20,
      maxStateEntries: 10,
    };

    await loadMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);
    now += 9;
    await loadMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(1);

    now += 1;
    await loadMCPServerCatalogs({ user, servers, recoveryPolicy }, deps);
    expect(discoverServerTools).toHaveBeenCalledTimes(2);
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
    getRecoveryGeneration: jest.fn().mockResolvedValue('generation-1'),
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
    const before = Date.now();
    const servers = Array.from({ length: 9 }, (_, index) => ({
      serverName: `server-${index}`,
      serverConfig: serverConfig(`server-${index}`),
    }));
    const getServerToolFunctionsSnapshot = jest.fn(
      async (
        _userId: string,
        _serverName: string,
        _serverConfig: ParsedServerConfig,
        _options?: { deadlineMs?: number; signal?: AbortSignal },
      ) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return { tools: null };
      },
    );

    await loadMCPServerCatalogs(
      { user, servers },
      {
        getCachedServerTools: jest.fn().mockResolvedValue(null),
        getServerToolFunctionsSnapshot,
        cacheServerTools: jest.fn(),
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn().mockResolvedValue({ tools: null }),
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );

    expect(maxActive).toBe(3);
    const options = getServerToolFunctionsSnapshot.mock.calls[0]?.[3];
    expect(options?.deadlineMs).toBeGreaterThanOrEqual(before + 30_000);
    expect(options?.deadlineMs).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it('cancels queued catalog work when the originating request ends', async () => {
    const controller = new AbortController();
    const releases: Array<() => void> = [];
    const servers = Array.from({ length: 9 }, (_, index) => ({
      serverName: `server-${index}`,
      serverConfig: serverConfig(`server-${index}`),
    }));
    const getServerToolFunctionsSnapshot = jest.fn(
      () =>
        new Promise<{ tools: null }>((resolve) => {
          releases.push(() => resolve({ tools: null }));
        }),
    );

    const loading = loadMCPServerCatalogs(
      { user, servers, signal: controller.signal },
      {
        getCachedServerTools: jest.fn().mockResolvedValue(null),
        getServerToolFunctionsSnapshot,
        cacheServerTools: jest.fn(),
        loadUserMCPAuthMap: jest.fn().mockResolvedValue({}),
        discoverServerTools: jest.fn().mockResolvedValue({ tools: null }),
        formatServerTools: jest.fn().mockReturnValue({}),
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(getServerToolFunctionsSnapshot).toHaveBeenCalledTimes(3);

    controller.abort();
    releases.splice(0).forEach((release) => release());
    await loading;

    expect(getServerToolFunctionsSnapshot).toHaveBeenCalledTimes(3);
    expect(getServerToolFunctionsSnapshot).toHaveBeenCalledWith(
      user.id,
      'server-0',
      servers[0].serverConfig,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
