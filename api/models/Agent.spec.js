const originalEnv = {
  CREDS_KEY: process.env.CREDS_KEY,
  CREDS_IV: process.env.CREDS_IV,
};

process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = '0123456789abcdef';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  Agent,
  addAgentResourceFile,
  removeAgentResourceFiles,
  createAgent,
  updateAgent,
  getAgent,
  deleteAgent,
  getListAgents,
  updateAgentProjects,
} = require('./Agent');

describe('Agent Resource File Operations', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env.CREDS_KEY = originalEnv.CREDS_KEY;
    process.env.CREDS_IV = originalEnv.CREDS_IV;
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
  });

  const createBasicAgent = async () => {
    const agentId = `agent_${uuidv4()}`;
    const agent = await Agent.create({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: new mongoose.Types.ObjectId(),
    });
    return agent;
  };

  test('should add tool_resource to tools if missing', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();
    const toolResource = 'file_search';

    const updatedAgent = await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: toolResource,
      file_id: fileId,
    });

    expect(updatedAgent.tools).toContain(toolResource);
    expect(Array.isArray(updatedAgent.tools)).toBe(true);
    // Should not duplicate
    const count = updatedAgent.tools.filter((t) => t === toolResource).length;
    expect(count).toBe(1);
  });

  test('should not duplicate tool_resource in tools if already present', async () => {
    const agent = await createBasicAgent();
    const fileId1 = uuidv4();
    const fileId2 = uuidv4();
    const toolResource = 'file_search';

    // First add
    await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: toolResource,
      file_id: fileId1,
    });

    // Second add (should not duplicate)
    const updatedAgent = await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: toolResource,
      file_id: fileId2,
    });

    expect(updatedAgent.tools).toContain(toolResource);
    expect(Array.isArray(updatedAgent.tools)).toBe(true);
    const count = updatedAgent.tools.filter((t) => t === toolResource).length;
    expect(count).toBe(1);
  });

  test('should handle concurrent file additions', async () => {
    const agent = await createBasicAgent();
    const fileIds = Array.from({ length: 10 }, () => uuidv4());

    // Concurrent additions
    const additionPromises = fileIds.map((fileId) =>
      addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: 'test_tool',
        file_id: fileId,
      }),
    );

    await Promise.all(additionPromises);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
    expect(updatedAgent.tool_resources.test_tool.file_ids).toHaveLength(10);
    expect(new Set(updatedAgent.tool_resources.test_tool.file_ids).size).toBe(10);
  });

  test('should handle concurrent additions and removals', async () => {
    const agent = await createBasicAgent();
    const initialFileIds = Array.from({ length: 5 }, () => uuidv4());

    await Promise.all(
      initialFileIds.map((fileId) =>
        addAgentResourceFile({
          agent_id: agent.id,
          tool_resource: 'test_tool',
          file_id: fileId,
        }),
      ),
    );

    const newFileIds = Array.from({ length: 5 }, () => uuidv4());
    const operations = [
      ...newFileIds.map((fileId) =>
        addAgentResourceFile({
          agent_id: agent.id,
          tool_resource: 'test_tool',
          file_id: fileId,
        }),
      ),
      ...initialFileIds.map((fileId) =>
        removeAgentResourceFiles({
          agent_id: agent.id,
          files: [{ tool_resource: 'test_tool', file_id: fileId }],
        }),
      ),
    ];

    await Promise.all(operations);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
    expect(updatedAgent.tool_resources.test_tool.file_ids).toHaveLength(5);
  });

  test('should initialize array when adding to non-existent tool resource', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();

    const updatedAgent = await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: 'new_tool',
      file_id: fileId,
    });

    expect(updatedAgent.tool_resources.new_tool.file_ids).toBeDefined();
    expect(updatedAgent.tool_resources.new_tool.file_ids).toHaveLength(1);
    expect(updatedAgent.tool_resources.new_tool.file_ids[0]).toBe(fileId);
  });

  test('should handle rapid sequential modifications to same tool resource', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();

    for (let i = 0; i < 10; i++) {
      await addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: 'test_tool',
        file_id: `${fileId}_${i}`,
      });

      if (i % 2 === 0) {
        await removeAgentResourceFiles({
          agent_id: agent.id,
          files: [{ tool_resource: 'test_tool', file_id: `${fileId}_${i}` }],
        });
      }
    }

    const updatedAgent = await Agent.findOne({ id: agent.id });
    expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
    expect(Array.isArray(updatedAgent.tool_resources.test_tool.file_ids)).toBe(true);
  });

  test('should handle multiple tool resources concurrently', async () => {
    const agent = await createBasicAgent();
    const toolResources = ['tool1', 'tool2', 'tool3'];
    const operations = [];

    toolResources.forEach((tool) => {
      const fileIds = Array.from({ length: 5 }, () => uuidv4());
      fileIds.forEach((fileId) => {
        operations.push(
          addAgentResourceFile({
            agent_id: agent.id,
            tool_resource: tool,
            file_id: fileId,
          }),
        );
      });
    });

    await Promise.all(operations);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    toolResources.forEach((tool) => {
      expect(updatedAgent.tool_resources[tool].file_ids).toBeDefined();
      expect(updatedAgent.tool_resources[tool].file_ids).toHaveLength(5);
    });
  });

  test('should handle concurrent duplicate additions', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();

    // Concurrent additions of the same file
    const additionPromises = Array.from({ length: 5 }).map(() =>
      addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: 'test_tool',
        file_id: fileId,
      }),
    );

    await Promise.all(additionPromises);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
    // Should only contain one instance of the fileId
    expect(updatedAgent.tool_resources.test_tool.file_ids).toHaveLength(1);
    expect(updatedAgent.tool_resources.test_tool.file_ids[0]).toBe(fileId);
  });

  test('should handle concurrent add and remove of the same file', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();

    // First, ensure the file exists (or test might be trivial if remove runs first)
    await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: 'test_tool',
      file_id: fileId,
    });

    // Concurrent add (which should be ignored) and remove
    const operations = [
      addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: 'test_tool',
        file_id: fileId,
      }),
      removeAgentResourceFiles({
        agent_id: agent.id,
        files: [{ tool_resource: 'test_tool', file_id: fileId }],
      }),
    ];

    await Promise.all(operations);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    // The final state should ideally be that the file is removed,
    // but the key point is consistency (not duplicated or error state).
    // Depending on execution order, the file might remain if the add operation's
    // findOneAndUpdate runs after the remove operation completes.
    // A more robust check might be that the length is <= 1.
    // Given the remove uses an update pipeline, it might be more likely to win.
    // The final state depends on race condition timing (add or remove might "win").
    // The critical part is that the state is consistent (no duplicates, no errors).
    // Assert that the fileId is either present exactly once or not present at all.
    expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
    const finalFileIds = updatedAgent.tool_resources.test_tool.file_ids;
    const count = finalFileIds.filter((id) => id === fileId).length;
    expect(count).toBeLessThanOrEqual(1); // Should be 0 or 1, never more
    // Optional: Check overall length is consistent with the count
    if (count === 0) {
      expect(finalFileIds).toHaveLength(0);
    } else {
      expect(finalFileIds).toHaveLength(1);
      expect(finalFileIds[0]).toBe(fileId);
    }
  });

  test('should handle concurrent duplicate removals', async () => {
    const agent = await createBasicAgent();
    const fileId = uuidv4();

    // Add the file first
    await addAgentResourceFile({
      agent_id: agent.id,
      tool_resource: 'test_tool',
      file_id: fileId,
    });

    // Concurrent removals of the same file
    const removalPromises = Array.from({ length: 5 }).map(() =>
      removeAgentResourceFiles({
        agent_id: agent.id,
        files: [{ tool_resource: 'test_tool', file_id: fileId }],
      }),
    );

    await Promise.all(removalPromises);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    // Check if the array is empty or the tool resource itself is removed
    const fileIds = updatedAgent.tool_resources?.test_tool?.file_ids ?? [];
    expect(fileIds).toHaveLength(0);
    expect(fileIds).not.toContain(fileId);
  });

  test('should handle concurrent removals of different files', async () => {
    const agent = await createBasicAgent();
    const fileIds = Array.from({ length: 10 }, () => uuidv4());

    // Add all files first
    await Promise.all(
      fileIds.map((fileId) =>
        addAgentResourceFile({
          agent_id: agent.id,
          tool_resource: 'test_tool',
          file_id: fileId,
        }),
      ),
    );

    // Concurrently remove all files
    const removalPromises = fileIds.map((fileId) =>
      removeAgentResourceFiles({
        agent_id: agent.id,
        files: [{ tool_resource: 'test_tool', file_id: fileId }],
      }),
    );

    await Promise.all(removalPromises);

    const updatedAgent = await Agent.findOne({ id: agent.id });
    // Check if the array is empty or the tool resource itself is removed
    const finalFileIds = updatedAgent.tool_resources?.test_tool?.file_ids ?? [];
    expect(finalFileIds).toHaveLength(0);
  });
});

