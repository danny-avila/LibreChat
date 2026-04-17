const mongoose = require('mongoose');
const {
  ResourceType,
  PermissionBits,
  PrincipalType,
  PrincipalModel,
} = require('librechat-data-provider');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockInitializeAgent = jest.fn();
const mockValidateAgentModel = jest.fn();

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createContentAggregator: jest.fn(() => ({
    contentParts: [],
    aggregateContent: jest.fn(),
  })),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  initializeAgent: (...args) => mockInitializeAgent(...args),
  validateAgentModel: (...args) => mockValidateAgentModel(...args),
  GenerationJobManager: { setCollectedUsage: jest.fn() },
  getCustomEndpointConfig: jest.fn(),
  createSequentialChainEdges: jest.fn(),
}));

/** Captured by the `getDefaultHandlers` mock so tests can drive the
 *  `ON_TOOL_EXECUTE` pipeline with a real subagent id and observe whether
 *  the tool context (agent, tool_resources, skill ACLs) was preserved. */
let capturedToolExecuteOptions;
jest.mock('~/server/controllers/agents/callbacks', () => ({
  createToolEndCallback: jest.fn(() => jest.fn()),
  getDefaultHandlers: jest.fn((opts) => {
    capturedToolExecuteOptions = opts?.toolExecuteOptions;
    return {};
  }),
}));

const mockLoadToolsForExecution = jest.fn();
jest.mock('~/server/services/ToolService', () => ({
  loadAgentTools: jest.fn(),
  loadToolsForExecution: (...args) => mockLoadToolsForExecution(...args),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn().mockResolvedValue({}),
}));

let agentClientArgs;
jest.mock('~/server/controllers/agents/client', () => {
  return jest.fn().mockImplementation((args) => {
    agentClientArgs = args;
    return {};
  });
});

