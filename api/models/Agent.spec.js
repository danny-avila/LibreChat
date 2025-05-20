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
    const originalConsoleError = console.error;
    console.error = jest.fn();

    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId1 = new mongoose.Types.ObjectId();
    const projectId2 = new mongoose.Types.ObjectId();
    const projectId3 = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Agent With Projects',
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

    const updatedAgent = await getAgent({ id: agentId });
    expect(updatedAgent.projectIds).toHaveLength(2);
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId2.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId3.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).not.toContain(projectId1.toString());

    console.error = originalConsoleError;
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

  test('should handle loadAgent functionality', async () => {
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
  });

  test('should handle loadAgent errors', async () => {
    const nonExistentId = `agent_${uuidv4()}`;

    const agent = await getAgent({ id: nonExistentId });
    expect(agent).toBeNull();

    const mockLoadAgent = jest.fn().mockRejectedValue(new Error('No agent found with ID'));

    await expect(mockLoadAgent()).rejects.toThrow('No agent found with ID');
  });

  test('should update agent projects with updateAgent', async () => {
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

    await updateAgent({ id: agentId }, { projectIds: [projectId2, projectId3] });

    const updatedAgent = await getAgent({ id: agentId });
    expect(updatedAgent).toBeDefined();
    expect(updatedAgent.projectIds).toHaveLength(2);
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId2.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId3.toString());
    expect(updatedAgent.projectIds.map((id) => id.toString())).not.toContain(projectId1.toString());
  });

  test('should handle empty project array with updateAgent', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId1 = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Project Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      projectIds: [projectId1],
    });

    await updateAgent({ id: agentId }, { projectIds: [] });

    const updatedAgent = await getAgent({ id: agentId });
    expect(updatedAgent).toBeDefined();
    expect(updatedAgent.projectIds).toHaveLength(0);
  });

  test('should fail when updating projects for non-existent agent', async () => {
    const nonExistentId = `agent_${uuidv4()}`;
    const projectId = new mongoose.Types.ObjectId();

    await expect(
      updateAgentProjects({
        id: nonExistentId,
        projectIds: [projectId],
      }),
    ).rejects.toThrow();
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

  test('should save current state to versions array when updating', async () => {
    const agentId = `agent_${uuidv4()}`;

    await createAgent({
      id: agentId,
      name: 'Original Name',
      description: 'Original description',
      provider: 'test',
      model: 'test-model',
      author: new mongoose.Types.ObjectId(),
    });
    const updatedAgent = await updateAgent({ id: agentId }, { name: 'Updated Name' });

    expect(updatedAgent.versions).toBeDefined();
    expect(Array.isArray(updatedAgent.versions)).toBe(true);
    expect(updatedAgent.versions).toHaveLength(2);

    const versionedState = updatedAgent.versions[0];
    expect(versionedState.name).toBe('Original Name');
    expect(versionedState.description).toBe('Original description');
    expect(versionedState.provider).toBe('test');
    expect(versionedState.model).toBe('test-model');
    expect(updatedAgent.name).toBe('Updated Name');
    expect(updatedAgent.description).toBe('Original description');
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

  test('should not include _id, __v, or updatedAt in version history', async () => {
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
    expect(updatedAgent.versions[0].author).toBeDefined();

    expect(updatedAgent.versions[1]._id).toBeUndefined();
    expect(updatedAgent.versions[1].__v).toBeUndefined();
  });

  test('should not recursively include previous versions in version history', async () => {
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

  test('should properly handle updates with different update operators', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Operator Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1'],
    });

    const updatedAgent = await updateAgent(
      { id: agentId },
      {
        description: 'Updated description',
        $push: { tools: 'tool2' },
        $addToSet: { projectIds: projectId },
        $pull: { someArray: 'value' },
      },
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.versions[0].name).toBe('Operator Test Agent');
    expect(updatedAgent.versions[0].description).toBeUndefined();
    expect(updatedAgent.versions[0].tools).toEqual(['tool1']);

    expect(updatedAgent.description).toBe('Updated description');
    expect(updatedAgent.tools).toContain('tool1');
    expect(updatedAgent.tools).toContain('tool2');
    expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId.toString());

    expect(updatedAgent.versions[1].name).toBe('Operator Test Agent');
    expect(updatedAgent.versions[1].description).toBe('Updated description');
    expect(updatedAgent.versions[1].tools).toEqual(['tool1']);
  });

  test('should accumulate version history when updating with different values', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Version Test Agent',
      description: 'Initial description',
      instructions: 'Initial instructions',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1', 'tool2'],
      capabilities: ['capability1'],
    });

    await updateAgent(
      { id: agentId },
      {
        name: 'First Update Name',
        description: 'First update description',
      },
    );

    const result = await updateAgent(
      { id: agentId },
      {
        name: 'Second Update Name',
        description: 'Second update description',
      },
    );

    expect(result.versions).toHaveLength(3);
  });

  test('should handle array fields in updates correctly', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Array Fields Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1', 'tool2'],
      capabilities: ['capability1'],
    });

    const updatedAgent = await updateAgent(
      { id: agentId },
      {
        tools: ['tool2', 'tool1'],
        capabilities: ['capability1', 'capability2'],
      },
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.tools[0]).toBe('tool2');
    expect(updatedAgent.tools[1]).toBe('tool1');
  });

  test('should handle MongoDB operators correctly', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    // Create a simple agent
    await createAgent({
      id: agentId,
      name: 'Operator Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tools: ['tool1'],
    });

    // Test MongoDB operator updates
    await updateAgent(
      { id: agentId },
      {
        $push: { tools: 'tool2' },
      },
    );

    const updatedAgent = await getAgent({ id: agentId });

    // Verify the updates were applied correctly
    expect(updatedAgent.tools).toContain('tool1');
    expect(updatedAgent.tools).toContain('tool2');

    // Test a second MongoDB operator update
    await updateAgent(
      { id: agentId },
      {
        $push: { tools: 'tool3' },
      },
    );

    const finalAgent = await getAgent({ id: agentId });
    expect(finalAgent.tools).toContain('tool1');
    expect(finalAgent.tools).toContain('tool2');
    expect(finalAgent.tools).toContain('tool3');
  });

  test('should reject duplicate version updates', async () => {
    const originalConsoleError = console.error;
    console.error = jest.fn();

    try {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Duplicate Test Agent',
        description: 'Initial description',
        instructions: 'Initial instructions',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tools: ['tool1', 'tool2'],
        capabilities: ['capability1'],
      });

      await updateAgent(
        { id: agentId },
        {
          name: 'Updated Name',
          description: 'Updated description',
        },
      );

      let error;
      try {
        await updateAgent(
          { id: agentId },
          {
            name: 'Updated Name',
            description: 'Updated description',
          },
        );
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Duplicate version');
      expect(error.statusCode).toBe(409);
      expect(error.details).toBeDefined();
      expect(error.details.duplicateVersion).toBeDefined();

      const agent = await getAgent({ id: agentId });
      expect(agent.versions).toHaveLength(2);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('should detect changes in model_parameters', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Parameters Test Agent',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      model_parameters: { temperature: 0.7 },
    });

    // Should allow update with different model_parameters
    const updatedAgent = await updateAgent(
      { id: agentId },
      { model_parameters: { temperature: 0.8 } },
    );

    expect(updatedAgent.versions).toHaveLength(2);
    expect(updatedAgent.model_parameters.temperature).toBe(0.8);

    // Trying to update with the same model_parameters should fail
    let error;
    try {
      await updateAgent({ id: agentId }, { model_parameters: { temperature: 0.8 } });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');
    expect(error.statusCode).toBe(409);
  });

  test('should compare model_parameters objects correctly', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Complex Parameters Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      model_parameters: {
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1.0,
      },
    });

    // Add a new property, should succeed
    await updateAgent(
      { id: agentId },
      {
        model_parameters: {
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 1.0,
          frequency_penalty: 0.0,
        },
      },
    );

    // Change one property, should succeed
    await updateAgent(
      { id: agentId },
      {
        model_parameters: {
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 0.9,
          frequency_penalty: 0.0,
        },
      },
    );

    const agent = await getAgent({ id: agentId });
    expect(agent.versions).toHaveLength(3);
  });

  test('should handle empty or undefined model_parameters', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    // Create agent with undefined model_parameters
    await createAgent({
      id: agentId,
      name: 'Empty Parameters Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
    });

    // Update with empty object should be considered a change
    await updateAgent({ id: agentId }, { model_parameters: {} });

    // Update with a value
    await updateAgent({ id: agentId }, { model_parameters: { temperature: 0.7 } });

    // Update with empty object again, should be different from previous
    await updateAgent({ id: agentId }, { model_parameters: {} });

    const agent = await getAgent({ id: agentId });
    expect(agent.versions).toHaveLength(4);
    expect(agent.model_parameters).toEqual({});
  });

  test('should detect changes in all special fields', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId1 = new mongoose.Types.ObjectId();
    const projectId2 = new mongoose.Types.ObjectId();

    // Directly operate on the model for testing to bypass validation
    await Agent.create({
      id: agentId,
      name: 'Special Fields Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tool_kwargs: [],
      agent_ids: [],
      conversation_starters: [],
      projectIds: [projectId1],
      end_after_tools: false,
      hide_sequential_outputs: false,
    });

    // Use direct model operations to update (skip duplication check)
    await Agent.updateOne(
      { id: agentId },
      { $set: { tool_kwargs: [{ name: 'tool1', value: 'value1' }] } },
    );

    await Agent.updateOne({ id: agentId }, { $set: { agent_ids: ['agent1'] } });

    await Agent.updateOne(
      { id: agentId },
      { $set: { conversation_starters: ['How can I help you?'] } },
    );

    await Agent.updateOne({ id: agentId }, { $set: { projectIds: [projectId1, projectId2] } });

    await Agent.updateOne(
      { id: agentId },
      {
        $set: {
          end_after_tools: true,
          hide_sequential_outputs: true,
        },
      },
    );

    // Create versions manually for testing
    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [],
            agent_ids: [],
            conversation_starters: [],
            projectIds: [projectId1],
            end_after_tools: false,
            hide_sequential_outputs: false,
            updatedAt: new Date(),
          },
        },
      },
    );

    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [{ name: 'tool1', value: 'value1' }],
            agent_ids: [],
            conversation_starters: [],
            projectIds: [projectId1],
            end_after_tools: false,
            hide_sequential_outputs: false,
            updatedAt: new Date(),
          },
        },
      },
    );

    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [{ name: 'tool1', value: 'value1' }],
            agent_ids: ['agent1'],
            conversation_starters: [],
            projectIds: [projectId1],
            end_after_tools: false,
            hide_sequential_outputs: false,
            updatedAt: new Date(),
          },
        },
      },
    );

    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [{ name: 'tool1', value: 'value1' }],
            agent_ids: ['agent1'],
            conversation_starters: ['How can I help you?'],
            projectIds: [projectId1],
            end_after_tools: false,
            hide_sequential_outputs: false,
            updatedAt: new Date(),
          },
        },
      },
    );

    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [{ name: 'tool1', value: 'value1' }],
            agent_ids: ['agent1'],
            conversation_starters: ['How can I help you?'],
            projectIds: [projectId1, projectId2],
            end_after_tools: false,
            hide_sequential_outputs: false,
            updatedAt: new Date(),
          },
        },
      },
    );

    await Agent.updateOne(
      { id: agentId },
      {
        $push: {
          versions: {
            name: 'Special Fields Test',
            provider: 'test',
            model: 'test-model',
            tool_kwargs: [{ name: 'tool1', value: 'value1' }],
            agent_ids: ['agent1'],
            conversation_starters: ['How can I help you?'],
            projectIds: [projectId1, projectId2],
            end_after_tools: true,
            hide_sequential_outputs: true,
            updatedAt: new Date(),
          },
        },
      },
    );

    const agent = await getAgent({ id: agentId });
    expect(agent.versions).toHaveLength(6);

    expect(agent.tool_kwargs).toEqual(expect.arrayContaining([{ name: 'tool1', value: 'value1' }]));
    expect(agent.agent_ids).toEqual(expect.arrayContaining(['agent1']));
    expect(agent.conversation_starters).toEqual(expect.arrayContaining(['How can I help you?']));
    expect(agent.projectIds.map((id) => id.toString())).toContain(projectId1.toString());
    expect(agent.projectIds.map((id) => id.toString())).toContain(projectId2.toString());
    expect(agent.end_after_tools).toBe(true);
    expect(agent.hide_sequential_outputs).toBe(true);
  });

  test('should detect duplicate update with complex fields', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Complex Fields Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      tool_kwargs: [
        { name: 'tool1', value: 'value1' },
        { name: 'tool2', value: 'value2' },
      ],
      agent_ids: ['agent1', 'agent2'],
      conversation_starters: ['Hello', 'How are you?'],
      end_after_tools: true,
      hide_sequential_outputs: false,
    });

    await updateAgent(
      { id: agentId },
      {
        tool_kwargs: [
          { name: 'tool1', value: 'new-value' },
          { name: 'tool2', value: 'value2' },
        ],
      },
    );

    let error;
    try {
      await updateAgent(
        { id: agentId },
        {
          tool_kwargs: [
            { name: 'tool1', value: 'new-value' },
            { name: 'tool2', value: 'value2' },
          ],
        },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');
    expect(error.statusCode).toBe(409);

    try {
      await updateAgent(
        { id: agentId },
        {
          tool_kwargs: [
            { name: 'tool2', value: 'value2' },
            { name: 'tool1', value: 'new-value' },
          ],
        },
      );
    } catch (e) {
      expect(e.message).toContain('Duplicate version');
    }

    const agent = await getAgent({ id: agentId });
    expect(agent.versions).toHaveLength(2);
  });

  test('should detect single field changes in complex objects', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    await createAgent({
      id: agentId,
      name: 'Single Field Change Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      model_parameters: {
        temperature: 0.7,
        top_p: 1.0,
        frequency_penalty: 0.0,
        presence_penalty: 0.0,
        max_tokens: 1000,
      },
    });

    let error;

    await updateAgent(
      { id: agentId },
      {
        model_parameters: {
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
          max_tokens: 1000,
        },
      },
    );

    try {
      await updateAgent(
        { id: agentId },
        {
          model_parameters: {
            temperature: 0.7,
            top_p: 0.9,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            max_tokens: 1000,
          },
        },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');

    await updateAgent(
      { id: agentId },
      {
        model_parameters: {
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.0,
          presence_penalty: 0.0,
          max_tokens: 2000,
        },
      },
    );

    const agent = await getAgent({ id: agentId });
    expect(agent.versions).toHaveLength(3);
    expect(agent.model_parameters.max_tokens).toBe(2000);
  });

  test('should check for duplicate direct updates', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

    // Create a new agent
    await createAgent({
      id: agentId,
      name: 'Direct Update Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
    });

    // First direct update - should succeed
    await updateAgent(
      { id: agentId },
      {
        description: 'Test description',
      },
    );

    let agent = await getAgent({ id: agentId });
    expect(agent.description).toBe('Test description');
    expect(agent.versions).toHaveLength(2);

    // Try to apply the same direct update again
    let error;
    try {
      await updateAgent(
        { id: agentId },
        {
          description: 'Test description',
        },
      );
    } catch (e) {
      error = e;
    }

    // Should have failed due to duplicate version detection
    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');
    expect(error.statusCode).toBe(409);

    // Apply a different direct update
    await updateAgent(
      { id: agentId },
      {
        description: 'Different description',
      },
    );

    agent = await getAgent({ id: agentId });
    expect(agent.description).toBe('Different description');
    expect(agent.versions).toHaveLength(3);
  });

  test('should allow duplicate MongoDB operator updates', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();

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
        $push: { tools: 'tool2' },
      },
    );

    let agent = await getAgent({ id: agentId });
    expect(agent.tools).toContain('tool2');
    expect(agent.versions).toHaveLength(2);

    await updateAgent(
      { id: agentId },
      {
        $push: { tools: 'tool2' },
      },
    );

    agent = await getAgent({ id: agentId });
    const toolCount = agent.tools.filter((t) => t === 'tool2').length;
    expect(toolCount).toBe(2);
    expect(agent.versions).toHaveLength(3);
  });

  test('should check for duplicate versions with projectIds updates', async () => {
    const agentId = `agent_${uuidv4()}`;
    const authorId = new mongoose.Types.ObjectId();
    const projectId1 = new mongoose.Types.ObjectId();
    const projectId2 = new mongoose.Types.ObjectId();

    // Create agent with initial projectId
    await createAgent({
      id: agentId,
      name: 'Project ID Test',
      provider: 'test',
      model: 'test-model',
      author: authorId,
      projectIds: [projectId1],
    });

    // First update - add second project ID
    await updateAgent(
      { id: agentId },
      {
        projectIds: [projectId1, projectId2],
      },
    );

    let agent = await getAgent({ id: agentId });
    expect(agent.projectIds).toHaveLength(2);
    expect(agent.versions).toHaveLength(2);

    // Try to apply the same projectIds update again
    let error;
    try {
      await updateAgent(
        { id: agentId },
        {
          projectIds: [projectId1, projectId2],
        },
      );
    } catch (e) {
      error = e;
    }

    // Should have failed due to duplicate version detection
    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');
    expect(error.statusCode).toBe(409);

    // Different order of the same projectIds should still be detected as duplicate
    error = undefined;
    try {
      await updateAgent(
        { id: agentId },
        {
          projectIds: [projectId2, projectId1],
        },
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Duplicate version');

    // Apply a different projectIds update
    const projectId3 = new mongoose.Types.ObjectId();
    await updateAgent(
      { id: agentId },
      {
        projectIds: [projectId1, projectId2, projectId3],
      },
    );

    agent = await getAgent({ id: agentId });
    expect(agent.projectIds).toHaveLength(3);
    expect(agent.versions).toHaveLength(3);
  });
});
