import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { IUser, IRole, AppConfig } from '@librechat/data-schemas';
import type { ParsedServerConfig } from '../mcp/types';
import { createScheduleMCPPreflight, ScheduleMCPError } from './mcp';

const principal = { id: 'owner', role: 'USER' };
const server: ParsedServerConfig = { type: 'streamable-http', url: 'https://mcp.example.test/mcp' };

function setup(tools = ['search_mcp_docs']) {
  const disconnect = jest.fn();
  const deps: Parameters<typeof createScheduleMCPPreflight>[0] = {
    getAgents: jest.fn(async (ids) => ids.map((id) => ({ _id: id as never, id, tools }))),
    findAccessibleResources: jest.fn(async () => ['root', 'agent', 'child', 'spawned']),
    getRoleByName: jest.fn(
      async () =>
        ({ permissions: { [PermissionTypes.MCP_SERVERS]: { [Permissions.USE]: true } } }) as IRole,
    ),
    getUser: jest.fn(
      async () => ({ id: 'owner', role: 'USER', email: 'owner@example.test' }) as IUser,
    ),
    getAppConfig: jest.fn(async () => undefined),
    ensureConfigServers: jest.fn(async () => ({})),
    getServerConfigs: jest.fn(async () => ({ docs: server })),
    findPluginAuthsByKeys: jest.fn(async () => []),
    connect: jest.fn(async (options) => {
      options.requestScopedConnections?.connections.set(options.serverName, { disconnect });
      return {
        fetchToolsSnapshot: async () => ({
          tools: [{ name: 'search', inputSchema: { type: 'object' as const } }],
          complete: true,
        }),
      };
    }),
  };
  return { deps, disconnect, check: createScheduleMCPPreflight(deps) };
}

it('leaves agents without MCP tools independent of MCP config and credentials', async () => {
  const { check, deps } = setup(['web_search']);
  await expect(check('agent', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('uses persisted identity with isolated connections and disposes them after discovery', async () => {
  const { check, deps, disconnect } = setup();
  await expect(check('agent', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.connect).toHaveBeenCalledWith(
    expect.objectContaining({
      user: { id: 'owner', role: 'USER', email: 'owner@example.test' },
      ephemeralConnection: true,
      returnOnOAuth: true,
      requestBody: expect.objectContaining({
        parentMessageId: '00000000-0000-0000-0000-000000000000',
      }),
    }),
  );
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it('rejects partial readiness and reports each server without exception details', async () => {
  const { check, deps, disconnect } = setup(['search_mcp_docs', 'read_mcp_private']);
  deps.getServerConfigs = async () => ({ docs: server, private: server });
  const connect = deps.connect;
  deps.connect = async (options) => {
    if (options.serverName === 'private') {
      await options.oauthStart?.('https://example.test/secret-oauth-code');
      throw new Error('secret credential');
    }
    return connect(options);
  };
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_reauth_required',
    outcomes: [
      { server: 'docs', status: 'ready' },
      { server: 'private', status: 'mcp_reauth_required' },
    ],
  });
  expect(disconnect).toHaveBeenCalledTimes(1);
});

it('rejects missing durable user variables before connecting', async () => {
  const { check, deps } = setup();
  deps.getServerConfigs = async () => ({
    docs: { ...server, customUserVars: { API_KEY: { title: 'API key', description: 'Key' } } },
  });
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_configuration_missing',
  });
  expect(deps.connect).not.toHaveBeenCalled();
});

it('does not classify a credential-store outage as missing configuration', async () => {
  const { check, deps } = setup();
  deps.findPluginAuthsByKeys = async () => {
    throw new Error('database unavailable');
  };
  await expect(check('agent', principal)).rejects.not.toBeInstanceOf(ScheduleMCPError);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('classifies a transport outage as retryable', async () => {
  const { check, deps } = setup();
  deps.connect = async () => {
    throw new Error('connection refused with secret details');
  };
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_unavailable',
    message: 'mcp_unavailable: [{"server":"docs","status":"mcp_unavailable"}]',
  });
});

it('checks graph agents once even when edges cycle', async () => {
  const { check, deps } = setup();
  deps.getAgents = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? { _id: id as never, id, tools: [], edges: [{ from: 'root', to: 'child' }] }
        : { _id: id as never, id, tools: ['search_mcp_docs'], agent_ids: ['root'] },
    ),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgents).toHaveBeenCalledTimes(2);
});

it('loads each graph frontier in one batch', async () => {
  const childIds = Array.from({ length: 20 }, (_, index) => `child-${index}`);
  const { check, deps } = setup();
  deps.findAccessibleResources = jest.fn(async () => childIds);
  deps.getAgents = jest.fn(async (ids) =>
    ids.map((id) => ({
      _id: id as never,
      id,
      tools: id === childIds[0] ? ['search_mcp_docs'] : [],
      edges: id === 'root' ? childIds.map((childId) => ({ from: 'root', to: childId })) : undefined,
    })),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgents).toHaveBeenNthCalledWith(1, ['root']);
  expect(deps.getAgents).toHaveBeenNthCalledWith(2, childIds);
  expect(deps.getAgents).toHaveBeenCalledTimes(2);
  expect(deps.findAccessibleResources).toHaveBeenCalledTimes(1);
});

it('does not count the root or legacy handoff nodes against the spawn graph budget', async () => {
  const spawnIds = Array.from({ length: 50 }, (_, index) => `spawn-${index}`);
  const legacyIds = Array.from({ length: 55 }, (_, index) => `handoff-${index}`);
  const allIds = [...spawnIds, ...legacyIds];
  const { check, deps } = setup();
  deps.findAccessibleResources = jest.fn(async () => allIds);
  deps.getAppConfig = jest.fn(
    async () => ({ endpoints: { agents: { capabilities: ['subagents'] } } }) as AppConfig,
  );
  deps.getAgents = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? {
            _id: id as never,
            id,
            tools: [],
            agent_ids: legacyIds,
            subagents: { enabled: true, agent_ids: spawnIds } as never,
          }
        : {
            _id: id as never,
            id,
            tools: id === spawnIds[0] ? ['search_mcp_docs'] : [],
          },
    ),
  );

  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
});