jest.mock('./addedConvo', () => ({
  processAddedConvo: jest.fn().mockResolvedValue({ userMCPAuthMap: undefined }),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

const { initializeClient } = require('./initialize');
const { User, AclEntry } = require('~/db/models');
const { createAgent } = require('~/models');

const PRIMARY_ID = 'agent_primary';
const TARGET_ID = 'agent_target';
const AUTHORIZED_ID = 'agent_authorized';

describe('initializeClient — processAgent ACL gate', () => {
  let mongoServer;
  let testUser;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    jest.clearAllMocks();
    agentClientArgs = undefined;

    testUser = await User.create({
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      role: 'USER',
    });

    mockValidateAgentModel.mockResolvedValue({ isValid: true });
  });

  const makeReq = () => ({
    user: { id: testUser._id.toString(), role: 'USER' },
    body: { conversationId: 'conv_1', files: [] },
    config: { endpoints: {} },
    _resumableStreamId: null,
  });

  const makeEndpointOption = () => ({
    agent: Promise.resolve({
      id: PRIMARY_ID,
      name: 'Primary',
      provider: 'openai',
      model: 'gpt-4',
      tools: [],
    }),
    model_parameters: { model: 'gpt-4' },
    endpoint: 'agents',
  });

  const makePrimaryConfig = (edges) => ({
    id: PRIMARY_ID,
    endpoint: 'agents',
    edges,
    toolDefinitions: [],
    toolRegistry: new Map(),
    userMCPAuthMap: null,
    tool_resources: {},
    resendFiles: true,
    maxContextTokens: 4096,
  });

  it('should skip handoff agent and filter its edge when user lacks VIEW access', async () => {
    await createAgent({
      id: TARGET_ID,
      name: 'Target Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: [],
    });

    const edges = [{ from: PRIMARY_ID, to: TARGET_ID, edgeType: 'handoff' }];
    mockInitializeAgent.mockResolvedValue(makePrimaryConfig(edges));

    await initializeClient({
      req: makeReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(mockInitializeAgent).toHaveBeenCalledTimes(1);
    expect(agentClientArgs.agent.edges).toEqual([]);
  });

  it('should initialize handoff agent and keep its edge when user has VIEW access', async () => {
    const authorizedAgent = await createAgent({
      id: AUTHORIZED_ID,
      name: 'Authorized Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: [],
    });

    await AclEntry.create({
      principalType: PrincipalType.USER,
      principalId: testUser._id,
      principalModel: PrincipalModel.USER,
      resourceType: ResourceType.AGENT,
      resourceId: authorizedAgent._id,
      permBits: PermissionBits.VIEW,
      grantedBy: testUser._id,
    });

    const edges = [{ from: PRIMARY_ID, to: AUTHORIZED_ID, edgeType: 'handoff' }];
    const handoffConfig = {
      id: AUTHORIZED_ID,
      edges: [],
      toolDefinitions: [],
      toolRegistry: new Map(),
      userMCPAuthMap: null,
      tool_resources: {},
    };

    let callCount = 0;
    mockInitializeAgent.mockImplementation(() => {
      callCount++;
      return callCount === 1
        ? Promise.resolve(makePrimaryConfig(edges))
        : Promise.resolve(handoffConfig);
    });

    await initializeClient({
      req: makeReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(mockInitializeAgent).toHaveBeenCalledTimes(2);
    expect(agentClientArgs.agent.edges).toHaveLength(1);
    expect(agentClientArgs.agent.edges[0].to).toBe(AUTHORIZED_ID);
  });
});

describe('initializeClient — subagent loading', () => {
  const SUBAGENT_ID = 'agent_subagent_1';
  const DUPLICATE_SUBAGENT_ID = 'agent_subagent_dup';
  const HANDOFF_AND_SUB_ID = 'agent_handoff_and_sub';

  let mongoServer;
  let testUser;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.connection.dropDatabase();
    jest.clearAllMocks();
    agentClientArgs = undefined;
    capturedToolExecuteOptions = undefined;
    mockLoadToolsForExecution.mockReset();
    mockLoadToolsForExecution.mockResolvedValue({ loadedTools: [] });

    testUser = await User.create({
      email: 'subagent@example.com',
      name: 'Subagent User',
      username: 'subuser',
      role: 'USER',
    });

    mockValidateAgentModel.mockResolvedValue({ isValid: true });
  });

  /** Grant the test user VIEW on an agent so processAgent loads it. */
  const grantView = async (agentDoc) => {
    await AclEntry.create({
      principalType: PrincipalType.USER,
      principalId: testUser._id,
      principalModel: PrincipalModel.USER,
      resourceType: ResourceType.AGENT,
      resourceId: agentDoc._id,
      permBits: PermissionBits.VIEW,
      grantedBy: testUser._id,
    });
  };

  /** Build a request with the `subagents` capability enabled. */
  const makeSubagentReq = () => ({
    user: { id: testUser._id.toString(), role: 'USER' },
    body: { conversationId: 'conv_sub', files: [] },
    config: {
      endpoints: {
        agents: {
          capabilities: ['subagents'],
        },
      },
    },
    _resumableStreamId: null,
  });

  const makeEndpointOption = () => ({
    agent: Promise.resolve({
      id: PRIMARY_ID,
      name: 'Primary',
      provider: 'openai',
      model: 'gpt-4',
      tools: [],
    }),
    model_parameters: { model: 'gpt-4' },
    endpoint: 'agents',
  });

  const makePrimaryConfig = ({ edges = [], subagents, agent_ids }) => ({
    id: PRIMARY_ID,
    endpoint: 'agents',
    edges,
    toolDefinitions: [],
    toolRegistry: new Map(),
    userMCPAuthMap: null,
    tool_resources: {},
    resendFiles: true,
    maxContextTokens: 4096,
    subagents,
    agent_ids,
  });

  const makeSubagentConfig = (id) => ({
    id,
    endpoint: 'agents',
    edges: [],
    toolDefinitions: [{ name: 'web', description: 'web', parameters: {} }],
    toolRegistry: new Map([['web', { name: 'web' }]]),
    userMCPAuthMap: null,
    tool_resources: { file_search: { file_ids: ['file_1'] } },
    accessibleSkillIds: ['skill_1'],
    actionsEnabled: true,
    resendFiles: false,
    maxContextTokens: 4096,
  });

  it('loads a configured subagent, populates `subagentAgentConfigs`, and keeps it out of `agentConfigs`', async () => {
    const subAgent = await createAgent({
      id: SUBAGENT_ID,
      name: 'Explicit Subagent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: ['web'],
    });
    await grantView(subAgent);

    const primaryConfig = makePrimaryConfig({
      subagents: { enabled: true, allowSelf: true, agent_ids: [SUBAGENT_ID] },
    });
    const subagentConfig = makeSubagentConfig(SUBAGENT_ID);

    let call = 0;
    mockInitializeAgent.mockImplementation(() =>
      Promise.resolve(++call === 1 ? primaryConfig : subagentConfig),
    );

    await initializeClient({
      req: makeSubagentReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(mockInitializeAgent).toHaveBeenCalledTimes(2);

    /** The subagent's AgentConfig is attached to the primary for run.ts to
     *  turn into `SubagentConfig[]` on the parent's `AgentInputs`. */
    expect(agentClientArgs.agent.subagentAgentConfigs).toHaveLength(1);
    expect(agentClientArgs.agent.subagentAgentConfigs[0].id).toBe(SUBAGENT_ID);

    /** Subagent-only agents must NOT appear in `agentConfigs` — otherwise the
     *  graph would treat them as a parallel/handoff node. */
    expect(agentClientArgs.agentConfigs).toBeDefined();
    expect(agentClientArgs.agentConfigs.has(SUBAGENT_ID)).toBe(false);
  });

  it('preserves subagent tool context for ON_TOOL_EXECUTE (Codex P1 regression guard)', async () => {
    /** Verifies the Codex P1 fix: `agentToolContexts.delete(subagentId)` is
     *  NOT called for subagent-only agents, so when the child dispatches
     *  `ON_TOOL_EXECUTE` the parent can still resolve its tool context
     *  (agent, tool_resources, skill ACLs, actionsEnabled) to run tools
     *  with the right scope. We drive the real `loadTools` closure that
     *  `initializeClient` wires into `toolExecuteOptions`. */
    const subAgent = await createAgent({
      id: SUBAGENT_ID,
      name: 'Explicit Subagent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: ['web'],
    });
    await grantView(subAgent);

    const primaryConfig = makePrimaryConfig({
      subagents: { enabled: true, allowSelf: false, agent_ids: [SUBAGENT_ID] },
    });
    const subagentConfig = makeSubagentConfig(SUBAGENT_ID);

    let call = 0;
    mockInitializeAgent.mockImplementation(() =>
      Promise.resolve(++call === 1 ? primaryConfig : subagentConfig),
    );

    await initializeClient({
      req: makeSubagentReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(capturedToolExecuteOptions?.loadTools).toBeInstanceOf(Function);

    /** Invoke the real closure with the subagent's id. If `agentToolContexts`
     *  had been deleted (as in the pre-fix code), this would call
     *  `loadToolsForExecution` with `agent: undefined` — actions/resource-
     *  scoped tools would silently drop. */
    await capturedToolExecuteOptions.loadTools(['web'], SUBAGENT_ID);

    expect(mockLoadToolsForExecution).toHaveBeenCalledTimes(1);
    const arg = mockLoadToolsForExecution.mock.calls[0][0];
    expect(arg.agent).toBeDefined();
    expect(arg.agent.id).toBe(SUBAGENT_ID);
    expect(arg.toolRegistry).toBeInstanceOf(Map);
    expect(arg.tool_resources).toEqual({ file_search: { file_ids: ['file_1'] } });
    expect(arg.actionsEnabled).toBe(true);
  });

  it('deduplicates repeated ids in subagents.agent_ids', async () => {
    const subAgent = await createAgent({
      id: DUPLICATE_SUBAGENT_ID,
      name: 'Dup Subagent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: [],
    });
    await grantView(subAgent);

    const primaryConfig = makePrimaryConfig({
      subagents: {
        enabled: true,
        allowSelf: false,
        /** Same id three times — the backend must not load the agent
         *  repeatedly and must not emit three SubagentConfig entries. */
        agent_ids: [DUPLICATE_SUBAGENT_ID, DUPLICATE_SUBAGENT_ID, DUPLICATE_SUBAGENT_ID],
      },
    });
    const subagentConfig = makeSubagentConfig(DUPLICATE_SUBAGENT_ID);

    let initCalls = 0;
    mockInitializeAgent.mockImplementation(() => {
      initCalls += 1;
      return Promise.resolve(initCalls === 1 ? primaryConfig : subagentConfig);
    });

    await initializeClient({
      req: makeSubagentReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    /** One call for primary, one for the subagent — not four. */
    expect(mockInitializeAgent).toHaveBeenCalledTimes(2);
    expect(agentClientArgs.agent.subagentAgentConfigs).toHaveLength(1);
  });

  it('keeps an agent in `agentConfigs` when it is BOTH a handoff target and a subagent', async () => {
    /** Overlap case: the same child is used both via handoff edges (needs to
     *  be in agentConfigs) and as a subagent (needs to be in
     *  subagentAgentConfigs, and its tool context preserved). The pipeline
     *  shouldn't silently drop it from the handoff map. */
    const shared = await createAgent({
      id: HANDOFF_AND_SUB_ID,
      name: 'Shared Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: new mongoose.Types.ObjectId(),
      tools: [],
    });
    await grantView(shared);

    const edges = [{ from: PRIMARY_ID, to: HANDOFF_AND_SUB_ID, edgeType: 'handoff' }];
    const primaryConfig = makePrimaryConfig({
      edges,
      subagents: {
        enabled: true,
        allowSelf: false,
        agent_ids: [HANDOFF_AND_SUB_ID],
      },
    });
    const sharedConfig = makeSubagentConfig(HANDOFF_AND_SUB_ID);

    let call = 0;
    mockInitializeAgent.mockImplementation(() =>
      Promise.resolve(++call === 1 ? primaryConfig : sharedConfig),
    );

    await initializeClient({
      req: makeSubagentReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(agentClientArgs.agent.subagentAgentConfigs).toHaveLength(1);
    /** Shared agent must stay in agentConfigs — it's still the handoff target. */
    expect(agentClientArgs.agentConfigs.has(HANDOFF_AND_SUB_ID)).toBe(true);
  });

  it('clears subagents config on primary when the capability is disabled', async () => {
    /** Admin can turn subagents off at the endpoint level even if an agent was
     *  configured for them. The primary's `subagents` field should be
     *  suppressed so run.ts never builds a SubagentConfig. */
    const primaryConfig = makePrimaryConfig({
      subagents: { enabled: true, allowSelf: true, agent_ids: [] },
    });
    mockInitializeAgent.mockResolvedValue(primaryConfig);

    const req = makeSubagentReq();
    /** Remove the capability from the admin config. */
    req.config.endpoints.agents.capabilities = [];

    await initializeClient({
      req,
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    expect(agentClientArgs.agent.subagents).toBeUndefined();
    expect(agentClientArgs.agent.subagentAgentConfigs).toEqual([]);
  });

  it('skips subagent loading entirely when the feature is disabled on the agent', async () => {
    const primaryConfig = makePrimaryConfig({
      subagents: { enabled: false, allowSelf: true, agent_ids: [SUBAGENT_ID] },
    });
    mockInitializeAgent.mockResolvedValue(primaryConfig);

    await initializeClient({
      req: makeSubagentReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: makeEndpointOption(),
    });

    /** Only one initializeAgent call — for the primary. No subagent loaded. */
    expect(mockInitializeAgent).toHaveBeenCalledTimes(1);
    expect(agentClientArgs.agent.subagentAgentConfigs).toEqual([]);
  });
});
