const originalEnv = {
  CREDS_KEY: process.env.CREDS_KEY,
  CREDS_IV: process.env.CREDS_IV,
};

process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = '0123456789abcdef';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { agentSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  getAgent,
  loadAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getListAgents,
  updateAgentProjects,
  addAgentResourceFile,
  removeAgentResourceFiles,
  generateActionMetadataHash,
  revertAgentVersion,
} = require('./Agent');

/**
 * @type {import('mongoose').Model<import('@librechat/data-schemas').IAgent>}
 */
let Agent;

describe('models/Agent', () => {
  describe('Agent Resource File Operations', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
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
      const additionPromises = createFileOperations(agent.id, fileIds, 'add');

      await Promise.all(additionPromises);

      const updatedAgent = await Agent.findOne({ id: agent.id });
      expect(updatedAgent.tool_resources.test_tool.file_ids).toBeDefined();
      expect(updatedAgent.tool_resources.test_tool.file_ids).toHaveLength(10);
      expect(new Set(updatedAgent.tool_resources.test_tool.file_ids).size).toBe(10);
    });

    test('should handle concurrent additions and removals', async () => {
      const agent = await createBasicAgent();
      const initialFileIds = Array.from({ length: 5 }, () => uuidv4());

      await Promise.all(createFileOperations(agent.id, initialFileIds, 'add'));

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

    test.each([
      {
        name: 'duplicate additions',
        operation: 'add',
        duplicateCount: 5,
        expectedLength: 1,
        expectedContains: true,
      },
      {
        name: 'duplicate removals',
        operation: 'remove',
        duplicateCount: 5,
        expectedLength: 0,
        expectedContains: false,
        setupFile: true,
      },
    ])(
      'should handle concurrent $name',
      async ({ operation, duplicateCount, expectedLength, expectedContains, setupFile }) => {
        const agent = await createBasicAgent();
        const fileId = uuidv4();

        if (setupFile) {
          await addAgentResourceFile({
            agent_id: agent.id,
            tool_resource: 'test_tool',
            file_id: fileId,
          });
        }

        const promises = Array.from({ length: duplicateCount }).map(() =>
          operation === 'add'
            ? addAgentResourceFile({
                agent_id: agent.id,
                tool_resource: 'test_tool',
                file_id: fileId,
              })
            : removeAgentResourceFiles({
                agent_id: agent.id,
                files: [{ tool_resource: 'test_tool', file_id: fileId }],
              }),
        );

        await Promise.all(promises);

        const updatedAgent = await Agent.findOne({ id: agent.id });
        const fileIds = updatedAgent.tool_resources?.test_tool?.file_ids ?? [];

        expect(fileIds).toHaveLength(expectedLength);
        if (expectedContains) {
          expect(fileIds[0]).toBe(fileId);
        } else {
          expect(fileIds).not.toContain(fileId);
        }
      },
    );

    test('should handle concurrent add and remove of the same file', async () => {
      const agent = await createBasicAgent();
      const fileId = uuidv4();

      await addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: 'test_tool',
        file_id: fileId,
      });

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
      const finalFileIds = updatedAgent.tool_resources.test_tool.file_ids;
      const count = finalFileIds.filter((id) => id === fileId).length;

      expect(count).toBeLessThanOrEqual(1);
      if (count === 0) {
        expect(finalFileIds).toHaveLength(0);
      } else {
        expect(finalFileIds).toHaveLength(1);
        expect(finalFileIds[0]).toBe(fileId);
      }
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

    describe('Edge Cases', () => {
      describe.each([
        {
          operation: 'add',
          name: 'empty file_id',
          needsAgent: true,
          params: { tool_resource: 'file_search', file_id: '' },
          shouldResolve: true,
        },
        {
          operation: 'add',
          name: 'non-existent agent',
          needsAgent: false,
          params: { tool_resource: 'file_search', file_id: 'file123' },
          shouldResolve: false,
          error: 'Agent not found for adding resource file',
        },
      ])('addAgentResourceFile with $name', ({ needsAgent, params, shouldResolve, error }) => {
        test(`should ${shouldResolve ? 'resolve' : 'reject'}`, async () => {
          const agent = needsAgent ? await createBasicAgent() : null;
          const agent_id = needsAgent ? agent.id : `agent_${uuidv4()}`;

          if (shouldResolve) {
            await expect(addAgentResourceFile({ agent_id, ...params })).resolves.toBeDefined();
          } else {
            await expect(addAgentResourceFile({ agent_id, ...params })).rejects.toThrow(error);
          }
        });
      });

      describe.each([
        {
          name: 'empty files array',
          files: [],
          needsAgent: true,
          shouldResolve: true,
        },
        {
          name: 'non-existent tool_resource',
          files: [{ tool_resource: 'non_existent_tool', file_id: 'file123' }],
          needsAgent: true,
          shouldResolve: true,
        },
        {
          name: 'non-existent agent',
          files: [{ tool_resource: 'file_search', file_id: 'file123' }],
          needsAgent: false,
          shouldResolve: false,
          error: 'Agent not found for removing resource files',
        },
      ])('removeAgentResourceFiles with $name', ({ files, needsAgent, shouldResolve, error }) => {
        test(`should ${shouldResolve ? 'resolve' : 'reject'}`, async () => {
          const agent = needsAgent ? await createBasicAgent() : null;
          const agent_id = needsAgent ? agent.id : `agent_${uuidv4()}`;

          if (shouldResolve) {
            const result = await removeAgentResourceFiles({ agent_id, files });
            expect(result).toBeDefined();
            if (agent) {
              expect(result.id).toBe(agent.id);
            }
          } else {
            await expect(removeAgentResourceFiles({ agent_id, files })).rejects.toThrow(error);
          }
        });
      });
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
      const { agentId, authorId } = createTestIds();

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
      expect(updatedAgent.projectIds.map((id) => id.toString())).not.toContain(
        projectId1.toString(),
      );

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

    describe('Edge Cases', () => {
      test.each([
        {
          name: 'getAgent with undefined search parameters',
          fn: () => getAgent(undefined),
          expected: null,
        },
        {
          name: 'deleteAgent with non-existent agent',
          fn: () => deleteAgent({ id: 'non-existent' }),
          expected: null,
        },
      ])('$name should return null', async ({ fn, expected }) => {
        const result = await fn();
        expect(result).toBe(expected);
      });

      test('should handle getListAgents with invalid author format', async () => {
        try {
          const result = await getListAgents({ author: 'invalid-object-id' });
          expect(result.data).toEqual([]);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      test('should handle getListAgents with no agents', async () => {
        const authorId = new mongoose.Types.ObjectId();
        const result = await getListAgents({ author: authorId.toString() });

        expect(result).toBeDefined();
        expect(result.data).toEqual([]);
        expect(result.has_more).toBe(false);
        expect(result.first_id).toBeNull();
        expect(result.last_id).toBeNull();
      });

      test('should handle updateAgentProjects with non-existent agent', async () => {
        const nonExistentId = `agent_${uuidv4()}`;
        const userId = new mongoose.Types.ObjectId();
        const projectId = new mongoose.Types.ObjectId();

        const result = await updateAgentProjects({
          user: { id: userId.toString() },
          agentId: nonExistentId,
          projectIds: [projectId.toString()],
        });

        expect(result).toBeNull();
      });
    });
  });

  describe('Agent Version History', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
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
      const agent = await createBasicAgent();

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

      await updateAgent(
        { id: agentId },
        { name: 'Second Name', description: 'Second description' },
      );
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
        const authorId = new mongoose.Types.ObjectId();
        const testCases = generateVersionTestCases();

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
        { updatingUserId: updatingUser.toString() },
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
        { updatingUserId: originalAuthor.toString() },
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
        { updatingUserId: user1.toString() },
      );

      // Original author makes an update
      await updateAgent(
        { id: agentId },
        { description: 'Updated by original author' },
        { updatingUserId: originalAuthor.toString() },
      );

      // User 2 makes an update
      await updateAgent(
        { id: agentId },
        { name: 'Updated by User 2', model: 'new-model' },
        { updatingUserId: user2.toString() },
      );

      // User 3 makes an update
      const finalAgent = await updateAgent(
        { id: agentId },
        { description: 'Final update by User 3' },
        { updatingUserId: user3.toString() },
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
        { updatingUserId: updatingUser.toString() },
      );

      const { revertAgentVersion } = require('./Agent');
      const revertedAgent = await revertAgentVersion({ id: agentId }, 0);

      expect(revertedAgent.author.toString()).toBe(originalAuthor.toString());
      expect(revertedAgent.name).toBe('Original Agent');
      expect(revertedAgent.description).toBe('Original description');
    });

    test('should detect action metadata changes and force version update', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const actionId = 'testActionId123';

      // Create agent with actions
      await createAgent({
        id: agentId,
        name: 'Agent with Actions',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        actions: [`test.com_action_${actionId}`],
        tools: ['listEvents_action_test.com', 'createEvent_action_test.com'],
      });

      // First update with forceVersion should create a version
      const firstUpdate = await updateAgent(
        { id: agentId },
        { tools: ['listEvents_action_test.com', 'createEvent_action_test.com'] },
        { updatingUserId: authorId.toString(), forceVersion: true },
      );

      expect(firstUpdate.versions).toHaveLength(2);

      // Second update with same data but forceVersion should still create a version
      const secondUpdate = await updateAgent(
        { id: agentId },
        { tools: ['listEvents_action_test.com', 'createEvent_action_test.com'] },
        { updatingUserId: authorId.toString(), forceVersion: true },
      );

      expect(secondUpdate.versions).toHaveLength(3);

      // Update without forceVersion and no changes should not create a version
      let error;
      try {
        await updateAgent(
          { id: agentId },
          { tools: ['listEvents_action_test.com', 'createEvent_action_test.com'] },
          { updatingUserId: authorId.toString(), forceVersion: false },
        );
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Duplicate version');
      expect(error.statusCode).toBe(409);
    });

    test('should handle isDuplicateVersion with arrays containing null/undefined values', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tools: ['tool1', null, 'tool2', undefined],
      });

      // Update with same array but different null/undefined arrangement
      const updatedAgent = await updateAgent({ id: agentId }, { tools: ['tool1', 'tool2'] });

      expect(updatedAgent.versions).toHaveLength(2);
      expect(updatedAgent.tools).toEqual(['tool1', 'tool2']);
    });

    test('should handle isDuplicateVersion with empty objects in tool_kwargs', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tool_kwargs: [
          { tool: 'tool1', config: { setting: 'value' } },
          {},
          { tool: 'tool2', config: {} },
        ],
      });

      // Try to update with reordered but equivalent tool_kwargs
      const updatedAgent = await updateAgent(
        { id: agentId },
        {
          tool_kwargs: [
            { tool: 'tool2', config: {} },
            { tool: 'tool1', config: { setting: 'value' } },
            {},
          ],
        },
      );

      // Should create new version as order matters for arrays
      expect(updatedAgent.versions).toHaveLength(2);
    });

    test('should handle isDuplicateVersion with mixed primitive and object arrays', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        mixed_array: [1, 'string', { key: 'value' }, true, null],
      });

      // Update with same values but different types
      const updatedAgent = await updateAgent(
        { id: agentId },
        { mixed_array: ['1', 'string', { key: 'value' }, 'true', null] },
      );

      // Should create new version as types differ
      expect(updatedAgent.versions).toHaveLength(2);
    });

    test('should handle isDuplicateVersion with deeply nested objects', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
                array: [1, 2, { nested: true }],
              },
            },
          },
        },
      };

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        model_parameters: deepObject,
      });

      // First create a version with changes
      await updateAgent({ id: agentId }, { description: 'Updated' });

      // Then try to create duplicate of the original version
      await updateAgent(
        { id: agentId },
        {
          model_parameters: deepObject,
          description: undefined,
        },
      );

      // Since we're updating back to the same model_parameters but with a different description,
      // it should create a new version
      const agent = await getAgent({ id: agentId });
      expect(agent.versions).toHaveLength(3);
    });

    test('should handle version comparison with special field types', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const projectId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        projectIds: [projectId],
        model_parameters: { temperature: 0.7 },
      });

      // Update with a real field change first
      const firstUpdate = await updateAgent({ id: agentId }, { description: 'New description' });

      expect(firstUpdate.versions).toHaveLength(2);

      // Update with model parameters change
      const secondUpdate = await updateAgent(
        { id: agentId },
        { model_parameters: { temperature: 0.8 } },
      );

      expect(secondUpdate.versions).toHaveLength(3);
    });

    describe('Edge Cases', () => {
      test('should handle extremely large version history', async () => {
        const agentId = `agent_${uuidv4()}`;
        const authorId = new mongoose.Types.ObjectId();

        await createAgent({
          id: agentId,
          name: 'Version Test',
          provider: 'test',
          model: 'test-model',
          author: authorId,
        });

        for (let i = 0; i < 20; i++) {
          await updateAgent({ id: agentId }, { description: `Version ${i}` });
        }

        const agent = await getAgent({ id: agentId });
        expect(agent.versions).toHaveLength(21);
        expect(agent.description).toBe('Version 19');
      });

      test('should handle revertAgentVersion with invalid version index', async () => {
        const agentId = `agent_${uuidv4()}`;
        const authorId = new mongoose.Types.ObjectId();

        await createAgent({
          id: agentId,
          name: 'Test Agent',
          provider: 'test',
          model: 'test-model',
          author: authorId,
        });

        await expect(revertAgentVersion({ id: agentId }, 5)).rejects.toThrow('Version 5 not found');
      });

      test('should handle revertAgentVersion with non-existent agent', async () => {
        const nonExistentId = `agent_${uuidv4()}`;

        await expect(revertAgentVersion({ id: nonExistentId }, 0)).rejects.toThrow(
          'Agent not found',
        );
      });

      test('should handle updateAgent with empty update object', async () => {
        const agentId = `agent_${uuidv4()}`;
        const authorId = new mongoose.Types.ObjectId();

        await createAgent({
          id: agentId,
          name: 'Test Agent',
          provider: 'test',
          model: 'test-model',
          author: authorId,
        });

        const updatedAgent = await updateAgent({ id: agentId }, {});

        expect(updatedAgent).toBeDefined();
        expect(updatedAgent.name).toBe('Test Agent');
        expect(updatedAgent.versions).toHaveLength(1);
      });
    });
  });

  describe('Action Metadata and Hash Generation', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await Agent.deleteMany({});
    });

    test('should generate consistent hash for same action metadata', async () => {
      const actionIds = ['test.com_action_123', 'example.com_action_456'];
      const actions = [
        {
          action_id: '123',
          metadata: { version: '1.0', endpoints: ['GET /api/test'], schema: { type: 'object' } },
        },
        {
          action_id: '456',
          metadata: {
            version: '2.0',
            endpoints: ['POST /api/example'],
            schema: { type: 'string' },
          },
        },
      ];

      const hash1 = await generateActionMetadataHash(actionIds, actions);
      const hash2 = await generateActionMetadataHash(actionIds, actions);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 produces 64 character hex string
    });

    test('should generate different hashes for different action metadata', async () => {
      const actionIds = ['test.com_action_123'];
      const actions1 = [
        { action_id: '123', metadata: { version: '1.0', endpoints: ['GET /api/test'] } },
      ];
      const actions2 = [
        { action_id: '123', metadata: { version: '2.0', endpoints: ['GET /api/test'] } },
      ];

      const hash1 = await generateActionMetadataHash(actionIds, actions1);
      const hash2 = await generateActionMetadataHash(actionIds, actions2);

      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty action arrays', async () => {
      const hash = await generateActionMetadataHash([], []);
      expect(hash).toBe('');
    });

    test('should handle null or undefined action arrays', async () => {
      const hash1 = await generateActionMetadataHash(null, []);
      const hash2 = await generateActionMetadataHash(undefined, []);

      expect(hash1).toBe('');
      expect(hash2).toBe('');
    });

    test('should handle missing action metadata gracefully', async () => {
      const actionIds = ['test.com_action_123', 'missing.com_action_999'];
      const actions = [
        { action_id: '123', metadata: { version: '1.0' } },
        // missing action with id '999'
      ];

      const hash = await generateActionMetadataHash(actionIds, actions);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    test('should sort action IDs for consistent hashing', async () => {
      const actionIds1 = ['b.com_action_2', 'a.com_action_1'];
      const actionIds2 = ['a.com_action_1', 'b.com_action_2'];
      const actions = [
        { action_id: '1', metadata: { version: '1.0' } },
        { action_id: '2', metadata: { version: '2.0' } },
      ];

      const hash1 = await generateActionMetadataHash(actionIds1, actions);
      const hash2 = await generateActionMetadataHash(actionIds2, actions);

      expect(hash1).toBe(hash2);
    });

    test('should handle complex nested metadata objects', async () => {
      const actionIds = ['complex.com_action_1'];
      const actions = [
        {
          action_id: '1',
          metadata: {
            version: '1.0',
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                nested: {
                  type: 'object',
                  properties: {
                    id: { type: 'number' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
            endpoints: [
              { path: '/api/test', method: 'GET', params: ['id'] },
              { path: '/api/create', method: 'POST', body: true },
            ],
          },
        },
      ];

      const hash = await generateActionMetadataHash(actionIds, actions);
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    describe('Edge Cases', () => {
      test('should handle generateActionMetadataHash with null metadata', async () => {
        const hash = await generateActionMetadataHash(
          ['test.com_action_1'],
          [{ action_id: '1', metadata: null }],
        );
        expect(typeof hash).toBe('string');
      });

      test('should handle generateActionMetadataHash with deeply nested metadata', async () => {
        const deepMetadata = {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: 'deep value',
                  array: [1, 2, { nested: true }],
                },
              },
            },
          },
        };

        const hash = await generateActionMetadataHash(
          ['test.com_action_1'],
          [{ action_id: '1', metadata: deepMetadata }],
        );

        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64);
      });

      test('should handle generateActionMetadataHash with special characters', async () => {
        const specialMetadata = {
          unicode: '🚀🎉👍',
          symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
          quotes: 'single\'s and "doubles"',
          newlines: 'line1\nline2\r\nline3',
        };

        const hash = await generateActionMetadataHash(
          ['test.com_action_1'],
          [{ action_id: '1', metadata: specialMetadata }],
        );

        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64);
      });
    });
  });

  describe('Load Agent Functionality', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await Agent.deleteMany({});
    });

    test('should return null when agent_id is not provided', async () => {
      const mockReq = { user: { id: 'user123' } };
      const result = await loadAgent({
        req: mockReq,
        agent_id: null,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      expect(result).toBeNull();
    });

    test('should return null when agent_id is empty string', async () => {
      const mockReq = { user: { id: 'user123' } };
      const result = await loadAgent({
        req: mockReq,
        agent_id: '',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      expect(result).toBeNull();
    });

    test('should test ephemeral agent loading logic', async () => {
      const { EPHEMERAL_AGENT_ID } = require('librechat-data-provider').Constants;

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Test instructions',
          ephemeralAgent: {
            execute_code: true,
            web_search: true,
            mcp: ['server1', 'server2'],
          },
        },
        app: {
          locals: {
            availableTools: {
              tool1_mcp_server1: {},
              tool2_mcp_server2: {},
              another_tool: {},
            },
          },
        },
      };

      const result = await loadAgent({
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4', temperature: 0.7 },
      });

      if (result) {
        expect(result.id).toBe(EPHEMERAL_AGENT_ID);
        expect(result.instructions).toBe('Test instructions');
        expect(result.provider).toBe('openai');
        expect(result.model).toBe('gpt-4');
        expect(result.model_parameters.temperature).toBe(0.7);
        expect(result.tools).toContain('execute_code');
        expect(result.tools).toContain('web_search');
        expect(result.tools).toContain('tool1_mcp_server1');
        expect(result.tools).toContain('tool2_mcp_server2');
      } else {
        expect(result).toBeNull();
      }
    });

    test('should return null for non-existent agent', async () => {
      const mockReq = { user: { id: 'user123' } };
      const result = await loadAgent({
        req: mockReq,
        agent_id: 'non_existent_agent',
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      expect(result).toBeNull();
    });

    test('should load agent when user is the author', async () => {
      const userId = new mongoose.Types.ObjectId();
      const agentId = `agent_${uuidv4()}`;

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: userId,
        description: 'Test description',
        tools: ['web_search'],
      });

      const mockReq = { user: { id: userId.toString() } };
      const result = await loadAgent({
        req: mockReq,
        agent_id: agentId,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(agentId);
      expect(result.name).toBe('Test Agent');
      expect(result.author.toString()).toBe(userId.toString());
      expect(result.version).toBe(1);
    });

    test('should return null when user is not author and agent has no projectIds', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const agentId = `agent_${uuidv4()}`;

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      const mockReq = { user: { id: userId.toString() } };
      const result = await loadAgent({
        req: mockReq,
        agent_id: agentId,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      expect(result).toBeFalsy();
    });

    test('should handle ephemeral agent with no MCP servers', async () => {
      const { EPHEMERAL_AGENT_ID } = require('librechat-data-provider').Constants;

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Simple instructions',
          ephemeralAgent: {
            execute_code: false,
            web_search: false,
            mcp: [],
          },
        },
        app: {
          locals: {
            availableTools: {},
          },
        },
      };

      const result = await loadAgent({
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-3.5-turbo' },
      });

      if (result) {
        expect(result.tools).toEqual([]);
        expect(result.instructions).toBe('Simple instructions');
      } else {
        expect(result).toBeFalsy();
      }
    });

    test('should handle ephemeral agent with undefined ephemeralAgent in body', async () => {
      const { EPHEMERAL_AGENT_ID } = require('librechat-data-provider').Constants;

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Basic instructions',
        },
        app: {
          locals: {
            availableTools: {},
          },
        },
      };

      const result = await loadAgent({
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      if (result) {
        expect(result.tools).toEqual([]);
      } else {
        expect(result).toBeFalsy();
      }
    });

    describe('Edge Cases', () => {
      test('should handle loadAgent with malformed req object', async () => {
        const result = await loadAgent({
          req: null,
          agent_id: 'test',
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' },
        });

        expect(result).toBeNull();
      });

      test('should handle ephemeral agent with extremely large tool list', async () => {
        const { EPHEMERAL_AGENT_ID } = require('librechat-data-provider').Constants;

        const largeToolList = Array.from({ length: 100 }, (_, i) => `tool_${i}_mcp_server1`);
        const mockReq = {
          user: { id: 'user123' },
          body: {
            promptPrefix: 'Test',
            ephemeralAgent: {
              execute_code: true,
              web_search: true,
              mcp: ['server1'],
            },
          },
          app: {
            locals: {
              availableTools: largeToolList.reduce((acc, tool) => {
                acc[tool] = {};
                return acc;
              }, {}),
            },
          },
        };

        const result = await loadAgent({
          req: mockReq,
          agent_id: EPHEMERAL_AGENT_ID,
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' },
        });

        if (result) {
          expect(result.tools.length).toBeGreaterThan(100);
        }
      });

      test('should handle loadAgent with agent from different project', async () => {
        const authorId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();
        const agentId = `agent_${uuidv4()}`;
        const projectId = new mongoose.Types.ObjectId();

        await createAgent({
          id: agentId,
          name: 'Project Agent',
          provider: 'openai',
          model: 'gpt-4',
          author: authorId,
          projectIds: [projectId],
        });

        const mockReq = { user: { id: userId.toString() } };
        const result = await loadAgent({
          req: mockReq,
          agent_id: agentId,
          endpoint: 'openai',
          model_parameters: { model: 'gpt-4' },
        });

        expect(result).toBeFalsy();
      });
    });
  });

  describe('Agent Edge Cases and Error Handling', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await Agent.deleteMany({});
    });

    test('should handle agent creation with minimal required fields', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      const agent = await createAgent({
        id: agentId,
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBe(agentId);
      expect(agent.versions).toHaveLength(1);
      expect(agent.versions[0].provider).toBe('test');
      expect(agent.versions[0].model).toBe('test-model');
    });

    test('should handle agent creation with all optional fields', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const projectId = new mongoose.Types.ObjectId();

      const agent = await createAgent({
        id: agentId,
        name: 'Complex Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        description: 'Complex description',
        instructions: 'Complex instructions',
        tools: ['tool1', 'tool2'],
        actions: ['action1', 'action2'],
        model_parameters: { temperature: 0.8, max_tokens: 1000 },
        projectIds: [projectId],
        avatar: 'https://example.com/avatar.png',
        isCollaborative: true,
        tool_resources: {
          file_search: { file_ids: ['file1', 'file2'] },
        },
      });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('Complex Agent');
      expect(agent.description).toBe('Complex description');
      expect(agent.instructions).toBe('Complex instructions');
      expect(agent.tools).toEqual(['tool1', 'tool2']);
      expect(agent.actions).toEqual(['action1', 'action2']);
      expect(agent.model_parameters.temperature).toBe(0.8);
      expect(agent.model_parameters.max_tokens).toBe(1000);
      expect(agent.projectIds.map((id) => id.toString())).toContain(projectId.toString());
      expect(agent.avatar).toBe('https://example.com/avatar.png');
      expect(agent.isCollaborative).toBe(true);
      expect(agent.tool_resources.file_search.file_ids).toEqual(['file1', 'file2']);
    });

    test('should handle updateAgent with empty update object', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      const updatedAgent = await updateAgent({ id: agentId }, {});

      expect(updatedAgent).toBeDefined();
      expect(updatedAgent.name).toBe('Test Agent');
      expect(updatedAgent.versions).toHaveLength(1); // No new version should be created
    });

    test('should handle concurrent updates to different agents', async () => {
      const agent1Id = `agent_${uuidv4()}`;
      const agent2Id = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agent1Id,
        name: 'Agent 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agent2Id,
        name: 'Agent 2',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Concurrent updates to different agents
      const [updated1, updated2] = await Promise.all([
        updateAgent({ id: agent1Id }, { description: 'Updated Agent 1' }),
        updateAgent({ id: agent2Id }, { description: 'Updated Agent 2' }),
      ]);

      expect(updated1.description).toBe('Updated Agent 1');
      expect(updated2.description).toBe('Updated Agent 2');
      expect(updated1.versions).toHaveLength(2);
      expect(updated2.versions).toHaveLength(2);
    });

    test('should handle agent deletion with non-existent ID', async () => {
      const nonExistentId = `agent_${uuidv4()}`;
      const result = await deleteAgent({ id: nonExistentId });

      expect(result).toBeNull();
    });

    test('should handle getListAgents with no agents', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const result = await getListAgents({ author: authorId.toString() });

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
      expect(result.has_more).toBe(false);
      expect(result.first_id).toBeNull();
      expect(result.last_id).toBeNull();
    });

    test('should handle updateAgent with MongoDB operators mixed with direct updates', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tools: ['tool1'],
      });

      // Test with $push and direct field update
      const updatedAgent = await updateAgent(
        { id: agentId },
        {
          name: 'Updated Name',
          $push: { tools: 'tool2' },
        },
      );

      expect(updatedAgent.name).toBe('Updated Name');
      expect(updatedAgent.tools).toContain('tool1');
      expect(updatedAgent.tools).toContain('tool2');
      expect(updatedAgent.versions).toHaveLength(2);
    });

    test('should handle revertAgentVersion with invalid version index', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Try to revert to non-existent version
      await expect(revertAgentVersion({ id: agentId }, 5)).rejects.toThrow('Version 5 not found');
    });

    test('should handle revertAgentVersion with non-existent agent', async () => {
      const nonExistentId = `agent_${uuidv4()}`;

      await expect(revertAgentVersion({ id: nonExistentId }, 0)).rejects.toThrow('Agent not found');
    });

    test('should handle addAgentResourceFile with non-existent agent', async () => {
      const nonExistentId = `agent_${uuidv4()}`;
      const mockReq = { user: { id: 'user123' } };

      await expect(
        addAgentResourceFile({
          req: mockReq,
          agent_id: nonExistentId,
          tool_resource: 'file_search',
          file_id: 'file123',
        }),
      ).rejects.toThrow('Agent not found for adding resource file');
    });

    test('should handle removeAgentResourceFiles with non-existent agent', async () => {
      const nonExistentId = `agent_${uuidv4()}`;

      await expect(
        removeAgentResourceFiles({
          agent_id: nonExistentId,
          files: [{ tool_resource: 'file_search', file_id: 'file123' }],
        }),
      ).rejects.toThrow('Agent not found for removing resource files');
    });

    test('should handle updateAgent with complex nested updates', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        model_parameters: { temperature: 0.5 },
        tools: ['tool1'],
      });

      // First update with $push operation
      const firstUpdate = await updateAgent(
        { id: agentId },
        {
          $push: { tools: 'tool2' },
        },
      );

      expect(firstUpdate.tools).toContain('tool1');
      expect(firstUpdate.tools).toContain('tool2');

      // Second update with direct field update and $addToSet
      const secondUpdate = await updateAgent(
        { id: agentId },
        {
          name: 'Updated Agent',
          model_parameters: { temperature: 0.8, max_tokens: 500 },
          $addToSet: { tools: 'tool3' },
        },
      );

      expect(secondUpdate.name).toBe('Updated Agent');
      expect(secondUpdate.model_parameters.temperature).toBe(0.8);
      expect(secondUpdate.model_parameters.max_tokens).toBe(500);
      expect(secondUpdate.tools).toContain('tool1');
      expect(secondUpdate.tools).toContain('tool2');
      expect(secondUpdate.tools).toContain('tool3');
      expect(secondUpdate.versions).toHaveLength(3);
    });

    test('should preserve version order in versions array', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Version 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await updateAgent({ id: agentId }, { name: 'Version 2' });
      await updateAgent({ id: agentId }, { name: 'Version 3' });
      const finalAgent = await updateAgent({ id: agentId }, { name: 'Version 4' });

      expect(finalAgent.versions).toHaveLength(4);
      expect(finalAgent.versions[0].name).toBe('Version 1');
      expect(finalAgent.versions[1].name).toBe('Version 2');
      expect(finalAgent.versions[2].name).toBe('Version 3');
      expect(finalAgent.versions[3].name).toBe('Version 4');
      expect(finalAgent.name).toBe('Version 4');
    });

    test('should handle updateAgentProjects error scenarios', async () => {
      const nonExistentId = `agent_${uuidv4()}`;
      const userId = new mongoose.Types.ObjectId();
      const projectId = new mongoose.Types.ObjectId();

      // Test with non-existent agent
      const result = await updateAgentProjects({
        user: { id: userId.toString() },
        agentId: nonExistentId,
        projectIds: [projectId.toString()],
      });

      expect(result).toBeNull();
    });

    test('should handle revertAgentVersion properly', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Original Name',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        description: 'Original description',
      });

      await updateAgent(
        { id: agentId },
        { name: 'Updated Name', description: 'Updated description' },
      );

      const revertedAgent = await revertAgentVersion({ id: agentId }, 0);

      expect(revertedAgent.name).toBe('Original Name');
      expect(revertedAgent.description).toBe('Original description');
      expect(revertedAgent.author.toString()).toBe(authorId.toString());
    });

    test('should handle action-related updates with getActions error', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent with actions that might cause getActions to fail
      await createAgent({
        id: agentId,
        name: 'Agent with Actions',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        actions: ['test.com_action_invalid_id'],
      });

      // Update should still work even if getActions fails
      const updatedAgent = await updateAgent(
        { id: agentId },
        { description: 'Updated description' },
      );

      expect(updatedAgent).toBeDefined();
      expect(updatedAgent.description).toBe('Updated description');
      expect(updatedAgent.versions).toHaveLength(2);
    });

    test('should handle updateAgent with combined MongoDB operators', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const projectId1 = new mongoose.Types.ObjectId();
      const projectId2 = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tools: ['tool1'],
        projectIds: [projectId1],
      });

      // Use multiple operators in single update - but avoid conflicting operations on same field
      const updatedAgent = await updateAgent(
        { id: agentId },
        {
          name: 'Updated Name',
          $push: { tools: 'tool2' },
          $addToSet: { projectIds: projectId2 },
        },
      );

      const finalAgent = await updateAgent(
        { id: agentId },
        {
          $pull: { projectIds: projectId1 },
        },
      );

      expect(updatedAgent).toBeDefined();
      expect(updatedAgent.name).toBe('Updated Name');
      expect(updatedAgent.tools).toContain('tool1');
      expect(updatedAgent.tools).toContain('tool2');
      expect(updatedAgent.projectIds.map((id) => id.toString())).toContain(projectId2.toString());

      expect(finalAgent).toBeDefined();
      expect(finalAgent.projectIds.map((id) => id.toString())).not.toContain(projectId1.toString());
      expect(finalAgent.versions).toHaveLength(3);
    });

    test('should handle updateAgent when agent does not exist', async () => {
      const nonExistentId = `agent_${uuidv4()}`;

      const result = await updateAgent({ id: nonExistentId }, { name: 'New Name' });

      expect(result).toBeNull();
    });

    test('should handle concurrent updates with database errors', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Mock findOneAndUpdate to simulate database error
      const cleanup = mockFindOneAndUpdateError(2);

      // Concurrent updates where one fails
      const promises = [
        updateAgent({ id: agentId }, { name: 'Update 1' }),
        updateAgent({ id: agentId }, { name: 'Update 2' }),
        updateAgent({ id: agentId }, { name: 'Update 3' }),
      ];

      const results = await Promise.allSettled(promises);

      cleanup();

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(succeeded).toBe(2);
      expect(failed).toBe(1);
    });

    test('should handle removeAgentResourceFiles when agent is deleted during operation', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: ['file1', 'file2', 'file3'],
          },
        },
      });

      // Mock findOneAndUpdate to return null (simulating deletion)
      const originalFindOneAndUpdate = Agent.findOneAndUpdate;
      Agent.findOneAndUpdate = jest.fn().mockImplementation(() => ({
        lean: jest.fn().mockResolvedValue(null),
      }));

      // Try to remove files from deleted agent
      await expect(
        removeAgentResourceFiles({
          agent_id: agentId,
          files: [
            { tool_resource: 'file_search', file_id: 'file1' },
            { tool_resource: 'file_search', file_id: 'file2' },
          ],
        }),
      ).rejects.toThrow('Failed to update agent during file removal (pull step)');

      Agent.findOneAndUpdate = originalFindOneAndUpdate;
    });

    test('should handle loadEphemeralAgent with malformed MCP tool names', async () => {
      const { EPHEMERAL_AGENT_ID } = require('librechat-data-provider').Constants;

      const mockReq = {
        user: { id: 'user123' },
        body: {
          promptPrefix: 'Test instructions',
          ephemeralAgent: {
            execute_code: false,
            web_search: false,
            mcp: ['server1'],
          },
        },
        app: {
          locals: {
            availableTools: {
              malformed_tool_name: {}, // No mcp delimiter
              tool__server1: {}, // Wrong delimiter
              tool_mcp_server1: {}, // Correct format
              tool_mcp_server2: {}, // Different server
            },
          },
        },
      };

      const result = await loadAgent({
        req: mockReq,
        agent_id: EPHEMERAL_AGENT_ID,
        endpoint: 'openai',
        model_parameters: { model: 'gpt-4' },
      });

      if (result) {
        expect(result.tools).toEqual(['tool_mcp_server1']);
        expect(result.tools).not.toContain('malformed_tool_name');
        expect(result.tools).not.toContain('tool__server1');
        expect(result.tools).not.toContain('tool_mcp_server2');
      }
    });

    test('should handle addAgentResourceFile when array initialization fails', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Mock the updateOne operation to fail but let updateAgent succeed
      const originalUpdateOne = Agent.updateOne;
      let updateOneCalled = false;
      Agent.updateOne = jest.fn().mockImplementation((...args) => {
        if (!updateOneCalled) {
          updateOneCalled = true;
          return Promise.reject(new Error('Database error'));
        }
        return originalUpdateOne.apply(Agent, args);
      });

      try {
        const result = await addAgentResourceFile({
          agent_id: agentId,
          tool_resource: 'new_tool',
          file_id: 'file123',
        });

        expect(result).toBeDefined();
        expect(result.tools).toContain('new_tool');
      } catch (error) {
        expect(error.message).toBe('Database error');
      }

      Agent.updateOne = originalUpdateOne;
    });
  });

  describe('Agent IDs Field in Version Detection', () => {
    let mongoServer;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
      await mongoose.connect(mongoUri);
    });

    afterAll(async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      await Agent.deleteMany({});
    });

    test('should now create new version when agent_ids field changes', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      const agent = await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        agent_ids: ['agent1', 'agent2'],
      });

      expect(agent).toBeDefined();
      expect(agent.versions).toHaveLength(1);

      const updated = await updateAgent(
        { id: agentId },
        { agent_ids: ['agent1', 'agent2', 'agent3'] },
      );

      // Since agent_ids is no longer excluded, this should create a new version
      expect(updated.versions).toHaveLength(2);
      expect(updated.agent_ids).toEqual(['agent1', 'agent2', 'agent3']);
    });

    test('should detect duplicate version if agent_ids is updated to same value', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        agent_ids: ['agent1', 'agent2'],
      });

      await updateAgent({ id: agentId }, { agent_ids: ['agent1', 'agent2', 'agent3'] });

      await expect(
        updateAgent({ id: agentId }, { agent_ids: ['agent1', 'agent2', 'agent3'] }),
      ).rejects.toThrow('Duplicate version');
    });

    test('should handle agent_ids field alongside other fields', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        description: 'Initial description',
        agent_ids: ['agent1'],
      });

      const updated = await updateAgent(
        { id: agentId },
        {
          agent_ids: ['agent1', 'agent2'],
          description: 'Updated description',
        },
      );

      expect(updated.versions).toHaveLength(2);
      expect(updated.agent_ids).toEqual(['agent1', 'agent2']);
      expect(updated.description).toBe('Updated description');

      const updated2 = await updateAgent({ id: agentId }, { description: 'Another description' });

      expect(updated2.versions).toHaveLength(3);
      expect(updated2.agent_ids).toEqual(['agent1', 'agent2']);
      expect(updated2.description).toBe('Another description');
    });

    test('should skip version creation when skipVersioning option is used', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const projectId1 = new mongoose.Types.ObjectId();
      const projectId2 = new mongoose.Types.ObjectId();

      // Create agent with initial projectIds
      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        projectIds: [projectId1],
      });

      // Share agent using updateAgentProjects (which uses skipVersioning)
      const shared = await updateAgentProjects({
        user: { id: authorId.toString() }, // Use the same author ID
        agentId: agentId,
        projectIds: [projectId2.toString()],
      });

      // Should NOT create a new version due to skipVersioning
      expect(shared.versions).toHaveLength(1);
      expect(shared.projectIds.map((id) => id.toString())).toContain(projectId1.toString());
      expect(shared.projectIds.map((id) => id.toString())).toContain(projectId2.toString());

      // Unshare agent using updateAgentProjects
      const unshared = await updateAgentProjects({
        user: { id: authorId.toString() },
        agentId: agentId,
        removeProjectIds: [projectId1.toString()],
      });

      // Still should NOT create a new version
      expect(unshared.versions).toHaveLength(1);
      expect(unshared.projectIds.map((id) => id.toString())).not.toContain(projectId1.toString());
      expect(unshared.projectIds.map((id) => id.toString())).toContain(projectId2.toString());

      // Regular update without skipVersioning should create a version
      const regularUpdate = await updateAgent(
        { id: agentId },
        { description: 'Updated description' },
      );

      expect(regularUpdate.versions).toHaveLength(2);
      expect(regularUpdate.description).toBe('Updated description');

      // Direct updateAgent with MongoDB operators should still create versions
      const directUpdate = await updateAgent(
        { id: agentId },
        { $addToSet: { projectIds: { $each: [projectId1] } } },
      );

      expect(directUpdate.versions).toHaveLength(3);
      expect(directUpdate.projectIds.length).toBe(2);
    });

    test('should preserve agent_ids in version history', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        agent_ids: ['agent1'],
      });

      await updateAgent({ id: agentId }, { agent_ids: ['agent1', 'agent2'] });

      await updateAgent({ id: agentId }, { agent_ids: ['agent3'] });

      const finalAgent = await getAgent({ id: agentId });

      expect(finalAgent.versions).toHaveLength(3);
      expect(finalAgent.versions[0].agent_ids).toEqual(['agent1']);
      expect(finalAgent.versions[1].agent_ids).toEqual(['agent1', 'agent2']);
      expect(finalAgent.versions[2].agent_ids).toEqual(['agent3']);
      expect(finalAgent.agent_ids).toEqual(['agent3']);
    });

    test('should handle empty agent_ids arrays', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        agent_ids: ['agent1', 'agent2'],
      });

      const updated = await updateAgent({ id: agentId }, { agent_ids: [] });

      expect(updated.versions).toHaveLength(2);
      expect(updated.agent_ids).toEqual([]);

      await expect(updateAgent({ id: agentId }, { agent_ids: [] })).rejects.toThrow(
        'Duplicate version',
      );
    });

    test('should handle agent without agent_ids field', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      const agent = await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      expect(agent.agent_ids).toEqual([]);

      const updated = await updateAgent({ id: agentId }, { agent_ids: ['agent1'] });

      expect(updated.versions).toHaveLength(2);
      expect(updated.agent_ids).toEqual(['agent1']);
    });
  });
});

