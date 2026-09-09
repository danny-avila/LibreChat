import { AgentCapabilities, Permissions, PermissionTypes } from 'librechat-data-provider';
import type { IUser, IRole, AppConfig, AgentGraphNode } from '@librechat/data-schemas';
import type { ParsedServerConfig } from '../mcp/types';
import { createScheduleMCPPreflight, ScheduleMCPError } from './mcp';

const principal = { id: 'owner', role: 'USER' };
const server: ParsedServerConfig = { type: 'streamable-http', url: 'https://mcp.example.test/mcp' };

function graphNode(id: string, fields: Partial<AgentGraphNode> = {}): AgentGraphNode {
  return { id, provider: 'openAI', model: 'gpt-test', ...fields };
}

function setup(tools = ['search_mcp_docs']) {
  const disconnect = jest.fn();
  const deps: Parameters<typeof createScheduleMCPPreflight>[0] = {
    resolveAgentGraphAccess: jest.fn(async () => ({}) as never),
    getAgentGraphNodes: jest.fn(async (ids) =>
      ids.map((id) => ({ id, provider: 'openAI', model: 'gpt-test', tools })),
    ),
    getModelsConfig: jest.fn(async () => ({ openAI: ['gpt-test'] })),
    getRoleByName: jest.fn(
      async () =>
        ({ permissions: { [PermissionTypes.MCP_SERVERS]: { [Permissions.USE]: true } } }) as IRole,
    ),
    getUser: jest.fn(
      async () => ({ id: 'owner', role: 'USER', email: 'owner@example.test' }) as IUser,
    ),
    getAppConfig: jest.fn(
      async () =>
        ({
          endpoints: { agents: { capabilities: [AgentCapabilities.tools] } },
        }) as AppConfig,
    ),
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
  const preflight = createScheduleMCPPreflight(deps);
  return {
    deps,
    disconnect,
    check: (
      agentId: string,
      user: typeof principal,
      options?: { concurrency?: number; signal?: AbortSignal; deadlineMs?: number },
    ) => preflight(agentId, user, { concurrency: 3, ...options }),
  };
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
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? graphNode(id, { tools: [], edges: [{ from: 'root', to: 'child' }] })
        : graphNode(id, { tools: ['search_mcp_docs'], agent_ids: ['root'] }),
    ),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgentGraphNodes).toHaveBeenCalledTimes(2);
});

it('loads each graph frontier in one batch', async () => {
  const childIds = Array.from({ length: 20 }, (_, index) => `child-${index}`);
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) =>
      graphNode(id, {
        tools: id === childIds[0] ? ['search_mcp_docs'] : [],
        edges:
          id === 'root' ? childIds.map((childId) => ({ from: 'root', to: childId })) : undefined,
      }),
    ),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgentGraphNodes).toHaveBeenNthCalledWith(1, ['root']);
  expect(deps.getAgentGraphNodes).toHaveBeenNthCalledWith(2, childIds, expect.any(Object));
  expect(deps.resolveAgentGraphAccess).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'owner', role: 'USER' }),
  );
  expect(deps.getAgentGraphNodes).toHaveBeenCalledTimes(2);
});

it('does not count the root or legacy handoff nodes against the spawn graph budget', async () => {
  const spawnIds = Array.from({ length: 50 }, (_, index) => `spawn-${index}`);
  const legacyIds = Array.from({ length: 55 }, (_, index) => `handoff-${index}`);
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: {
          agents: { capabilities: [AgentCapabilities.tools, AgentCapabilities.subagents] },
        },
      }) as unknown as AppConfig,
  );
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? graphNode(id, {
            tools: [],
            agent_ids: legacyIds,
            subagents: { enabled: true, agent_ids: spawnIds } as never,
          })
        : graphNode(id, {
            tools: id === spawnIds[0] ? ['search_mcp_docs'] : [],
          }),
    ),
  );

  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
});

it('skips only a subagent graph definition that exceeds the runtime member budget', async () => {
  const acceptedIds = Array.from({ length: 50 }, (_, index) => `accepted-${index}`);
  const { check, deps } = setup([]);
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: {
          agents: { capabilities: [AgentCapabilities.tools, AgentCapabilities.subagents] },
        },
      }) as unknown as AppConfig,
  );
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) => {
      if (id === 'root') {
        return graphNode(id, {
          subagents: {
            enabled: true,
            graphs: [{ agent_ids: acceptedIds }, { agent_ids: ['overflow'] }],
          } as never,
        });
      }
      return graphNode(id, { tools: id === acceptedIds[0] ? ['search_mcp_docs'] : [] });
    }),
  );

  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgentGraphNodes).toHaveBeenCalledTimes(2);
  expect(deps.getAgentGraphNodes).not.toHaveBeenCalledWith(
    expect.arrayContaining(['overflow']),
    expect.anything(),
  );
});

