import {
  MAX_SUBAGENT_DEPTH,
  MAX_SUBAGENT_GRAPH_NODES,
  PermissionBits,
  ResourceType,
} from 'librechat-data-provider';
import type { Agent, GraphEdge } from 'librechat-data-provider';
import type { InitializedAgent } from './initialize';
import { resolveSubagents } from './subagents';

const PRIMARY_ID = 'agent_primary';
const SUBAGENT_ID = 'agent_subagent';

function makeInitializedAgent(
  id: string,
  overrides: Partial<InitializedAgent> = {},
): InitializedAgent {
  return {
    id,
    endpoint: 'agents',
    edges: [],
    tools: [],
    attachments: [],
    requestAttachments: [],
    agentContextAttachments: [],
    toolContextMap: {},
    maxContextTokens: 4096,
    useLegacyContent: false,
    resendFiles: true,
    codeEnvAvailable: false,
    skillAuthoringAvailable: false,
    ...overrides,
  } as InitializedAgent;
}

function makeAgent(id: string): Agent {
  return {
    id,
    _id: id,
    name: id,
    provider: 'openai',
    model: 'gpt-4',
    tools: [],
  } as unknown as Agent;
}

describe('resolveSubagents', () => {
  const req = { user: { id: 'user-1', role: 'USER' } };
  const res = {} as import('express').Response;

  it('loads explicit subagents onto the primary and prunes pure subagents from agentConfigs', async () => {
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: false, agent_ids: [SUBAGENT_ID] },
    });
    const subagentConfig = makeInitializedAgent(SUBAGENT_ID);
    const agentConfigs = new Map<string, InitializedAgent>();
    const initializeAgent = jest.fn().mockResolvedValue(subagentConfig);
    const validateAgentModel = jest.fn().mockResolvedValue({ isValid: true });

    await resolveSubagents(
      {
        req,
        res,
        primaryConfig,
        agentConfigs,
        edges: [],
        subagentsCapabilityEnabled: true,
        allowedProviders: new Set(['openai']),
        modelsConfig: {},
        loadTools: jest.fn(),
      },
      {
        getAgent: jest.fn().mockResolvedValue(makeAgent(SUBAGENT_ID)),
        checkPermission: jest.fn().mockResolvedValue(true),
        logViolation: jest.fn(),
        db: {},
        initializeAgent,
        validateAgentModel,
      },
    );

    expect(primaryConfig.subagentAgentConfigs).toHaveLength(1);
    expect(primaryConfig.subagentAgentConfigs?.[0].id).toBe(SUBAGENT_ID);
    expect(agentConfigs.has(SUBAGENT_ID)).toBe(false);
    expect(initializeAgent).toHaveBeenCalledTimes(1);
  });

  it('keeps handoff targets that are also subagents in agentConfigs', async () => {
    const edges: GraphEdge[] = [{ from: PRIMARY_ID, to: SUBAGENT_ID, edgeType: 'handoff' }];
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: false, agent_ids: [SUBAGENT_ID] },
    });
    const sharedConfig = makeInitializedAgent(SUBAGENT_ID);
    const agentConfigs = new Map<string, InitializedAgent>([[SUBAGENT_ID, sharedConfig]]);

    await resolveSubagents(
      {
        req,
        res,
        primaryConfig,
        agentConfigs,
        edges,
        subagentsCapabilityEnabled: true,
        allowedProviders: new Set(['openai']),
        modelsConfig: {},
        loadTools: jest.fn(),
      },
      {
        getAgent: jest.fn(),
        checkPermission: jest.fn(),
        logViolation: jest.fn(),
        db: {},
      },
    );

    expect(primaryConfig.subagentAgentConfigs).toHaveLength(1);
    expect(agentConfigs.has(SUBAGENT_ID)).toBe(true);
  });

  it('clears subagents when the capability is disabled', async () => {
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: true, agent_ids: [] },
      subagentAgentConfigs: [makeInitializedAgent(SUBAGENT_ID)],
    });
    const agentConfigs = new Map<string, InitializedAgent>();

    await resolveSubagents(
      {
        req,
        res,
        primaryConfig,
        agentConfigs,
        edges: [],
        subagentsCapabilityEnabled: false,
        allowedProviders: new Set(['openai']),
        modelsConfig: {},
        loadTools: jest.fn(),
      },
      {
        getAgent: jest.fn(),
        checkPermission: jest.fn(),
        logViolation: jest.fn(),
        db: {},
      },
    );

    expect(primaryConfig.subagents).toBeUndefined();
    expect(primaryConfig.subagentAgentConfigs).toEqual([]);
  });

  it('rejects graphs deeper than MAX_SUBAGENT_DEPTH', async () => {
    const ids = Array.from(
      { length: MAX_SUBAGENT_DEPTH + 1 },
      (_, index) => `agent_depth_${index}`,
    );
    const nestedConfigs = new Map(
      ids.map((id, index) => [
        id,
        makeInitializedAgent(id, {
          subagents:
            index < ids.length - 1
              ? { enabled: true, allowSelf: false, agent_ids: [ids[index + 1]] }
              : undefined,
        }),
      ]),
    );
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: false, agent_ids: [ids[0]] },
    });
    const initializeAgent = jest.fn(async ({ agent }) => nestedConfigs.get(agent.id as string));
    const validateAgentModel = jest.fn().mockResolvedValue({ isValid: true });

    await expect(
      resolveSubagents(
        {
          req,
          res,
          primaryConfig,
          agentConfigs: new Map(),
          edges: [],
          subagentsCapabilityEnabled: true,
          allowedProviders: new Set(['openai']),
          modelsConfig: {},
          loadTools: jest.fn(),
        },
        {
          getAgent: jest.fn(async ({ id }) => makeAgent(id)),
          checkPermission: jest.fn().mockResolvedValue(true),
          logViolation: jest.fn(),
          db: {},
          initializeAgent,
          validateAgentModel,
        },
      ),
    ).rejects.toThrow(`maximum depth of ${MAX_SUBAGENT_DEPTH}`);
  });

  it('rejects graphs with more than MAX_SUBAGENT_GRAPH_NODES unique agents', async () => {
    const firstLevelIds = Array.from({ length: 10 }, (_, index) => `agent_graph_${index}`);
    const secondLevelIdsByParent = new Map(
      firstLevelIds.map((id) => [
        id,
        Array.from({ length: 5 }, (_, index) => `${id}_child_${index}`),
      ]),
    );
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: false, agent_ids: firstLevelIds },
    });
    const initializeAgent = jest.fn(async ({ agent }) =>
      makeInitializedAgent(agent.id as string, {
        subagents: {
          enabled: true,
          allowSelf: false,
          agent_ids: secondLevelIdsByParent.get(agent.id as string) ?? [],
        },
      }),
    );
    const validateAgentModel = jest.fn().mockResolvedValue({ isValid: true });

    await expect(
      resolveSubagents(
        {
          req,
          res,
          primaryConfig,
          agentConfigs: new Map(),
          edges: [],
          subagentsCapabilityEnabled: true,
          allowedProviders: new Set(['openai']),
          modelsConfig: {},
          loadTools: jest.fn(),
        },
        {
          getAgent: jest.fn(async ({ id }) => makeAgent(id)),
          checkPermission: jest.fn().mockResolvedValue(true),
          logViolation: jest.fn(),
          db: {},
          initializeAgent,
          validateAgentModel,
        },
      ),
    ).rejects.toThrow(`maximum of ${MAX_SUBAGENT_GRAPH_NODES}`);
  });

  it('uses the provided resourceType for permission checks', async () => {
    const primaryConfig = makeInitializedAgent(PRIMARY_ID, {
      subagents: { enabled: true, allowSelf: false, agent_ids: [SUBAGENT_ID] },
    });
    const checkPermission = jest.fn().mockResolvedValue(false);

    await resolveSubagents(
      {
        req,
        res,
        primaryConfig,
        agentConfigs: new Map(),
        edges: [],
        subagentsCapabilityEnabled: true,
        resourceType: ResourceType.REMOTE_AGENT,
        allowedProviders: new Set(['openai']),
        modelsConfig: {},
        loadTools: jest.fn(),
      },
      {
        getAgent: jest.fn().mockResolvedValue(makeAgent(SUBAGENT_ID)),
        checkPermission,
        logViolation: jest.fn(),
        db: {},
      },
    );

    expect(checkPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: ResourceType.REMOTE_AGENT,
        requiredPermission: PermissionBits.VIEW,
      }),
    );
    expect(primaryConfig.subagentAgentConfigs).toEqual([]);
  });
});
