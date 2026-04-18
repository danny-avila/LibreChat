import { EModelEndpoint } from 'librechat-data-provider';
import type { Agent, GraphEdge } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import type { InitializedAgent } from './initialize';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockInitializeAgent = jest.fn();
jest.mock('./initialize', () => ({
  initializeAgent: (...args: unknown[]) => mockInitializeAgent(...args),
}));

const mockValidateAgentModel = jest.fn();
jest.mock('./validation', () => ({
  validateAgentModel: (...args: unknown[]) => mockValidateAgentModel(...args),
}));

import { discoverConnectedAgents } from './discovery';

const makeReq = (userId = 'u1', role = 'USER'): ServerRequest =>
  ({
    user: { id: userId, role },
  }) as unknown as ServerRequest;

const makeRes = (): Response => ({}) as unknown as Response;

const makeAgent = (id: string, edges: GraphEdge[] = []): Agent =>
  ({
    id,
    _id: `mongo-${id}`,
    provider: 'openai',
    model: 'gpt-4o',
    edges,
  }) as unknown as Agent;

const makeConfig = (id: string, edges: GraphEdge[] = []): InitializedAgent =>
  ({
    id,
    provider: 'openai',
    model: 'gpt-4o',
    edges,
    tools: [],
  }) as unknown as InitializedAgent;