it('skips MCP tools on graph agents the owner cannot view', async () => {
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids, access) =>
    ids.flatMap((id) => {
      if (id === 'root') {
        return [graphNode(id, { tools: [], edges: [{ from: 'root', to: 'private' }] })];
      }
      return access == null ? [graphNode(id, { tools: ['search_mcp_docs'] })] : [];
    }),
  );
  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('reuses one resolved access context across deep graph frontiers', async () => {
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) => {
      if (id === 'root') {
        return graphNode(id, { tools: [], edges: [{ from: 'root', to: 'middle' }] });
      }
      if (id === 'middle') {
        return graphNode(id, { tools: [], edges: [{ from: 'middle', to: 'leaf' }] });
      }
      return graphNode(id, { tools: ['search_mcp_docs'] });
    }),
  );

  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
  expect(deps.getAgentGraphNodes).toHaveBeenCalledTimes(3);
  expect(deps.resolveAgentGraphAccess).toHaveBeenCalledTimes(1);
});

it('ignores accessible descendants whose provider model is unavailable at runtime', async () => {
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? graphNode(id, { tools: [], edges: [{ from: 'root', to: 'retired' }] })
        : graphNode(id, {
            provider: 'anthropic',
            model: 'retired-model',
            tools: ['search_mcp_docs'],
          }),
    ),
  );

  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('prunes viewable descendants stranded behind an inaccessible edge node', async () => {
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids, access) =>
    ids.flatMap((id) => {
      if (id === 'root') {
        return [
          graphNode(id, {
            tools: [],
            edges: [
              { from: 'root', to: 'private' },
              { from: 'private', to: 'visible' },
            ],
          }),
        ];
      }
      if (id === 'visible' && access != null) {
        return [graphNode(id, { tools: ['search_mcp_docs'] })];
      }
      return [];
    }),
  );

  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('prunes later legacy chain members when an earlier member is unavailable', async () => {
  const { check, deps } = setup();
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.flatMap((id) => {
      if (id === 'root') {
        return [graphNode(id, { tools: [], agent_ids: ['missing', 'visible'] })];
      }
      if (id === 'visible') {
        return [graphNode(id, { tools: ['search_mcp_docs'] })];
      }
      return [];
    }),
  );

  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
});

it('includes enabled spawn-graph members when the capability is available', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: {
          agents: { capabilities: [AgentCapabilities.tools, AgentCapabilities.subagents] },
        },
      }) as AppConfig,
  );
  deps.getAgentGraphNodes = jest.fn(async (ids) =>
    ids.map((id) =>
      id === 'root'
        ? graphNode(id, {
            tools: [],
            subagents: {
              enabled: true,
              graphs: [{ name: 'research', type: 'single_agent', agent_ids: ['spawned'] }],
            } as never,
          })
        : graphNode(id, { tools: ['search_mcp_docs'] }),
    ),
  );
  await expect(check('root', principal)).resolves.toEqual([{ server: 'docs', status: 'ready' }]);
});

it('skips every member of an incomplete spawn graph', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: {
          agents: { capabilities: [AgentCapabilities.tools, AgentCapabilities.subagents] },
        },
      }) as AppConfig,
  );
  deps.getAgentGraphNodes = jest.fn(async (ids, access) =>
    ids.flatMap((id) => {
      if (id === 'root') {
        return [
          graphNode(id, {
            tools: [],
            subagents: {
              enabled: true,
              graphs: [
                {
                  name: 'team',
                  type: 'team',
                  agent_ids: ['visible', 'private'],
                },
              ],
            } as never,
          }),
        ];
      }
      if (id === 'visible' && access != null) {
        return [graphNode(id, { tools: ['search_mcp_docs'] })];
      }
      return [];
    }),
  );

  await expect(check('root', principal)).resolves.toEqual([]);
  expect(deps.connect).not.toHaveBeenCalled();
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

it('uses the freshly loaded role for MCP server ACL resolution', async () => {
  const { check, deps } = setup();
  deps.getUser = jest.fn(
    async () => ({ id: 'owner', role: 'ADMIN', email: 'owner@example.test' }) as IUser,
  );

  await check('agent', principal);

  expect(deps.getServerConfigs).toHaveBeenCalledWith('owner', {}, 'ADMIN');
});

