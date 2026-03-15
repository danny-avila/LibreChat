const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { agentSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockGetAllServerConfigs = jest.fn();

jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({
    web_search: true,
    execute_code: true,
    file_search: true,
  }),
}));

jest.mock('~/config', () => ({
  getMCPServersRegistry: jest.fn(() => ({
    getAllServerConfigs: mockGetAllServerConfigs,
  })),
}));

jest.mock('~/models/Project', () => ({
  getProjectByName: jest.fn().mockResolvedValue(null),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/avatar', () => ({
  resizeAvatar: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3Url: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
}));

jest.mock('~/models/Action', () => ({
  updateAction: jest.fn(),
  getActions: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/models/File', () => ({
  deleteFileByFilter: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  findPubliclyAccessibleResources: jest.fn().mockResolvedValue([]),
  grantPermission: jest.fn(),
  hasPublicPermission: jest.fn().mockResolvedValue(false),
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models', () => ({
  getCategoriesWithCounts: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

const {
  filterAuthorizedTools,
  createAgent: createAgentHandler,
  updateAgent: updateAgentHandler,
  revertAgentVersion: revertAgentVersionHandler,
} = require('./v1');

const { getMCPServersRegistry } = require('~/config');

let Agent;

describe('MCP Tool Authorization', () => {
  let mongoServer;
  let mockReq;
  let mockRes;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
  }, 20000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    jest.clearAllMocks();

    getMCPServersRegistry.mockImplementation(() => ({
      getAllServerConfigs: mockGetAllServerConfigs,
    }));
    mockGetAllServerConfigs.mockResolvedValue({
      authorizedServer: { type: 'sse', url: 'https://authorized.example.com' },
      anotherServer: { type: 'sse', url: 'https://another.example.com' },
    });

    mockReq = {
      user: {
        id: new mongoose.Types.ObjectId().toString(),
        role: 'USER',
      },
      body: {},
      params: {},
      query: {},
      app: { locals: { fileStrategy: 'local' } },
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('filterAuthorizedTools', () => {
    const availableTools = { web_search: true, custom_tool: true };
    const userId = 'test-user-123';

    test('should keep authorized MCP tools and strip unauthorized ones', async () => {
      const result = await filterAuthorizedTools({
        tools: ['toolA_mcp_authorizedServer', 'toolB_mcp_forbiddenServer', 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toContain('toolA_mcp_authorizedServer');
      expect(result).toContain('web_search');
      expect(result).not.toContain('toolB_mcp_forbiddenServer');
    });

    test('should keep system tools without querying MCP registry', async () => {
      const result = await filterAuthorizedTools({
        tools: ['execute_code', 'file_search', 'web_search'],
        userId,
        availableTools: {},
      });

      expect(result).toEqual(['execute_code', 'file_search', 'web_search']);
      expect(mockGetAllServerConfigs).not.toHaveBeenCalled();
    });

    test('should not query MCP registry when no MCP tools are present', async () => {
      const result = await filterAuthorizedTools({
        tools: ['web_search', 'custom_tool'],
        userId,
        availableTools,
      });

      expect(result).toEqual(['web_search', 'custom_tool']);
      expect(mockGetAllServerConfigs).not.toHaveBeenCalled();
    });

    test('should filter all MCP tools when registry is uninitialized', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      const result = await filterAuthorizedTools({
        tools: ['toolA_mcp_someServer', 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toEqual(['web_search']);
      expect(result).not.toContain('toolA_mcp_someServer');
    });

    test('should handle mixed authorized and unauthorized MCP tools', async () => {
      const result = await filterAuthorizedTools({
        tools: [
          'web_search',
          'search_mcp_authorizedServer',
          'attack_mcp_victimServer',
          'execute_code',
          'list_mcp_anotherServer',
          'steal_mcp_nonexistent',
        ],
        userId,
        availableTools,
      });

      expect(result).toEqual([
        'web_search',
        'search_mcp_authorizedServer',
        'execute_code',
        'list_mcp_anotherServer',
      ]);
    });

    test('should handle empty tools array', async () => {
      const result = await filterAuthorizedTools({
        tools: [],
        userId,
        availableTools,
      });

      expect(result).toEqual([]);
      expect(mockGetAllServerConfigs).not.toHaveBeenCalled();
    });

    test('should handle null/undefined tool entries gracefully', async () => {
      const result = await filterAuthorizedTools({
        tools: [null, undefined, '', 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toEqual(['web_search']);
    });

    test('should call getAllServerConfigs with the correct userId', async () => {
      await filterAuthorizedTools({
        tools: ['tool_mcp_authorizedServer'],
        userId: 'specific-user-id',
        availableTools,
      });

      expect(mockGetAllServerConfigs).toHaveBeenCalledWith('specific-user-id');
    });

    test('should only call getAllServerConfigs once even with multiple MCP tools', async () => {
      await filterAuthorizedTools({
        tools: ['tool1_mcp_authorizedServer', 'tool2_mcp_anotherServer', 'tool3_mcp_unknownServer'],
        userId,
        availableTools,
      });

      expect(mockGetAllServerConfigs).toHaveBeenCalledTimes(1);
    });
  });

  describe('createAgentHandler - MCP tool authorization', () => {
    test('should strip unauthorized MCP tools on create', async () => {
      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'MCP Test Agent',
        tools: ['web_search', 'validTool_mcp_authorizedServer', 'attack_mcp_forbiddenServer'],
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const agent = mockRes.json.mock.calls[0][0];
      expect(agent.tools).toContain('web_search');
      expect(agent.tools).toContain('validTool_mcp_authorizedServer');
      expect(agent.tools).not.toContain('attack_mcp_forbiddenServer');
    });

    test('should not 500 when MCP registry is uninitialized', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'MCP Uninitialized Test',
        tools: ['tool_mcp_someServer', 'web_search'],
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const agent = mockRes.json.mock.calls[0][0];
      expect(agent.tools).toEqual(['web_search']);
    });

    test('should store mcpServerNames only for authorized servers', async () => {
      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'MCP Names Test',
        tools: ['toolA_mcp_authorizedServer', 'toolB_mcp_forbiddenServer'],
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const agent = mockRes.json.mock.calls[0][0];
      const agentInDb = await Agent.findOne({ id: agent.id });
      expect(agentInDb.mcpServerNames).toContain('authorizedServer');
      expect(agentInDb.mcpServerNames).not.toContain('forbiddenServer');
    });
  });

  describe('updateAgentHandler - MCP tool authorization', () => {
    let existingAgentId;
    let existingAgentAuthorId;

    beforeEach(async () => {
      existingAgentAuthorId = new mongoose.Types.ObjectId();
      const agent = await Agent.create({
        id: `agent_${uuidv4()}`,
        name: 'Original Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: existingAgentAuthorId,
        tools: ['web_search', 'existingTool_mcp_authorizedServer'],
        mcpServerNames: ['authorizedServer'],
        versions: [
          {
            name: 'Original Agent',
            provider: 'openai',
            model: 'gpt-4',
            tools: ['web_search', 'existingTool_mcp_authorizedServer'],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      existingAgentId = agent.id;
    });

    test('should preserve existing MCP tools even if editor lacks access', async () => {
      mockGetAllServerConfigs.mockResolvedValue({});

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', 'existingTool_mcp_authorizedServer'],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain('existingTool_mcp_authorizedServer');
      expect(updatedAgent.tools).toContain('web_search');
    });

    test('should reject newly added unauthorized MCP tools', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', 'existingTool_mcp_authorizedServer', 'attack_mcp_forbiddenServer'],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain('web_search');
      expect(updatedAgent.tools).toContain('existingTool_mcp_authorizedServer');
      expect(updatedAgent.tools).not.toContain('attack_mcp_forbiddenServer');
    });

    test('should allow adding authorized MCP tools', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', 'existingTool_mcp_authorizedServer', 'newTool_mcp_anotherServer'],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain('newTool_mcp_anotherServer');
    });

    test('should not query MCP registry when no new MCP tools added', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', 'existingTool_mcp_authorizedServer'],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockGetAllServerConfigs).not.toHaveBeenCalled();
    });
  });

  describe('revertAgentVersionHandler - MCP tool authorization', () => {
    let existingAgentId;
    let existingAgentAuthorId;

    beforeEach(async () => {
      existingAgentAuthorId = new mongoose.Types.ObjectId();
      const agent = await Agent.create({
        id: `agent_${uuidv4()}`,
        name: 'Reverted Agent V2',
        provider: 'openai',
        model: 'gpt-4',
        author: existingAgentAuthorId,
        tools: ['web_search'],
        versions: [
          {
            name: 'Reverted Agent V1',
            provider: 'openai',
            model: 'gpt-4',
            tools: ['web_search', 'oldTool_mcp_revokedServer'],
            createdAt: new Date(Date.now() - 10000),
            updatedAt: new Date(Date.now() - 10000),
          },
          {
            name: 'Reverted Agent V2',
            provider: 'openai',
            model: 'gpt-4',
            tools: ['web_search'],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      existingAgentId = agent.id;
    });

    test('should strip unauthorized MCP tools after reverting to a previous version', async () => {
      mockGetAllServerConfigs.mockResolvedValue({
        authorizedServer: { type: 'sse' },
      });

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = { version_index: 0 };

      await revertAgentVersionHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const result = mockRes.json.mock.calls[0][0];
      expect(result.tools).toContain('web_search');
      expect(result.tools).not.toContain('oldTool_mcp_revokedServer');
    });

    test('should keep authorized MCP tools after revert', async () => {
      await Agent.updateOne(
        { id: existingAgentId },
        { $set: { 'versions.0.tools': ['web_search', 'tool_mcp_authorizedServer'] } },
      );

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = { version_index: 0 };

      await revertAgentVersionHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const result = mockRes.json.mock.calls[0][0];
      expect(result.tools).toContain('web_search');
      expect(result.tools).toContain('tool_mcp_authorizedServer');
    });
  });
});