describe('discoverConnectedAgents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateAgentModel.mockResolvedValue({ isValid: true });
    mockInitializeAgent.mockImplementation(async ({ agent }: { agent: Agent }) =>
      makeConfig(agent.id),
    );
  });

  it('returns empty configs and no edges for a single agent with no edges', async () => {
    const primaryConfig = makeConfig('A');
    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent: jest.fn(),
        checkPermission: jest.fn(),
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.agentConfigs.size).toBe(0);
    expect(result.edges).toEqual([]);
    expect(result.skippedAgentIds.size).toBe(0);
  });

  it('discovers handoff targets via BFS across a multi-hop chain A -> B -> C', async () => {
    const edgesAB: GraphEdge[] = [{ from: 'A', to: 'B', edgeType: 'handoff' }];
    const edgesBC: GraphEdge[] = [{ from: 'B', to: 'C', edgeType: 'handoff' }];
    const primaryConfig = makeConfig('A', edgesAB);

    const agents: Record<string, Agent> = {
      B: makeAgent('B', edgesBC),
      C: makeAgent('C', []),
    };
    const getAgent = jest.fn(async ({ id }: { id: string }) => agents[id] ?? null);
    const checkPermission = jest.fn().mockResolvedValue(true);

    const onAgentInitialized = jest.fn();

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
        onAgentInitialized,
      },
    );

    expect(getAgent).toHaveBeenCalledWith({ id: 'B' });
    expect(getAgent).toHaveBeenCalledWith({ id: 'C' });
    expect(result.agentConfigs.size).toBe(2);
    expect(result.agentConfigs.has('B')).toBe(true);
    expect(result.agentConfigs.has('C')).toBe(true);
    expect(result.edges).toHaveLength(2);
    expect(onAgentInitialized).toHaveBeenCalledTimes(2);
    expect(onAgentInitialized.mock.calls.map((c) => c[0])).toEqual(['B', 'C']);
  });

  it('skips orphaned agents and filters out edges pointing at them', async () => {
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'A', to: 'MISSING', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const getAgent = jest.fn(async ({ id }: { id: string }) =>
      id === 'B' ? makeAgent('B', []) : null,
    );
    const checkPermission = jest.fn().mockResolvedValue(true);
    const onAgentSkipped = jest.fn();

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
        onAgentSkipped,
      },
    );

    expect(result.agentConfigs.has('B')).toBe(true);
    expect(result.agentConfigs.has('MISSING')).toBe(false);
    expect(result.skippedAgentIds.has('MISSING')).toBe(true);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].to).toBe('B');
    expect(onAgentSkipped).toHaveBeenCalledWith('MISSING');
  });

  it('skips sub-agents the user lacks VIEW permission on and filters their edges', async () => {
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'A', to: 'FORBIDDEN', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const agentMap: Record<string, Agent> = {
      B: makeAgent('B', []),
      FORBIDDEN: makeAgent('FORBIDDEN', []),
    };
    const getAgent = jest.fn(async ({ id }: { id: string }) => agentMap[id] ?? null);
    const checkPermission = jest.fn(
      async ({ resourceId }: { resourceId: unknown }) => resourceId !== 'mongo-FORBIDDEN',
    );

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.agentConfigs.has('B')).toBe(true);
    expect(result.agentConfigs.has('FORBIDDEN')).toBe(false);
    expect(result.skippedAgentIds.has('FORBIDDEN')).toBe(true);
    expect(result.edges.map((e) => e.to)).toEqual(['B']);
  });

  it('forces `endpoint: agents` on sub-agent init so allowedProviders is always enforced', async () => {
    const primaryConfig = makeConfig('A', [{ from: 'A', to: 'B', edgeType: 'handoff' }]);
    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn().mockResolvedValue(true);

    await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        // Caller passes a non-agents endpoint (e.g. the OpenAI-compat
        // controllers do this — endpoint = primary provider)
        endpointOption: { endpoint: EModelEndpoint.openAI, model_parameters: {} },
        allowedProviders: new Set(['openai']),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    // The helper must override `endpoint` to 'agents' so
    // `isAgentsEndpoint` is true and the allowedProviders guard in
    // `initializeAgent` actually runs for sub-agents.
    expect(mockInitializeAgent).toHaveBeenCalled();
    const initArgs = mockInitializeAgent.mock.calls[0][0];
    expect(initArgs.endpointOption.endpoint).toBe(EModelEndpoint.agents);
  });

  it('passes the configured resourceType (e.g. REMOTE_AGENT) to checkPermission', async () => {
    const primaryConfig = makeConfig('A', [{ from: 'A', to: 'B', edgeType: 'handoff' }]);
    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn().mockResolvedValue(true);

    await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
        resourceType: 'REMOTE_AGENT',
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: 'REMOTE_AGENT' }),
    );
  });

  it('prunes sub-agents disconnected from the primary after edge filtering', async () => {
    // Graph: primary A has edges [A->B, B->C] stored directly on A.
    // BFS loads B and C before permission is checked. B is skipped, and
    // both edges reference B so they are filtered out. C was initialized
    // but is now unreachable from A through any surviving edge — it must
    // NOT be returned (otherwise it becomes a stray start node when
    // createRun sees `agents.length > 1`).
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'B', to: 'C', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const agentMap: Record<string, Agent> = {
      B: makeAgent('B', []),
      C: makeAgent('C', []),
    };
    const getAgent = jest.fn(async ({ id }: { id: string }) => agentMap[id] ?? null);
    // B fails permission, C passes.
    const checkPermission = jest.fn(
      async ({ resourceId }: { resourceId: unknown }) => resourceId !== 'mongo-B',
    );

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.skippedAgentIds.has('B')).toBe(true);
    expect(result.edges).toHaveLength(0);
    // C is unreachable once B's edges are filtered → must be pruned.
    expect(result.agentConfigs.has('C')).toBe(false);
    expect(result.agentConfigs.size).toBe(0);
  });

  it('keeps sub-agents that remain reachable via surviving edges', async () => {
    // Graph: A -> [B, C]; B is skipped, C is kept. C must remain because
    // A -> C survives filtering.
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'A', to: 'C', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const agentMap: Record<string, Agent> = {
      B: makeAgent('B', []),
      C: makeAgent('C', []),
    };
    const getAgent = jest.fn(async ({ id }: { id: string }) => agentMap[id] ?? null);
    const checkPermission = jest.fn(
      async ({ resourceId }: { resourceId: unknown }) => resourceId !== 'mongo-B',
    );

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.agentConfigs.has('C')).toBe(true);
    expect(result.agentConfigs.has('B')).toBe(false);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].to).toBe('C');
  });

  it('drops edges whose `from` references a skipped agent (bidirectional graph)', async () => {
    // Orchestrator A with bidirectional handoffs A<->B. B is inaccessible,
    // so `A -> B` and `B -> A` must both be filtered — otherwise `B -> A`
    // leaks into createRun and triggers `Found edge ending at unknown node`.
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'B', to: 'A', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn().mockResolvedValue(false);

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.skippedAgentIds.has('B')).toBe(true);
    expect(result.edges).toHaveLength(0);
  });

  it('does not re-initialize agents that are already known (dedup)', async () => {
    const edges: GraphEdge[] = [
      { from: 'A', to: 'B', edgeType: 'handoff' },
      { from: 'B', to: 'A', edgeType: 'handoff' },
      { from: 'A', to: 'B', edgeType: 'handoff' },
    ];
    const primaryConfig = makeConfig('A', edges);

    const getAgent = jest.fn(async ({ id }: { id: string }) =>
      id === 'B' ? makeAgent('B', [{ from: 'B', to: 'A', edgeType: 'handoff' }]) : null,
    );
    const checkPermission = jest.fn().mockResolvedValue(true);

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    // B should be fetched once; A is the primary and is never re-fetched
    expect(getAgent).toHaveBeenCalledTimes(1);
    expect(result.agentConfigs.size).toBe(1);
    expect(result.agentConfigs.has('B')).toBe(true);
    // Deduped edges: A->B and B->A (not the duplicate A->B)
    expect(result.edges).toHaveLength(2);
  });

  it('processes legacy agent_ids chain and adds sequential chain edges', async () => {
    const primaryConfig = makeConfig('A', []);

    const agentMap: Record<string, Agent> = {
      B: makeAgent('B', []),
      C: makeAgent('C', []),
    };
    const getAgent = jest.fn(async ({ id }: { id: string }) => agentMap[id] ?? null);
    const checkPermission = jest.fn().mockResolvedValue(true);

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        agent_ids: ['B', 'C'],
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.agentConfigs.size).toBe(2);
    expect(result.agentConfigs.has('B')).toBe(true);
    expect(result.agentConfigs.has('C')).toBe(true);
    // Sequential chain: A -> B -> C (2 direct edges)
    expect(result.edges).toHaveLength(2);
    expect(result.edges.every((e) => e.edgeType === 'direct')).toBe(true);
  });

  it('merges userMCPAuthMap across primary and sub-agents', async () => {
    const primaryConfig = makeConfig('A', [{ from: 'A', to: 'B', edgeType: 'handoff' }]);
    primaryConfig.userMCPAuthMap = { serverA: { token: 'primary' } };

    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn().mockResolvedValue(true);

    mockInitializeAgent.mockImplementation(async ({ agent }: { agent: Agent }) => {
      const cfg = makeConfig(agent.id);
      cfg.userMCPAuthMap = { serverB: { token: 'secondary' } };
      return cfg;
    });

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(result.userMCPAuthMap).toEqual({
      serverA: { token: 'primary' },
      serverB: { token: 'secondary' },
    });
  });

  it('throws when a sub-agent model validation fails', async () => {
    mockValidateAgentModel.mockResolvedValueOnce({
      isValid: false,
      error: { message: 'bad model' },
    });

    const primaryConfig = makeConfig('A', [{ from: 'A', to: 'B', edgeType: 'handoff' }]);

    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn().mockResolvedValue(true);

    const result = await discoverConnectedAgents(
      {
        req: makeReq(),
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    // Validation error is caught inside the BFS and the agent is skipped
    expect(result.skippedAgentIds.has('B')).toBe(true);
    expect(result.agentConfigs.has('B')).toBe(false);
  });

  it('skips when request has no authenticated user', async () => {
    const primaryConfig = makeConfig('A', [{ from: 'A', to: 'B', edgeType: 'handoff' }]);

    const getAgent = jest.fn(async () => makeAgent('B', []));
    const checkPermission = jest.fn();

    const result = await discoverConnectedAgents(
      {
        req: { user: undefined } as unknown as ServerRequest,
        res: makeRes(),
        primaryConfig,
        allowedProviders: new Set(),
        modelsConfig: { openai: ['gpt-4o'] },
        loadTools: jest.fn(),
      },
      {
        getAgent,
        checkPermission,
        logViolation: jest.fn(),
        db: {} as never,
      },
    );

    expect(checkPermission).not.toHaveBeenCalled();
    expect(result.skippedAgentIds.has('B')).toBe(true);
    expect(result.edges).toHaveLength(0);
  });
});