it('initializes only config servers selected by the runnable graph', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: { agents: { capabilities: [AgentCapabilities.tools] } },
        mcpConfig: {
          docs: { type: 'streamable-http', url: 'https://docs.example.test/mcp' },
          unrelated: { type: 'streamable-http', url: 'https://other.example.test/mcp' },
        },
      }) as unknown as AppConfig,
  );

  await check('agent', principal);

  expect(deps.ensureConfigServers).toHaveBeenCalledWith({
    docs: { type: 'streamable-http', url: 'https://docs.example.test/mcp' },
  });
});

it('rejects a selected server shadowed by an unselected config server', async () => {
  const { check, deps } = setup(['search_mcp_Sales Force']);
  deps.getAppConfig = jest.fn(
    async () =>
      ({
        endpoints: { agents: { capabilities: [AgentCapabilities.tools] } },
        mcpConfig: {
          'Sales Force': { type: 'streamable-http', url: 'https://first.example.test/mcp' },
          Sales_Force: { type: 'streamable-http', url: 'https://second.example.test/mcp' },
        },
      }) as unknown as AppConfig,
  );
  deps.getServerConfigs = async () => ({ 'Sales Force': server });

  await expect(check('agent', principal)).rejects.toMatchObject({
    code: 'mcp_configuration_missing',
  });
  expect(deps.ensureConfigServers).toHaveBeenCalledWith({
    'Sales Force': { type: 'streamable-http', url: 'https://first.example.test/mcp' },
  });
  expect(deps.connect).not.toHaveBeenCalled();
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
    code: 'mcp_permission_denied',
  });
  expect(deps.connect).not.toHaveBeenCalled();
});

it('rejects selected MCP tools when the effective tools capability is disabled', async () => {
  const { check, deps } = setup();
  deps.getAppConfig = jest.fn(
    async () => ({ endpoints: { agents: { capabilities: [] } } }) as unknown as AppConfig,
  );

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

it('bounds simultaneous MCP connection probes', async () => {
  const serverNames = ['one', 'two', 'three', 'four', 'five'];
  const { check, deps } = setup(serverNames.map((name) => `search_mcp_${name}`));
  deps.getServerConfigs = async () => Object.fromEntries(serverNames.map((name) => [name, server]));
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
    expect(deps.connect).toHaveBeenCalledTimes(3);
  } finally {
    release();
  }
  await expect(result).resolves.toHaveLength(5);
  expect(deps.connect).toHaveBeenCalledTimes(5);
});

it('honors the configured MCP probe concurrency', async () => {
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

  const result = check('agent', principal, { concurrency: 1 });
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    expect(deps.connect).toHaveBeenCalledTimes(1);
  } finally {
    release();
  }
  await expect(result).resolves.toHaveLength(2);
});

it('passes cancellation to connection setup and tool discovery', async () => {
  const { check, deps } = setup();
  const controller = new AbortController();
  const fetchToolsSnapshot = jest.fn(
    async (
      _deadline?: number,
      signal?: AbortSignal,
    ): Promise<import('../mcp/connection').MCPToolsSnapshot> => {
      expect(signal).toBe(controller.signal);
      return {
        tools: [{ name: 'search', inputSchema: { type: 'object' as const } }],
        complete: true,
      };
    },
  );
  deps.connect = jest.fn(async (options) => {
    expect(options.signal).toBe(controller.signal);
    return { fetchToolsSnapshot };
  });

  await expect(check('agent', principal, { signal: controller.signal })).resolves.toEqual([
    { server: 'docs', status: 'ready' },
  ]);
  expect(fetchToolsSnapshot).toHaveBeenCalledWith(undefined, controller.signal);
});

it('passes the aggregate lease deadline to tool discovery', async () => {
  const { check, deps } = setup();
  const deadlineMs = Date.now() + 60_000;
  const fetchToolsSnapshot = jest.fn(async () => ({
    tools: [{ name: 'search', inputSchema: { type: 'object' as const } }],
    complete: true,
  }));
  deps.connect = jest.fn(async (options) => {
    expect(options.signal).toBeDefined();
    return { fetchToolsSnapshot };
  });

  await check('agent', principal, { deadlineMs });

  expect(fetchToolsSnapshot).toHaveBeenCalledWith(deadlineMs, expect.any(AbortSignal));
});

it('enforces the aggregate deadline while loading the agent graph', async () => {
  const { check, deps } = setup([]);
  deps.getAgentGraphNodes = jest.fn(() => new Promise<AgentGraphNode[]>(() => undefined));

  await expect(check('agent', principal, { deadlineMs: Date.now() + 20 })).rejects.toMatchObject({
    name: 'TimeoutError',
  });
});