it('skips MCP tools on graph agents the owner cannot view', async () => {
  const { check, deps } = setup();
  deps.getAgents = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? { _id: id as never, id, tools: [], edges: [{ from: 'root', to: 'private' }] }
        : { _id: id as never, id, tools: ['search_mcp_docs'] },
    ),
  );
  deps.findAccessibleResources = async () => [];
  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('includes enabled spawn-graph members when the capability is available', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: { agents: { capabilities: ['subagents'] } },
      }) as AppConfig,
  );
  deps.getAgents = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? {
            _id: id as never,
            id,
            tools: [],
            subagents: {
              enabled: true,
              graphs: [{ name: 'research', type: 'single_agent', agent_ids: ['spawned'] }],
            } as never,
          }
        : { _id: id as never, id, tools: ['search_mcp_docs'] },
    ),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
});

it('ignores a server pin when the agent selected no tools from that server', async () => {
  const { check, deps } = setup(['sys__server__sys_mcp_docs']);
  await expect(check('agent', principal)).resolves.toEqual([]);
  expect(deps.getServerConfigs).not.toHaveBeenCalled();
  expect(deps.connect).not.toHaveBeenCalled();
});

it('propagates principal-config outages instead of reporting missing configuration', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(async (options) => {
    expect(options).toMatchObject({ failClosed: true });
    throw new Error('principal config unavailable');
  });
  await expect(check('agent', principal)).rejects.not.toBeInstanceOf(ScheduleMCPError);
});

it('reuses the loaded external identity for principal configuration', async () => {
  const { check, deps } = setup();
  deps.getUser = jest.fn(
    async () =>
      ({
        id: 'owner',
        role: 'USER',
        email: 'owner@example.test',
        idOnTheSource: 'external-owner',
      }) as IUser,
  );

  await check('agent', principal);

  expect(deps.getAppConfig).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'owner',
      role: 'USER',
      idOnTheSource: 'external-owner',
      failClosed: true,
    }),
  );
});

it('rejects an explicitly selected tool removed from an otherwise healthy server', async () => {
  const { check } = setup(['deleted_mcp_docs']);
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_configuration_missing',
  });
});

it('distinguishes an incomplete catalog from missing tools', async () => {
  const { check, deps } = setup(['deleted_mcp_docs']);
  deps.connect = async () => ({ fetchToolsSnapshot: async () => ({ tools: [], complete: false }) });
  await expect(check('agent', principal)).rejects.toMatchObject({ code: 'mcp_unavailable' });
});

it('treats a complete empty catalog as missing selected configuration', async () => {
  const { check, deps } = setup(['deleted_mcp_docs']);
  deps.connect = async () => ({ fetchToolsSnapshot: async () => ({ tools: [], complete: true }) });
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_configuration_missing',
  });
});

it('preserves authentication failures reported by tools/list snapshots', async () => {
  const { check, deps } = setup();
  deps.connect = async () => ({
    fetchToolsSnapshot: async () => ({
      tools: [],
      complete: false,
      authenticationError: { status: 401 },
    }),
  });
  await expect(check('agent', principal)).rejects.toMatchObject({ code: 'mcp_reauth_required' });
});

it('does not connect when the owner loses MCP permission', async () => {
  const { check, deps } = setup();
  deps.getRoleByName = async () => null;
  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_configuration_missing',
  });
  expect(deps.connect).not.toHaveBeenCalled();
});

it('keeps a role-store outage retryable instead of disabling the schedule', async () => {
  const { check, deps } = setup();
  deps.getRoleByName = async () => {
    throw new Error('role store unavailable');
  };
  await expect(check('agent', principal)).rejects.not.toBeInstanceOf(ScheduleMCPError);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('starts independent server probes together instead of serializing their timeouts', async () => {
  const { check, deps } = setup(['search_mcp_docs', 'search_mcp_private']);
  deps.getServerConfigs = async () => ({ docs: server, private: server });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const connect = deps.connect;
  deps.connect = jest.fn(async (options) => {
    await gate;
    return connect(options);
  });
  const result = check('agent', principal);
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    expect(deps.connect).toHaveBeenCalledTimes(2);
  } finally {
    release();
  }
  await expect(result).resolves.toEqual([
    { server: 'docs', status: 'ready' },
    { server: 'private', status: 'ready' },
  ]);
});
