const { ResourceType, PermissionBits } = require('librechat-data-provider');

const mockCheckPermission = jest.fn();
jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: (...args) => mockCheckPermission(...args),
}));

const mockInitializeAgent = jest.fn();
const mockValidateAgentModel = jest.fn();
jest.mock('@librechat/api', () => ({
  initializeAgent: (...args) => mockInitializeAgent(...args),
  validateAgentModel: (...args) => mockValidateAgentModel(...args),
  getCustomEndpointConfig: jest.fn(),
}));

const mockLoadAddedAgent = jest.fn();
jest.mock('~/models/loadAddedAgent', () => ({
  loadAddedAgent: (...args) => mockLoadAddedAgent(...args),
  setGetAgent: jest.fn(),
  ADDED_AGENT_ID: 'added_agent',
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn(),
}));

jest.mock('~/models/Conversation', () => ({
  getConvoFiles: jest.fn(),
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

const { processAddedConvo } = require('./addedConvo');

const baseParams = () => ({
  req: { user: { id: 'user_1', role: 'USER' } },
  res: {},
  endpointOption: {},
  modelsConfig: {},
  logViolation: jest.fn(),
  loadTools: jest.fn(),
  requestFiles: [],
  conversationId: 'conv_1',
  allowedProviders: new Set(),
  agentConfigs: new Map(),
  primaryAgentId: 'agent_primary',
  primaryAgent: { id: 'agent_primary', tools: [] },
  userMCPAuthMap: undefined,
});

describe('processAddedConvo ACL gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip agent when user lacks VIEW access', async () => {
    mockLoadAddedAgent.mockResolvedValue({
      _id: 'mongo_obj_id_123',
      id: 'agent_target_1',
      tools: [],
      provider: 'openai',
      model: 'gpt-4',
    });
    mockCheckPermission.mockResolvedValue(false);

    const params = baseParams();
    params.endpointOption.addedConvo = {
      agent_id: 'agent_target',
      model: 'gpt-4',
      endpoint: 'openai',
    };

    const result = await processAddedConvo(params);

    expect(result).toEqual({ userMCPAuthMap: undefined });
    expect(mockCheckPermission).toHaveBeenCalledWith({
      userId: 'user_1',
      role: 'USER',
      resourceType: ResourceType.AGENT,
      resourceId: 'mongo_obj_id_123',
      requiredPermission: PermissionBits.VIEW,
    });
    expect(mockInitializeAgent).not.toHaveBeenCalled();
  });

  it('should proceed when user has VIEW access', async () => {
    mockLoadAddedAgent.mockResolvedValue({
      _id: 'mongo_obj_id_123',
      id: 'agent_target_1',
      tools: [],
      provider: 'openai',
      model: 'gpt-4',
    });
    mockCheckPermission.mockResolvedValue(true);
    mockValidateAgentModel.mockResolvedValue({ isValid: true });
    mockInitializeAgent.mockResolvedValue({
      id: 'agent_target_1_1',
      userMCPAuthMap: null,
    });

    const params = baseParams();
    params.endpointOption.addedConvo = {
      agent_id: 'agent_target',
      model: 'gpt-4',
      endpoint: 'openai',
    };

    await processAddedConvo(params);

    expect(mockCheckPermission).toHaveBeenCalled();
    expect(mockValidateAgentModel).toHaveBeenCalled();
    expect(mockInitializeAgent).toHaveBeenCalled();
  });

  it('should bypass ACL check for ephemeral agents (no _id)', async () => {
    mockLoadAddedAgent.mockResolvedValue({
      id: 'ephemeral_id',
      tools: [],
      provider: 'openai',
      model: 'gpt-4',
    });
    mockValidateAgentModel.mockResolvedValue({ isValid: true });
    mockInitializeAgent.mockResolvedValue({
      id: 'ephemeral_id',
      userMCPAuthMap: null,
    });

    const params = baseParams();
    params.endpointOption.addedConvo = {
      model: 'gpt-4',
      endpoint: 'openai',
    };

    await processAddedConvo(params);

    expect(mockCheckPermission).not.toHaveBeenCalled();
  });
});
