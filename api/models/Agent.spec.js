const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { Agent, addAgentResourceFile, removeAgentResourceFiles } = require('./Agent');

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
