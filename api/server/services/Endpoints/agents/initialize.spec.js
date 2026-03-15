const mongoose = require('mongoose');
const { ResourceType, PermissionBits } = require('librechat-data-provider');

jest.mock('@librechat/agents', () => ({
  createContentAggregator: jest.fn(() => ({
    contentParts: [],
    aggregateContent: jest.fn(),
  })),
}));

const mockInitializeAgent = jest.fn();
const mockValidateAgentModel = jest.fn();

jest.mock('@librechat/api', () => {
  const actual = jest.requireActual('@librechat/api');
  return {
    ...actual,
    initializeAgent: (...args) => mockInitializeAgent(...args),
    validateAgentModel: (...args) => mockValidateAgentModel(...args),
    GenerationJobManager: { setCollectedUsage: jest.fn() },
    getCustomEndpointConfig: jest.fn(),
  };
});

jest.mock('~/server/controllers/agents/callbacks', () => ({
  createToolEndCallback: jest.fn(() => jest.fn()),
  getDefaultHandlers: jest.fn(() => ({})),
}));

jest.mock('~/server/services/ToolService', () => ({
  loadAgentTools: jest.fn(),
  loadToolsForExecution: jest.fn(),
}));

jest.mock('~/server/controllers/ModelController', () => ({
  getModelsConfig: jest.fn().mockResolvedValue({}),
}));

const mockCheckPermission = jest.fn();
jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: (...args) => mockCheckPermission(...args),
}));

let agentClientArgs;
jest.mock('~/server/controllers/agents/client', () => {
  return jest.fn().mockImplementation((args) => {
    agentClientArgs = args;
    return {};
  });
});

jest.mock('~/models/Conversation', () => ({
  getConvoFiles: jest.fn(),
}));

jest.mock('./addedConvo', () => ({
  processAddedConvo: jest.fn().mockResolvedValue({ userMCPAuthMap: undefined }),
}));

const mockGetAgent = jest.fn();
jest.mock('~/models/Agent', () => ({
  getAgent: (...args) => mockGetAgent(...args),
}));

jest.mock('~/cache', () => ({
  logViolation: jest.fn(),
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn(),
  getUserKey: jest.fn(),
  getMessages: jest.fn(),
  updateFilesUsage: jest.fn(),
  getUserCodeFiles: jest.fn(),
  getUserKeyValues: jest.fn(),
  getToolFilesByIds: jest.fn(),
  getCodeGeneratedFiles: jest.fn(),
}));

const { initializeClient } = require('./initialize');

const PRIMARY_ID = 'agent_primary';
const TARGET_ID = 'agent_target';
const AUTHORIZED_ID = 'agent_authorized';

const targetObjectId = new mongoose.Types.ObjectId();
const authorizedObjectId = new mongoose.Types.ObjectId();

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

const baseReq = () => ({
  user: { id: 'user_1', role: 'USER' },
  body: { conversationId: 'conv_1', files: [] },
  config: { endpoints: {} },
  _resumableStreamId: null,
});

const baseEndpointOption = () => ({
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

describe('initializeClient — processAgent ACL gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    agentClientArgs = undefined;
    mockValidateAgentModel.mockResolvedValue({ isValid: true });
  });

  it('should skip handoff agent and filter its edge when user lacks VIEW access', async () => {
    const edges = [{ from: PRIMARY_ID, to: TARGET_ID, edgeType: 'handoff' }];

    mockInitializeAgent.mockResolvedValue(makePrimaryConfig(edges));

    mockGetAgent.mockImplementation(({ id }) => {
      if (id === TARGET_ID) {
        return Promise.resolve({
          _id: targetObjectId,
          id: TARGET_ID,
          name: 'Target',
          provider: 'openai',
          model: 'gpt-4',
          tools: [],
        });
      }
      return Promise.resolve(null);
    });

    mockCheckPermission.mockResolvedValue(false);

    await initializeClient({
      req: baseReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: baseEndpointOption(),
    });

    expect(mockCheckPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user_1',
        role: 'USER',
        resourceType: ResourceType.AGENT,
        resourceId: targetObjectId,
        requiredPermission: PermissionBits.VIEW,
      }),
    );

    expect(mockInitializeAgent).toHaveBeenCalledTimes(1);

    expect(agentClientArgs.agent.edges).toEqual([]);
  });

  it('should initialize handoff agent and keep its edge when user has VIEW access', async () => {
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
      if (callCount === 1) {
        return Promise.resolve(makePrimaryConfig(edges));
      }
      return Promise.resolve(handoffConfig);
    });

    mockGetAgent.mockImplementation(({ id }) => {
      if (id === AUTHORIZED_ID) {
        return Promise.resolve({
          _id: authorizedObjectId,
          id: AUTHORIZED_ID,
          name: 'Authorized',
          provider: 'openai',
          model: 'gpt-4',
          tools: [],
        });
      }
      return Promise.resolve(null);
    });

    mockCheckPermission.mockResolvedValue(true);

    await initializeClient({
      req: baseReq(),
      res: {},
      signal: new AbortController().signal,
      endpointOption: baseEndpointOption(),
    });

    expect(mockInitializeAgent).toHaveBeenCalledTimes(2);

    expect(agentClientArgs.agent.edges).toHaveLength(1);
    expect(agentClientArgs.agent.edges[0].to).toBe(AUTHORIZED_ID);
  });
});