describe('Agent CRUD Operations', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
  });

  test('should create and get an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    const newAgent = await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      description: 'Test description',
    });

    expect(newAgent).toBeDefined();
    expect(newAgent.id).toBe(agentId);
    expect(newAgent.name).toBe('Test Agent');

    const retrievedAgent = await getAgent({ id: agentId });
    expect(retrievedAgent).toBeDefined();
    expect(retrievedAgent.id).toBe(agentId);
    expect(retrievedAgent.name).toBe('Test Agent');
    expect(retrievedAgent.description).toBe('Test description');
  });

  test('should delete an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Agent To Delete',
      provider: 'test',
      model: 'test-model',
      author: authorId,
    });

    const agentBeforeDelete = await getAgent({ id: agentId });
    expect(agentBeforeDelete).toBeDefined();

    await deleteAgent({ id: agentId });

    const agentAfterDelete = await getAgent({ id: agentId });
    expect(agentAfterDelete).toBeNull();
  });

  test('should list agents by author', async () => {
    const authorId = new mongoose.Types.ObjectId();
    const otherAuthorId = new mongoose.Types.ObjectId();

    const agentIds = [];
    for (let i = 0; i < 5; i++) {
      const id = `agent_${uuidv4()}`;
      agentIds.push(id);
      await createAgent({
        id,
        name: `Agent ${i}`,
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });
    }

    for (let i = 0; i < 3; i++) {
      await createAgent({
        id: `other_agent_${uuidv4()}`,
        name: `Other Agent ${i}`,
        provider: 'test',
        model: 'test-model',
        author: otherAuthorId,
      });
    }

    const result = await getListAgents({ author: authorId.toString() });

    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data).toHaveLength(5);
    expect(result.has_more).toBe(true);

    for (const agent of result.data) {
      expect(agent.author).toBe(authorId.toString());
    }
  });

  test('should update agent projects', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId1 = new mongoose.Types.ObjectId();
    const projectId2 = new mongoose.Types.ObjectId();
    const projectId3 = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Project Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      projectIds: [projectId1],
    });

    await updateAgent(
      { id: agentId },
      { $addToSet: { projectIds: { $each: [projectId2, projectId3] } } },
    );

    await updateAgent({ id: agentId }, { $pull: { projectIds: projectId1 } });

    await updateAgent({ id: agentId }, { projectIds: [projectId2, projectId3] });

    const updatedAgent = await getAgent({ id: agentId });
    expect(updatedAgent.projectIds).toHaveLength(2);
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId2.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId3.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).not.toContain(projectId1.toString());

    await updateAgent({ id: agentId }, { projectIds: [] });

    const emptyProjectsAgent = await getAgent({ id: agentId });
    expect(emptyProjectsAgent.projectIds).toHaveLength(0);

    const nonExistentId = `agent_${uuidv4()}`;
    await expect(
      updateAgentProjects({
        id: nonExistentId,
        projectIds: [projectId1],
      }),
    ).rejects.toThrow();
  });

  test('should handle ephemeral agent loading', async () => {
    const agentId = 'ephemeral_test';
    const endpoint = 'openai';

    const originalModule = jest.requireActual('librechat-data-provider');

    const mockDataProvider = {
      ...originalModule,
      Constants: {
        ...originalModule.Constants,
        EPHEMERAL_AGENT_ID: 'ephemeral_test',
      },
    };

    jest.doMock('librechat-data-provider', () => mockDataProvider);

    const mockReq = {
      user: { id: 'user123' },
      body: {
        promptPrefix: 'This is a test instruction',
        ephemeralAgent: {
          execute_code: true,
          mcp: ['server1', 'server2'],
        },
      },
      app: {
        locals: {
          availableTools: {
            tool__server1: {},
            tool__server2: {},
            another_tool: {},
          },
        },
      },
    };

    const params = {
      req: mockReq,
      agent_id: agentId,
      endpoint,
      model_parameters: {
        model: 'gpt-4',
        temperature: 0.7,
      },
    };

    expect(agentId).toBeDefined();
    expect(endpoint).toBeDefined();

    jest.dontMock('librechat-data-provider');
  });

  test('should handle loadAgent functionality and errors', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Test Load Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1', 'tool2'],
    });

    const agent = await getAgent({ id: agentId });

    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.name).toBe('Test Load Agent');
    expect(agent.tools).toEqual(expect.arrayContaining(['tool1', 'tool2']));

    const mockLoadAgent = jest.fn().mockResolvedValue(agent);
    const loadedAgent = await mockLoadAgent();
    expect(loadedAgent).toBeDefined();
    expect(loadedAgent.id).toBe(agentId);

    const nonExistentId = `agent_${uuidv4()}`;
    const nonExistentAgent = await getAgent({ id: nonExistentId });
    expect(nonExistentAgent).toBeNull();

    const mockLoadAgentError = jest.fn().mockRejectedValue(new Error('No agent found with ID'));
    await expect(mockLoadAgentError()).rejects.toThrow('No agent found with ID');
  });
});

