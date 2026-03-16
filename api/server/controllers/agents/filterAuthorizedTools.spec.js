const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { Constants } = require('librechat-data-provider');
const { agentSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');

const d = Constants.mcp_delimiter;

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

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/avatar', () => ({
  resizeAvatar: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  filterFile: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn().mockResolvedValue([]),
  findPubliclyAccessibleResources: jest.fn().mockResolvedValue([]),
  grantPermission: jest.fn(),
  hasPublicPermission: jest.fn().mockResolvedValue(false),
  checkPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createModels, createMethods } = require('@librechat/data-schemas');
  createModels(mongoose);
  const methods = createMethods(mongoose);
  return {
    ...methods,
    getCategoriesWithCounts: jest.fn(),
    deleteFileByFilter: jest.fn(),
  };
});

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
  duplicateAgent: duplicateAgentHandler,
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
        tools: [`toolA${d}authorizedServer`, `toolB${d}forbiddenServer`, 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toContain(`toolA${d}authorizedServer`);
      expect(result).toContain('web_search');
      expect(result).not.toContain(`toolB${d}forbiddenServer`);
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
        tools: [`toolA${d}someServer`, 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toEqual(['web_search']);
      expect(result).not.toContain(`toolA${d}someServer`);
    });

    test('should handle mixed authorized and unauthorized MCP tools', async () => {
      const result = await filterAuthorizedTools({
        tools: [
          'web_search',
          `search${d}authorizedServer`,
          `attack${d}victimServer`,
          'execute_code',
          `list${d}anotherServer`,
          `steal${d}nonexistent`,
        ],
        userId,
        availableTools,
      });

      expect(result).toEqual([
        'web_search',
        `search${d}authorizedServer`,
        'execute_code',
        `list${d}anotherServer`,
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
        tools: [`tool${d}authorizedServer`],
        userId: 'specific-user-id',
        availableTools,
      });

      expect(mockGetAllServerConfigs).toHaveBeenCalledWith('specific-user-id');
    });

    test('should only call getAllServerConfigs once even with multiple MCP tools', async () => {
      await filterAuthorizedTools({
        tools: [`tool1${d}authorizedServer`, `tool2${d}anotherServer`, `tool3${d}unknownServer`],
        userId,
        availableTools,
      });

      expect(mockGetAllServerConfigs).toHaveBeenCalledTimes(1);
    });

    test('should preserve existing MCP tools when registry is unavailable', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      const existingTools = [`toolA${d}serverA`, `toolB${d}serverB`];

      const result = await filterAuthorizedTools({
        tools: [...existingTools, `newTool${d}unknownServer`, 'web_search'],
        userId,
        availableTools,
        existingTools,
      });

      expect(result).toContain(`toolA${d}serverA`);
      expect(result).toContain(`toolB${d}serverB`);
      expect(result).toContain('web_search');
      expect(result).not.toContain(`newTool${d}unknownServer`);
    });

    test('should still reject all MCP tools when registry is unavailable and no existingTools', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      const result = await filterAuthorizedTools({
        tools: [`toolA${d}serverA`, 'web_search'],
        userId,
        availableTools,
      });

      expect(result).toEqual(['web_search']);
    });

    test('should not preserve malformed existing tools when registry is unavailable', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      const malformedTool = `a${d}b${d}c`;
      const result = await filterAuthorizedTools({
        tools: [malformedTool, `legit${d}serverA`, 'web_search'],
        userId,
        availableTools,
        existingTools: [malformedTool, `legit${d}serverA`],
      });

      expect(result).toContain(`legit${d}serverA`);
      expect(result).toContain('web_search');
      expect(result).not.toContain(malformedTool);
    });

    test('should reject malformed MCP tool keys with multiple delimiters', async () => {
      const result = await filterAuthorizedTools({
        tools: [
          `attack${d}victimServer${d}authorizedServer`,
          `legit${d}authorizedServer`,
          `a${d}b${d}c${d}d`,
          'web_search',
        ],
        userId,
        availableTools,
      });

      expect(result).toEqual([`legit${d}authorizedServer`, 'web_search']);
      expect(result).not.toContainEqual(expect.stringContaining('victimServer'));
      expect(result).not.toContainEqual(expect.stringContaining(`a${d}b`));
    });
  });

  describe('createAgentHandler - MCP tool authorization', () => {
    test('should strip unauthorized MCP tools on create', async () => {
      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'MCP Test Agent',
        tools: ['web_search', `validTool${d}authorizedServer`, `attack${d}forbiddenServer`],
      };

      await createAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const agent = mockRes.json.mock.calls[0][0];
      expect(agent.tools).toContain('web_search');
      expect(agent.tools).toContain(`validTool${d}authorizedServer`);
      expect(agent.tools).not.toContain(`attack${d}forbiddenServer`);
    });

    test('should not 500 when MCP registry is uninitialized', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      mockReq.body = {
        provider: 'openai',
        model: 'gpt-4',
        name: 'MCP Uninitialized Test',
        tools: [`tool${d}someServer`, 'web_search'],
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
        tools: [`toolA${d}authorizedServer`, `toolB${d}forbiddenServer`],
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
        tools: ['web_search', `existingTool${d}authorizedServer`],
        mcpServerNames: ['authorizedServer'],
        versions: [
          {
            name: 'Original Agent',
            provider: 'openai',
            model: 'gpt-4',
            tools: ['web_search', `existingTool${d}authorizedServer`],
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
        tools: ['web_search', `existingTool${d}authorizedServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain(`existingTool${d}authorizedServer`);
      expect(updatedAgent.tools).toContain('web_search');
    });

    test('should reject newly added unauthorized MCP tools', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', `existingTool${d}authorizedServer`, `attack${d}forbiddenServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain('web_search');
      expect(updatedAgent.tools).toContain(`existingTool${d}authorizedServer`);
      expect(updatedAgent.tools).not.toContain(`attack${d}forbiddenServer`);
    });

    test('should allow adding authorized MCP tools', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', `existingTool${d}authorizedServer`, `newTool${d}anotherServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain(`newTool${d}anotherServer`);
    });

    test('should not query MCP registry when no new MCP tools added', async () => {
      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        tools: ['web_search', `existingTool${d}authorizedServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockGetAllServerConfigs).not.toHaveBeenCalled();
    });

    test('should preserve existing MCP tools when registry unavailable and user edits agent', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Renamed After Restart',
        tools: ['web_search', `existingTool${d}authorizedServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain(`existingTool${d}authorizedServer`);
      expect(updatedAgent.tools).toContain('web_search');
      expect(updatedAgent.name).toBe('Renamed After Restart');
    });

    test('should preserve existing MCP tools when server not in configs (disconnected)', async () => {
      mockGetAllServerConfigs.mockResolvedValue({});

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = {
        name: 'Edited While Disconnected',
        tools: ['web_search', `existingTool${d}authorizedServer`],
      };

      await updateAgentHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const updatedAgent = mockRes.json.mock.calls[0][0];
      expect(updatedAgent.tools).toContain(`existingTool${d}authorizedServer`);
      expect(updatedAgent.name).toBe('Edited While Disconnected');
    });
  });

  describe('duplicateAgentHandler - MCP tool authorization', () => {
    let sourceAgentId;
    let sourceAgentAuthorId;

    beforeEach(async () => {
      sourceAgentAuthorId = new mongoose.Types.ObjectId();
      const agent = await Agent.create({
        id: `agent_${uuidv4()}`,
        name: 'Source Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: sourceAgentAuthorId,
        tools: ['web_search', `tool${d}authorizedServer`, `tool${d}forbiddenServer`],
        mcpServerNames: ['authorizedServer', 'forbiddenServer'],
        versions: [
          {
            name: 'Source Agent',
            provider: 'openai',
            model: 'gpt-4',
            tools: ['web_search', `tool${d}authorizedServer`, `tool${d}forbiddenServer`],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      sourceAgentId = agent.id;
    });

    test('should strip unauthorized MCP tools from duplicated agent', async () => {
      mockGetAllServerConfigs.mockResolvedValue({
        authorizedServer: { type: 'sse' },
      });

      mockReq.user.id = sourceAgentAuthorId.toString();
      mockReq.params.id = sourceAgentId;

      await duplicateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const { agent: newAgent } = mockRes.json.mock.calls[0][0];
      expect(newAgent.id).not.toBe(sourceAgentId);
      expect(newAgent.tools).toContain('web_search');
      expect(newAgent.tools).toContain(`tool${d}authorizedServer`);
      expect(newAgent.tools).not.toContain(`tool${d}forbiddenServer`);

      const agentInDb = await Agent.findOne({ id: newAgent.id });
      expect(agentInDb.mcpServerNames).toContain('authorizedServer');
      expect(agentInDb.mcpServerNames).not.toContain('forbiddenServer');
    });

    test('should preserve source agent MCP tools when registry is unavailable', async () => {
      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      mockReq.user.id = sourceAgentAuthorId.toString();
      mockReq.params.id = sourceAgentId;

      await duplicateAgentHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      const { agent: newAgent } = mockRes.json.mock.calls[0][0];
      expect(newAgent.tools).toContain('web_search');
      expect(newAgent.tools).toContain(`tool${d}authorizedServer`);
      expect(newAgent.tools).toContain(`tool${d}forbiddenServer`);
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
            tools: ['web_search', `oldTool${d}revokedServer`],
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
      expect(result.tools).not.toContain(`oldTool${d}revokedServer`);

      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.tools).toContain('web_search');
      expect(agentInDb.tools).not.toContain(`oldTool${d}revokedServer`);
    });

    test('should keep authorized MCP tools after revert', async () => {
      await Agent.updateOne(
        { id: existingAgentId },
        { $set: { 'versions.0.tools': ['web_search', `tool${d}authorizedServer`] } },
      );

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = { version_index: 0 };

      await revertAgentVersionHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const result = mockRes.json.mock.calls[0][0];
      expect(result.tools).toContain('web_search');
      expect(result.tools).toContain(`tool${d}authorizedServer`);
    });

    test('should preserve version MCP tools when registry is unavailable on revert', async () => {
      await Agent.updateOne(
        { id: existingAgentId },
        {
          $set: {
            'versions.0.tools': [
              'web_search',
              `validTool${d}authorizedServer`,
              `otherTool${d}anotherServer`,
            ],
          },
        },
      );

      getMCPServersRegistry.mockImplementation(() => {
        throw new Error('MCPServersRegistry has not been initialized.');
      });

      mockReq.user.id = existingAgentAuthorId.toString();
      mockReq.params.id = existingAgentId;
      mockReq.body = { version_index: 0 };

      await revertAgentVersionHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const result = mockRes.json.mock.calls[0][0];
      expect(result.tools).toContain('web_search');
      expect(result.tools).toContain(`validTool${d}authorizedServer`);
      expect(result.tools).toContain(`otherTool${d}anotherServer`);

      const agentInDb = await Agent.findOne({ id: existingAgentId });
      expect(agentInDb.tools).toContain(`validTool${d}authorizedServer`);
      expect(agentInDb.tools).toContain(`otherTool${d}anotherServer`);
    });
  });
});