function createBasicAgent(overrides = {}) {
  const defaults = {
    id: `agent_${uuidv4()}`,
    name: 'Test Agent',
    provider: 'test',
    model: 'test-model',
    author: new mongoose.Types.ObjectId(),
  };
  return createAgent({ ...defaults, ...overrides });
}

function createTestIds() {
  return {
    agentId: `agent_${uuidv4()}`,
    authorId: new mongoose.Types.ObjectId(),
    projectId: new mongoose.Types.ObjectId(),
    fileId: uuidv4(),
  };
}

function createFileOperations(agentId, fileIds, operation = 'add') {
  return fileIds.map((fileId) =>
    operation === 'add'
      ? addAgentResourceFile({ agent_id: agentId, tool_resource: 'test_tool', file_id: fileId })
      : removeAgentResourceFiles({
          agent_id: agentId,
          files: [{ tool_resource: 'test_tool', file_id: fileId }],
        }),
  );
}

function mockFindOneAndUpdateError(errorOnCall = 1) {
  const original = Agent.findOneAndUpdate;
  let callCount = 0;

  Agent.findOneAndUpdate = jest.fn().mockImplementation((...args) => {
    callCount++;
    if (callCount === errorOnCall) {
      throw new Error('Database connection lost');
    }
    return original.apply(Agent, args);
  });

  return () => {
    Agent.findOneAndUpdate = original;
  };
}

function generateVersionTestCases() {
  const projectId1 = new mongoose.Types.ObjectId();
  const projectId2 = new mongoose.Types.ObjectId();

  return [
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
}