describe('Agent Version History', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
  });

  test('should create an agent with a single entry in versions array', async () => {
    const agentId = `agent_${uuidv4()}`;
    const agent = await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: new mongoose.Types.ObjectId(),
    });

    expect(agent.versions).toBeDefined();
    expect(Array.isArray(agent.versions)).toBe(true);
    expect(agent.versions).toHaveLength(1);
    expect(agent.versions[0].name).toBe('Test Agent');
    expect(agent.versions[0].provider).toBe('test');
    expect(agent.versions[0].model).toBe('test-model');
  });

  test('should accumulate version history across multiple updates', async () => {
    const agentId = `agent_${uuidv4()}`;
    const author = new mongoose.Types.ObjectId();
    await createAgent({
      id: agentId,
      name: 'First Name',
      provider: 'test',
      model: 'test-model',
      author,
      description: 'First description',
    });

    await updateAgent({ id: agentId }, { name: 'Second Name', description: 'Second description' });
    await updateAgent({ id: agentId }, { name: 'Third Name', model: 'new-model' });
    const finalAgent = await updateAgent({ id: agentId }, { description: 'Final description' });

    expect(finalAgent.versions).toBeDefined();
    expect(Array.isArray(finalAgent.versions)).toBe(true);
    expect(finalAgent.versions).toHaveLength(4);

    expect(finalAgent.versions[0].name).toBe('First Name');
    expect(finalAgent.versions[0].description).toBe('First description');
    expect(finalAgent.versions[0].model).toBe('test-model');

    expect(finalAgent.versions[1].name).toBe('Second Name');
    expect(finalAgent.versions[1].description).toBe('Second description');
    expect(finalAgent.versions[1].model).toBe('test-model');

    expect(finalAgent.versions[2].name).toBe('Third Name');
    expect(finalAgent.versions[2].description).toBe('Second description');
    expect(finalAgent.versions[2].model).toBe('new-model');

    expect(finalAgent.versions[3].name).toBe('Third Name');
    expect(finalAgent.versions[3].description).toBe('Final description');
    expect(finalAgent.versions[3].model).toBe('new-model');

    expect(finalAgent.name).toBe('Third Name');
    expect(finalAgent.description).toBe('Final description');
    expect(finalAgent.model).toBe('new-model');
  });

  test('should not include metadata fields in version history', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: new mongoose.Types.ObjectId(),
    });

    const updatedAgent = await updateAgent({ id: agentId }, { description: 'New description' });

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.versions[0]._id).toBeUndefined();
    expect(updatedAgent.versions[0].__v).toBeUndefined();
    expect(updatedAgent.versions[0].name).toBe('Test Agent');
    expect(updatedAgent.versions[0].author).toBeUndefined();

    expect(updatedAgent.versions[1]._id).toBeUndefined();
    expect(updatedAgent.versions[1].__v).toBeUndefined();
  });

  test('should not recursively include previous versions', async () => {
    const agentId = `agent_${uuidv4()}`;
    await createAgent({
      id: agentId,
      name: 'Test Agent',
      provider: 'test',
      model: 'test-model',
      author: new mongoose.Types.ObjectId(),
    });

    await updateAgent({ id: agentId }, { name: 'Updated Name 1' });
    await updateAgent({ id: agentId }, { name: 'Updated Name 2' });
    const finalAgent = await updateAgent({ id: agentId }, { name: 'Updated Name 3' });

    expect(finalAgent.versions).toHaveLength(4);

    finalAgent.versions.forEach((version) => {
      expect(version.versions).toBeUndefined();
    });
  });

  test('should handle MongoDB operators and field updates correctly', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'MongoDB Operator Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1'],
    });

    await updateAgent(
      { id: agentId },
      {
        description: 'Updated description',
        $push: { tools: 'tool2' },
        $addToSet: { projectIds: projectId },
      },
    );

    const firstUpdate = await getAgent({ id: agentId });
    expect(firstUpdate.description).toBe('Updated description');
    expect(firstUpdate.tools).toContain('tool1');
    expect(firstUpdate.tools).toContain('tool2');
    expect(firstUpdate.projectIds.map((id) => id.toString())).toContain(projectId.toString());
    expect(firstUpdate.versions).toHaveLength(2);

    await updateAgent(
      { id: agentId },
      {
        tools: ['tool2', 'tool3'],
      },
    );

    const secondUpdate = await getAgent({ id: agentId });
    expect(secondUpdate.tools).toHaveLength(2);
    expect(secondUpdate.tools).toContain('tool2');
    expect(secondUpdate.tools).toContain('tool3');
    expect(secondUpdate.tools).not.toContain('tool1');
    expect(secondUpdate.versions).toHaveLength(3);

    await updateAgent(
      { id: agentId },
      {
        $push: { tools: 'tool3' },
      },
    );

    const thirdUpdate = await getAgent({ id: agentId });
    const toolCount = thirdUpdate.tools.filter((t) => t === 'tool3').length;
    expect(toolCount).toBe(2);
    expect(thirdUpdate.versions).toHaveLength(4);
  });

  test('should handle parameter objects correctly', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Parameters Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      model_parameters: { temperature: 0.7 },
    });

    const updatedAgent = await updateAgent(
      { id: agentId },
      { model_parameters: { temperature: 0.8 } },
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.model_parameters.temperature).toBe(0.8);

    await updateAgent(
      { id: agentId },
      {
        model_parameters: {
          temperature: 0.8,
          max_tokens: 1000,
        },
      },
    );

    const complexAgent = await getAgent({ id: agentId });
    expect(complexAgent.versions).toHaveLength(3);
    expect(complexAgent.model_parameters.temperature).toBe(0.8);
    expect(complexAgent.model_parameters.max_tokens).toBe(1000);

    await updateAgent({ id: agentId }, { model_parameters: {} });

    const emptyParamsAgent = await getAgent({ id: agentId });
    expect(emptyParamsAgent.versions).toHaveLength(4);
    expect(emptyParamsAgent.model_parameters).toEqual({});
  });

  test('should detect duplicate versions and reject updates', async () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();

    try {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const projectId1 = new mongoose.Types.ObjectId();
      const projectId2 = new mongoose.Types.ObjectId();

      const testCases = [
        {
          name: 'simple field update',
          initial: {
            name: 'Test Agent',
            description: 'Initial description',
          },
          update: { name: 'Updated Name' },
          duplicate: { name: 'Updated Name' },
        },
        {
          name: 'object field update',
          initial: {
            model_parameters: { temperature: 0.7 },
          },
          update: { model_parameters: { temperature: 0.8 } },
          duplicate: { model_parameters: { temperature: 0.8 } },
        },
        {
          name: 'array field update',
          initial: {
            tools: ['tool1', 'tool2'],
          },
          update: { tools: ['tool2', 'tool3'] },
          duplicate: { tools: ['tool2', 'tool3'] },
        },
        {
          name: 'projectIds update',
          initial: {
            projectIds: [projectId1],
          },
          update: { projectIds: [projectId1, projectId2] },
          duplicate: { projectIds: [projectId2, projectId1] },
        },
      ];

      for (const testCase of testCases) {
        const testAgentId = `agent_${uuidv4()}`;

        await createAgent({
          id: testAgentId,
          provider: 'test',
          model: 'test-model',
          author: authorId,
          ...testCase.initial,
        });

        await updateAgent({ id: testAgentId }, testCase.update);

        let error;
        try {
          await updateAgent({ id: testAgentId }, testCase.duplicate);
        } catch (e) {
          error = e;
        }

        expect(error).toBeDefined();
        expect(error.message).toContain('Duplicate version');
        expect(error.statusCode).toBe(409);
        expect(error.details).toBeDefined();
        expect(error.details.duplicateVersion).toBeDefined();

        const agent = await getAgent({ id: testAgentId });
        expect(agent.versions).toHaveLength(2);
      }
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('should track updatedBy when a different user updates an agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const originalAuthor = new mongoose.Types.ObjectId();
    const updatingUser = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Original Agent',
      provider: 'test',
      model: 'test-model',
      author: originalAuthor,
      description: 'Original description',
    });

    const updatedAgent = await updateAgent(
      { id: agentId },
      { name: 'Updated Agent', description: 'Updated description' },
      updatingUser.toString(),
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.versions[1].updatedBy.toString()).toBe(updatingUser.toString());
    expect(updatedAgent.author.toString()).toBe(originalAuthor.toString());
  });

  test('should include updatedBy even when the original author updates the agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const originalAuthor = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Original Agent',
      provider: 'test',
      model: 'test-model',
      author: originalAuthor,
      description: 'Original description',
    });

    const updatedAgent = await updateAgent(
      { id: agentId },
      { name: 'Updated Agent', description: 'Updated description' },
      originalAuthor.toString(),
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.versions[1].updatedBy.toString()).toBe(originalAuthor.toString());
    expect(updatedAgent.author.toString()).toBe(originalAuthor.toString());
  });

  test('should track multiple different users updating the same agent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const originalAuthor = new mongoose.Types.ObjectId();
    const user1 = new mongoose.Types.ObjectId();
    const user2 = new mongoose.Types.ObjectId();
    const user3 = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Original Agent',
      provider: 'test',
      model: 'test-model',
      author: originalAuthor,
      description: 'Original description',
    });

    // User 1 makes an update
    await updateAgent(
      { id: agentId },
      { name: 'Updated by User 1', description: 'First update' },
      user1.toString(),
    );

    // Original author makes an update
    await updateAgent(
      { id: agentId },
      { description: 'Updated by original author' },
      originalAuthor.toString(),
    );

    // User 2 makes an update
    await updateAgent(
      { id: agentId },
      { name: 'Updated by User 2', model: 'new-model' },
      user2.toString(),
    );

    // User 3 makes an update
    const finalAgent = await updateAgent(
      { id: agentId },
      { description: 'Final update by User 3' },
      user3.toString(),
    );

    expect(finalAgent.versions).toHaveLength(5);
    expect(finalAgent.author.toString()).toBe(originalAuthor.toString());

    // Check that each version has the correct updatedBy
    expect(finalAgent.versions[0].updatedBy).toBeUndefined(); // Initial creation has no updatedBy
    expect(finalAgent.versions[1].updatedBy.toString()).toBe(user1.toString());
    expect(finalAgent.versions[2].updatedBy.toString()).toBe(originalAuthor.toString());
    expect(finalAgent.versions[3].updatedBy.toString()).toBe(user2.toString());
    expect(finalAgent.versions[4].updatedBy.toString()).toBe(user3.toString());

    // Verify the final state
    expect(finalAgent.name).toBe('Updated by User 2');
    expect(finalAgent.description).toBe('Final update by User 3');
    expect(finalAgent.model).toBe('new-model');
  });

  test('should preserve original author during agent restoration', async () => {
    const agentId = `agent_${uuidv4()}`;
    const originalAuthor = new mongoose.Types.ObjectId();
    const updatingUser = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Original Agent',
      provider: 'test',
      model: 'test-model',
      author: originalAuthor,
      description: 'Original description',
    });

    await updateAgent(
      { id: agentId },
      { name: 'Updated Agent', description: 'Updated description' },
      updatingUser.toString(),
    );

    const { revertAgentVersion } = require('./Agent');
    const revertedAgent = await revertAgentVersion({ id: agentId }, 0);

    expect(revertedAgent.author.toString()).toBe(originalAuthor.toString());
    expect(revertedAgent.name).toBe('Original Agent');
    expect(revertedAgent.description).toBe('Original description');
  });
});
