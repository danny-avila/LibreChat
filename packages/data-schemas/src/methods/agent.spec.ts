import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AccessRoleIds,
  ResourceType,
  PrincipalType,
  PrincipalModel,
  EToolResources,
} from 'librechat-data-provider';
import type {
  UpdateWithAggregationPipeline,
  RootFilterQuery,
  QueryOptions,
  UpdateQuery,
} from 'mongoose';
import type { IAgent, IAclEntry, IUser, IAccessRole } from '..';
import { createAgentMethods, type AgentMethods } from './agent';
import { createModels } from '~/models';

/** Version snapshot stored in `IAgent.versions[]`. Extends the base omit with runtime-only fields. */
type VersionEntry = Omit<IAgent, 'versions'> & {
  __v?: number;
  versions?: unknown;
  version?: number;
  updatedBy?: mongoose.Types.ObjectId;
};

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Agent: mongoose.Model<IAgent>;
let AclEntry: mongoose.Model<IAclEntry>;
let User: mongoose.Model<IUser>;
let AccessRole: mongoose.Model<IAccessRole>;
let modelsToCleanup: string[] = [];
let methods: ReturnType<typeof createAgentMethods>;

let createAgent: AgentMethods['createAgent'];
let getAgent: AgentMethods['getAgent'];
let updateAgent: AgentMethods['updateAgent'];
let deleteAgent: AgentMethods['deleteAgent'];
let deleteUserAgents: AgentMethods['deleteUserAgents'];
let revertAgentVersion: AgentMethods['revertAgentVersion'];
let addAgentResourceFile: AgentMethods['addAgentResourceFile'];
let removeAgentResourceFiles: AgentMethods['removeAgentResourceFiles'];
let getListAgentsByAccess: AgentMethods['getListAgentsByAccess'];
let generateActionMetadataHash: AgentMethods['generateActionMetadataHash'];

const getActions = jest.fn().mockResolvedValue([]);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Agent = mongoose.models.Agent as mongoose.Model<IAgent>;
  AclEntry = mongoose.models.AclEntry as mongoose.Model<IAclEntry>;
  User = mongoose.models.User as mongoose.Model<IUser>;
  AccessRole = mongoose.models.AccessRole as mongoose.Model<IAccessRole>;

  const removeAllPermissions = async ({
    resourceType,
    resourceId,
  }: {
    resourceType: string;
    resourceId: unknown;
  }) => {
    await AclEntry.deleteMany({ resourceType, resourceId });
  };

  methods = createAgentMethods(mongoose, { removeAllPermissions, getActions });
  createAgent = methods.createAgent;
  getAgent = methods.getAgent;
  updateAgent = methods.updateAgent;
  deleteAgent = methods.deleteAgent;
  deleteUserAgents = methods.deleteUserAgents;
  revertAgentVersion = methods.revertAgentVersion;
  addAgentResourceFile = methods.addAgentResourceFile;
  removeAgentResourceFiles = methods.removeAgentResourceFiles;
  getListAgentsByAccess = methods.getListAgentsByAccess;
  generateActionMetadataHash = methods.generateActionMetadataHash;

  await mongoose.connect(mongoUri);

  await AccessRole.create({
    accessRoleId: AccessRoleIds.AGENT_OWNER,
    name: 'Owner',
    description: 'Full control over agents',
    resourceType: ResourceType.AGENT,
    permBits: 15,
  });
}, 30000);

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete (mongoose.models as Record<string, unknown>)[modelName];
    }
  }
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Agent Methods', () => {
  describe('Agent Resource File Operations', () => {
    beforeEach(async () => {
      await Agent.deleteMany({});
      await User.deleteMany({});
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

      expect(updatedAgent!.tools).toContain(toolResource);
      expect(Array.isArray(updatedAgent!.tools)).toBe(true);
      // Should not duplicate
      const count = updatedAgent!.tools?.filter((t) => t === toolResource).length ?? 0;
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

      expect(updatedAgent!.tools).toContain(toolResource);
      expect(Array.isArray(updatedAgent!.tools)).toBe(true);
      const count = updatedAgent!.tools?.filter((t) => t === toolResource).length ?? 0;
      expect(count).toBe(1);
    });

    test('should handle concurrent file additions', async () => {
      const agent = await createBasicAgent();
      const fileIds = Array.from({ length: 10 }, () => uuidv4());

      // Concurrent additions
      const additionPromises = createFileOperations(agent.id, fileIds, 'add');

      await Promise.all(additionPromises);

      const updatedAgent = await Agent.findOne({ id: agent.id });
      expect(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).toBeDefined();
      expect(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).toHaveLength(
        10,
      );
      expect(
        new Set(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).size,
      ).toBe(10);
    });

    test('should handle concurrent additions and removals', async () => {
      const agent = await createBasicAgent();
      const initialFileIds = Array.from({ length: 5 }, () => uuidv4());

      await Promise.all(createFileOperations(agent.id, initialFileIds, 'add'));

      const newFileIds = Array.from({ length: 5 }, () => uuidv4());
      const operations: Promise<IAgent>[] = [
        ...newFileIds.map((fileId) =>
          addAgentResourceFile({
            agent_id: agent.id,
            tool_resource: EToolResources.execute_code,
            file_id: fileId,
          }),
        ),
        ...initialFileIds.map((fileId) =>
          removeAgentResourceFiles({
            agent_id: agent.id,
            files: [{ tool_resource: EToolResources.execute_code, file_id: fileId }],
          }),
        ),
      ];

      await Promise.all(operations);

      const updatedAgent = await Agent.findOne({ id: agent.id });
      expect(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).toBeDefined();
      expect(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).toHaveLength(5);
    });

    test('should initialize array when adding to non-existent tool resource', async () => {
      const agent = await createBasicAgent();
      const fileId = uuidv4();

      const updatedAgent = await addAgentResourceFile({
        agent_id: agent.id,
        tool_resource: EToolResources.context,
        file_id: fileId,
      });

      expect(updatedAgent?.tool_resources?.[EToolResources.context]?.file_ids).toBeDefined();
      expect(updatedAgent?.tool_resources?.[EToolResources.context]?.file_ids).toHaveLength(1);
      expect(updatedAgent?.tool_resources?.[EToolResources.context]?.file_ids?.[0]).toBe(fileId);
    });

    test('should handle rapid sequential modifications to same tool resource', async () => {
      const agent = await createBasicAgent();
      const fileId = uuidv4();

      for (let i = 0; i < 10; i++) {
        await addAgentResourceFile({
          agent_id: agent.id,
          tool_resource: EToolResources.execute_code,
          file_id: `${fileId}_${i}`,
        });

        if (i % 2 === 0) {
          await removeAgentResourceFiles({
            agent_id: agent.id,
            files: [{ tool_resource: EToolResources.execute_code, file_id: `${fileId}_${i}` }],
          });
        }
      }

      const updatedAgent = await Agent.findOne({ id: agent.id });
      expect(updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids).toBeDefined();
      expect(
        Array.isArray(updatedAgent!.tool_resources![EToolResources.execute_code]!.file_ids),
      ).toBe(true);
    });

    test('should handle multiple tool resources concurrently', async () => {
      const agent = await createBasicAgent();
      const toolResources = [
        EToolResources.file_search,
        EToolResources.execute_code,
        EToolResources.image_edit,
      ] as const;
      const operations: Promise<IAgent>[] = [];

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
        expect(updatedAgent!.tool_resources![tool]!.file_ids).toBeDefined();
        expect(updatedAgent!.tool_resources![tool]!.file_ids).toHaveLength(5);
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
            tool_resource: EToolResources.execute_code,
            file_id: fileId,
          });
        }

        const promises = Array.from({ length: duplicateCount }).map(() =>
          operation === 'add'
            ? addAgentResourceFile({
                agent_id: agent.id,
                tool_resource: EToolResources.execute_code,
                file_id: fileId,
              })
            : removeAgentResourceFiles({
                agent_id: agent.id,
                files: [{ tool_resource: EToolResources.execute_code, file_id: fileId }],
              }),
        );

        await Promise.all(promises);

        const updatedAgent = await Agent.findOne({ id: agent.id });
        const fileIds = updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];

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
        tool_resource: EToolResources.execute_code,
        file_id: fileId,
      });

      const operations: Promise<IAgent>[] = [
        addAgentResourceFile({
          agent_id: agent.id,
          tool_resource: EToolResources.execute_code,
          file_id: fileId,
        }),
        removeAgentResourceFiles({
          agent_id: agent.id,
          files: [{ tool_resource: EToolResources.execute_code, file_id: fileId }],
        }),
      ];

      await Promise.all(operations);

      const updatedAgent = await Agent.findOne({ id: agent.id });
      const finalFileIds = updatedAgent!.tool_resources![EToolResources.execute_code]!.file_ids!;
      const count = finalFileIds.filter((id: string) => id === fileId).length;

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
            tool_resource: EToolResources.execute_code,
            file_id: fileId,
          }),
        ),
      );

      // Concurrently remove all files
      const removalPromises = fileIds.map((fileId) =>
        removeAgentResourceFiles({
          agent_id: agent.id,
          files: [{ tool_resource: EToolResources.execute_code, file_id: fileId }],
        }),
      );

      await Promise.all(removalPromises);

      const updatedAgent = await Agent.findOne({ id: agent.id });
      // Check if the array is empty or the tool resource itself is removed
      const finalFileIds =
        updatedAgent?.tool_resources?.[EToolResources.execute_code]?.file_ids ?? [];
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
          const agent_id = needsAgent ? agent!.id : `agent_${uuidv4()}`;

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
          files: [] as { tool_resource: string; file_id: string }[],
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
          const agent_id = needsAgent ? agent!.id : `agent_${uuidv4()}`;

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
    beforeEach(async () => {
      await Agent.deleteMany({});
      await User.deleteMany({});
      await AclEntry.deleteMany({});
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
      expect(retrievedAgent!.id).toBe(agentId);
      expect(retrievedAgent!.name).toBe('Test Agent');
      expect(retrievedAgent!.description).toBe('Test description');
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

    test('should remove ACL entries when deleting an agent', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent
      const agent = await createAgent({
        id: agentId,
        name: 'Agent With Permissions',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Grant permissions (simulating sharing)
      await AclEntry.create({
        principalType: PrincipalType.USER,
        principalModel: PrincipalModel.USER,
        principalId: authorId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: authorId,
      });

      // Verify ACL entry exists
      const aclEntriesBefore = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
      });
      expect(aclEntriesBefore).toHaveLength(1);

      // Delete the agent
      await deleteAgent({ id: agentId });

      // Verify agent is deleted
      const agentAfterDelete = await getAgent({ id: agentId });
      expect(agentAfterDelete).toBeNull();

      // Verify ACL entries are removed
      const aclEntriesAfter = await AclEntry.find({
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
      });
      expect(aclEntriesAfter).toHaveLength(0);
    });

    test('should remove handoff edges referencing deleted agent from other agents', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const targetAgentId = `agent_${uuidv4()}`;
      const sourceAgentId = `agent_${uuidv4()}`;

      // Create target agent (handoff destination)
      await createAgent({
        id: targetAgentId,
        name: 'Target Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create source agent with handoff edge to target
      await createAgent({
        id: sourceAgentId,
        name: 'Source Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        edges: [
          {
            from: sourceAgentId,
            to: targetAgentId,
            edgeType: 'handoff',
          },
        ],
      });

      // Verify edge exists before deletion
      const sourceAgentBefore = await getAgent({ id: sourceAgentId });
      expect(sourceAgentBefore!.edges).toHaveLength(1);
      expect(sourceAgentBefore!.edges![0].to).toBe(targetAgentId);

      // Delete the target agent
      await deleteAgent({ id: targetAgentId });

      // Verify the edge is removed from source agent
      const sourceAgentAfter = await getAgent({ id: sourceAgentId });
      expect(sourceAgentAfter!.edges).toHaveLength(0);
    });

    test('should remove agent from user favorites when agent is deleted', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // Create agent
      await createAgent({
        id: agentId,
        name: 'Agent To Delete',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create user with the agent in favorites
      await User.create({
        _id: userId,
        name: 'Test User',
        email: `test-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agentId }, { model: 'gpt-4', endpoint: 'openAI' }],
      });

      // Verify user has agent in favorites
      const userBefore = await User.findById(userId);
      expect(userBefore!.favorites).toHaveLength(2);
      expect(
        userBefore!.favorites!.some((f: Record<string, unknown>) => f.agentId === agentId),
      ).toBe(true);

      // Delete the agent
      await deleteAgent({ id: agentId });

      // Verify agent is deleted
      const agentAfterDelete = await getAgent({ id: agentId });
      expect(agentAfterDelete).toBeNull();

      // Verify agent is removed from user favorites
      const userAfter = await User.findById(userId);
      expect(userAfter!.favorites).toHaveLength(1);
      expect(
        userAfter!.favorites!.some((f: Record<string, unknown>) => f.agentId === agentId),
      ).toBe(false);
      expect(userAfter!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4')).toBe(
        true,
      );
    });

    test('should remove agent from multiple users favorites when agent is deleted', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const user1Id = new mongoose.Types.ObjectId();
      const user2Id = new mongoose.Types.ObjectId();

      // Create agent
      await createAgent({
        id: agentId,
        name: 'Agent To Delete',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create two users with the agent in favorites
      await User.create({
        _id: user1Id,
        name: 'Test User 1',
        email: `test1-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agentId }],
      });

      await User.create({
        _id: user2Id,
        name: 'Test User 2',
        email: `test2-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agentId }, { agentId: `agent_${uuidv4()}` }],
      });

      // Delete the agent
      await deleteAgent({ id: agentId });

      // Verify agent is removed from both users' favorites
      const user1After = await User.findById(user1Id);
      const user2After = await User.findById(user2Id);

      expect(user1After!.favorites).toHaveLength(0);
      expect(user2After!.favorites).toHaveLength(1);
      expect(
        user2After!.favorites!.some((f: Record<string, unknown>) => f.agentId === agentId),
      ).toBe(false);
    });

    test('should preserve other agents in database when one agent is deleted', async () => {
      const agentToDeleteId = `agent_${uuidv4()}`;
      const agentToKeep1Id = `agent_${uuidv4()}`;
      const agentToKeep2Id = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create multiple agents
      await createAgent({
        id: agentToDeleteId,
        name: 'Agent To Delete',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agentToKeep1Id,
        name: 'Agent To Keep 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agentToKeep2Id,
        name: 'Agent To Keep 2',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Verify all agents exist
      expect(await getAgent({ id: agentToDeleteId })).not.toBeNull();
      expect(await getAgent({ id: agentToKeep1Id })).not.toBeNull();
      expect(await getAgent({ id: agentToKeep2Id })).not.toBeNull();

      // Delete one agent
      await deleteAgent({ id: agentToDeleteId });

      // Verify only the deleted agent is removed, others remain intact
      expect(await getAgent({ id: agentToDeleteId })).toBeNull();
      const keptAgent1 = await getAgent({ id: agentToKeep1Id });
      const keptAgent2 = await getAgent({ id: agentToKeep2Id });
      expect(keptAgent1).not.toBeNull();
      expect(keptAgent1!.name).toBe('Agent To Keep 1');
      expect(keptAgent2).not.toBeNull();
      expect(keptAgent2!.name).toBe('Agent To Keep 2');
    });

    test('should preserve other agents in user favorites when one agent is deleted', async () => {
      const agentToDeleteId = `agent_${uuidv4()}`;
      const agentToKeep1Id = `agent_${uuidv4()}`;
      const agentToKeep2Id = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // Create multiple agents
      await createAgent({
        id: agentToDeleteId,
        name: 'Agent To Delete',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agentToKeep1Id,
        name: 'Agent To Keep 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agentToKeep2Id,
        name: 'Agent To Keep 2',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create user with all three agents in favorites
      await User.create({
        _id: userId,
        name: 'Test User',
        email: `test-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [
          { agentId: agentToDeleteId },
          { agentId: agentToKeep1Id },
          { agentId: agentToKeep2Id },
        ],
      });

      // Verify user has all three agents in favorites
      const userBefore = await User.findById(userId);
      expect(userBefore!.favorites).toHaveLength(3);

      // Delete one agent
      await deleteAgent({ id: agentToDeleteId });

      // Verify only the deleted agent is removed from favorites
      const userAfter = await User.findById(userId);
      expect(userAfter!.favorites).toHaveLength(2);
      expect(
        userAfter!.favorites?.some((f: Record<string, unknown>) => f.agentId === agentToDeleteId),
      ).toBe(false);
      expect(
        userAfter!.favorites?.some((f: Record<string, unknown>) => f.agentId === agentToKeep1Id),
      ).toBe(true);
      expect(
        userAfter!.favorites?.some((f: Record<string, unknown>) => f.agentId === agentToKeep2Id),
      ).toBe(true);
    });

    test('should not affect users who do not have deleted agent in favorites', async () => {
      const agentToDeleteId = `agent_${uuidv4()}`;
      const otherAgentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();
      const userWithDeletedAgentId = new mongoose.Types.ObjectId();
      const userWithoutDeletedAgentId = new mongoose.Types.ObjectId();

      // Create agents
      await createAgent({
        id: agentToDeleteId,
        name: 'Agent To Delete',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: otherAgentId,
        name: 'Other Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create user with the agent to be deleted
      await User.create({
        _id: userWithDeletedAgentId,
        name: 'User With Deleted Agent',
        email: `user1-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agentToDeleteId }, { model: 'gpt-4', endpoint: 'openAI' }],
      });

      // Create user without the agent to be deleted
      await User.create({
        _id: userWithoutDeletedAgentId,
        name: 'User Without Deleted Agent',
        email: `user2-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: otherAgentId }, { model: 'claude-3', endpoint: 'anthropic' }],
      });

      // Delete the agent
      await deleteAgent({ id: agentToDeleteId });

      // Verify user with deleted agent has it removed
      const userWithDeleted = await User.findById(userWithDeletedAgentId);
      expect(userWithDeleted!.favorites).toHaveLength(1);
      expect(
        userWithDeleted!.favorites!.some(
          (f: Record<string, unknown>) => f.agentId === agentToDeleteId,
        ),
      ).toBe(false);
      expect(
        userWithDeleted!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4'),
      ).toBe(true);

      // Verify user without deleted agent is completely unaffected
      const userWithoutDeleted = await User.findById(userWithoutDeletedAgentId);
      expect(userWithoutDeleted!.favorites).toHaveLength(2);
      expect(
        userWithoutDeleted!.favorites!.some(
          (f: Record<string, unknown>) => f.agentId === otherAgentId,
        ),
      ).toBe(true);
      expect(
        userWithoutDeleted!.favorites!.some((f: Record<string, unknown>) => f.model === 'claude-3'),
      ).toBe(true);
    });

    test('should remove all user agents from favorites when deleteUserAgents is called', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const otherAuthorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const agent1Id = `agent_${uuidv4()}`;
      const agent2Id = `agent_${uuidv4()}`;
      const otherAuthorAgentId = `agent_${uuidv4()}`;

      // Create agents by the author to be deleted
      await createAgent({
        id: agent1Id,
        name: 'Author Agent 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agent2Id,
        name: 'Author Agent 2',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create agent by different author (should not be deleted)
      await createAgent({
        id: otherAuthorAgentId,
        name: 'Other Author Agent',
        provider: 'test',
        model: 'test-model',
        author: otherAuthorId,
      });

      // Create user with all agents in favorites
      await User.create({
        _id: userId,
        name: 'Test User',
        email: `test-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [
          { agentId: agent1Id },
          { agentId: agent2Id },
          { agentId: otherAuthorAgentId },
          { model: 'gpt-4', endpoint: 'openAI' },
        ],
      });

      // Verify user has all favorites
      const userBefore = await User.findById(userId);
      expect(userBefore!.favorites).toHaveLength(4);

      // Delete all agents by the author
      await deleteUserAgents(authorId.toString());

      // Verify author's agents are deleted from database
      expect(await getAgent({ id: agent1Id })).toBeNull();
      expect(await getAgent({ id: agent2Id })).toBeNull();

      // Verify other author's agent still exists
      expect(await getAgent({ id: otherAuthorAgentId })).not.toBeNull();

      // Verify user favorites: author's agents removed, others remain
      const userAfter = await User.findById(userId);
      expect(userAfter!.favorites).toHaveLength(2);
      expect(
        userAfter!.favorites!.some((f: Record<string, unknown>) => f.agentId === agent1Id),
      ).toBe(false);
      expect(
        userAfter!.favorites!.some((f: Record<string, unknown>) => f.agentId === agent2Id),
      ).toBe(false);
      expect(
        userAfter!.favorites!.some(
          (f: Record<string, unknown>) => f.agentId === otherAuthorAgentId,
        ),
      ).toBe(true);
      expect(userAfter!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4')).toBe(
        true,
      );
    });

    test('should handle deleteUserAgents when agents are in multiple users favorites', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const user1Id = new mongoose.Types.ObjectId();
      const user2Id = new mongoose.Types.ObjectId();
      const user3Id = new mongoose.Types.ObjectId();

      const agent1Id = `agent_${uuidv4()}`;
      const agent2Id = `agent_${uuidv4()}`;
      const unrelatedAgentId = `agent_${uuidv4()}`;

      // Create agents by the author
      await createAgent({
        id: agent1Id,
        name: 'Author Agent 1',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      await createAgent({
        id: agent2Id,
        name: 'Author Agent 2',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Create users with various favorites configurations
      await User.create({
        _id: user1Id,
        name: 'User 1',
        email: `user1-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agent1Id }, { agentId: agent2Id }],
      });

      await User.create({
        _id: user2Id,
        name: 'User 2',
        email: `user2-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: agent1Id }, { model: 'claude-3', endpoint: 'anthropic' }],
      });

      await User.create({
        _id: user3Id,
        name: 'User 3',
        email: `user3-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: unrelatedAgentId }, { model: 'gpt-4', endpoint: 'openAI' }],
      });

      // Delete all agents by the author
      await deleteUserAgents(authorId.toString());

      // Verify all users' favorites are correctly updated
      const user1After = await User.findById(user1Id);
      expect(user1After!.favorites).toHaveLength(0);

      const user2After = await User.findById(user2Id);
      expect(user2After!.favorites).toHaveLength(1);
      expect(
        user2After!.favorites!.some((f: Record<string, unknown>) => f.agentId === agent1Id),
      ).toBe(false);
      expect(
        user2After!.favorites!.some((f: Record<string, unknown>) => f.model === 'claude-3'),
      ).toBe(true);

      // User 3 should be completely unaffected
      const user3After = await User.findById(user3Id);
      expect(user3After!.favorites).toHaveLength(2);
      expect(
        user3After!.favorites!.some((f: Record<string, unknown>) => f.agentId === unrelatedAgentId),
      ).toBe(true);
      expect(user3After!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4')).toBe(
        true,
      );
    });

    test('should handle deleteUserAgents when user has no agents', async () => {
      const authorWithNoAgentsId = new mongoose.Types.ObjectId();
      const otherAuthorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const existingAgentId = `agent_${uuidv4()}`;

      // Create agent by different author
      await createAgent({
        id: existingAgentId,
        name: 'Existing Agent',
        provider: 'test',
        model: 'test-model',
        author: otherAuthorId,
      });

      // Create user with favorites
      await User.create({
        _id: userId,
        name: 'Test User',
        email: `test-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ agentId: existingAgentId }, { model: 'gpt-4', endpoint: 'openAI' }],
      });

      // Delete agents for user with no agents (should be a no-op)
      await deleteUserAgents(authorWithNoAgentsId.toString());

      // Verify existing agent still exists
      expect(await getAgent({ id: existingAgentId })).not.toBeNull();

      // Verify user favorites are unchanged
      const userAfter = await User.findById(userId);
      expect(userAfter!.favorites).toHaveLength(2);
      expect(
        userAfter!.favorites!.some((f: Record<string, unknown>) => f.agentId === existingAgentId),
      ).toBe(true);
      expect(userAfter!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4')).toBe(
        true,
      );
    });

    test('should handle deleteUserAgents when agents are not in any favorites', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const agent1Id = `agent_${uuidv4()}`;
      const agent2Id = `agent_${uuidv4()}`;

      // Create agents by the author
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

      // Create user with favorites that don't include these agents
      await User.create({
        _id: userId,
        name: 'Test User',
        email: `test-${uuidv4()}@example.com`,
        provider: 'local',
        favorites: [{ model: 'gpt-4', endpoint: 'openAI' }],
      });

      // Verify agents exist
      expect(await getAgent({ id: agent1Id })).not.toBeNull();
      expect(await getAgent({ id: agent2Id })).not.toBeNull();

      // Delete all agents by the author
      await deleteUserAgents(authorId.toString());

      // Verify agents are deleted
      expect(await getAgent({ id: agent1Id })).toBeNull();
      expect(await getAgent({ id: agent2Id })).toBeNull();

      // Verify user favorites are unchanged
      const userAfter = await User.findById(userId);
      expect(userAfter!.favorites).toHaveLength(1);
      expect(userAfter!.favorites!.some((f: Record<string, unknown>) => f.model === 'gpt-4')).toBe(
        true,
      );
    });

    describe('Edge Cases', () => {
      test.each([
        {
          name: 'getAgent with undefined search parameters',
          fn: () => getAgent(undefined as unknown as Parameters<typeof getAgent>[0]),
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
    });
  });

  describe('Agent Version History', () => {
    beforeEach(async () => {
      await Agent.deleteMany({});
    });

    test('should create an agent with a single entry in versions array', async () => {
      const agent = await createBasicAgent();

      expect(agent!.versions).toBeDefined();
      expect(Array.isArray(agent.versions)).toBe(true);
      expect(agent!.versions).toHaveLength(1);
      expect(agent!.versions![0].name).toBe('Test Agent');
      expect(agent!.versions![0].provider).toBe('test');
      expect(agent!.versions![0].model).toBe('test-model');
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

      expect(finalAgent!.versions).toBeDefined();
      expect(Array.isArray(finalAgent!.versions)).toBe(true);
      expect(finalAgent!.versions).toHaveLength(4);

      expect(finalAgent!.versions![0].name).toBe('First Name');
      expect(finalAgent!.versions![0].description).toBe('First description');
      expect(finalAgent!.versions![0].model).toBe('test-model');

      expect(finalAgent!.versions![1].name).toBe('Second Name');
      expect(finalAgent!.versions![1].description).toBe('Second description');
      expect(finalAgent!.versions![1].model).toBe('test-model');

      expect(finalAgent!.versions![2].name).toBe('Third Name');
      expect(finalAgent!.versions![2].description).toBe('Second description');
      expect(finalAgent!.versions![2].model).toBe('new-model');

      expect(finalAgent!.versions![3].name).toBe('Third Name');
      expect(finalAgent!.versions![3].description).toBe('Final description');
      expect(finalAgent!.versions![3].model).toBe('new-model');

      expect(finalAgent!.name).toBe('Third Name');
      expect(finalAgent!.description).toBe('Final description');
      expect(finalAgent!.model).toBe('new-model');
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

      expect(updatedAgent!.versions).toHaveLength(2);
      expect(updatedAgent!.versions![0]._id).toBeUndefined();
      expect((updatedAgent!.versions![0] as VersionEntry).__v).toBeUndefined();
      expect(updatedAgent!.versions![0].name).toBe('Test Agent');
      expect(updatedAgent!.versions![0].author).toBeUndefined();

      expect(updatedAgent!.versions![1]._id).toBeUndefined();
      expect((updatedAgent!.versions![1] as VersionEntry).__v).toBeUndefined();
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

      expect(finalAgent!.versions).toHaveLength(4);

      finalAgent!.versions!.forEach((version) => {
        expect((version as VersionEntry).versions).toBeUndefined();
      });
    });

    test('should handle MongoDB operators and field updates correctly', async () => {
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
          description: 'Updated description',
          $push: { tools: 'tool2' },
        },
      );

      const firstUpdate = await getAgent({ id: agentId });
      expect(firstUpdate!.description).toBe('Updated description');
      expect(firstUpdate!.tools).toContain('tool1');
      expect(firstUpdate!.tools).toContain('tool2');
      expect(firstUpdate!.versions).toHaveLength(2);

      await updateAgent(
        { id: agentId },
        {
          tools: ['tool2', 'tool3'],
        },
      );

      const secondUpdate = await getAgent({ id: agentId });
      expect(secondUpdate!.tools).toHaveLength(2);
      expect(secondUpdate!.tools).toContain('tool2');
      expect(secondUpdate!.tools).toContain('tool3');
      expect(secondUpdate!.tools).not.toContain('tool1');
      expect(secondUpdate!.versions).toHaveLength(3);

      await updateAgent(
        { id: agentId },
        {
          $push: { tools: 'tool3' },
        },
      );

      const thirdUpdate = await getAgent({ id: agentId });
      const toolCount = thirdUpdate!.tools!.filter((t) => t === 'tool3').length;
      expect(toolCount).toBe(2);
      expect(thirdUpdate!.versions).toHaveLength(4);
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

      expect(updatedAgent!.versions).toHaveLength(2);
      expect(updatedAgent!.model_parameters?.temperature).toBe(0.8);

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
      expect(complexAgent!.versions).toHaveLength(3);
      expect(complexAgent!.model_parameters?.temperature).toBe(0.8);
      expect(complexAgent!.model_parameters?.max_tokens).toBe(1000);

      await updateAgent({ id: agentId }, { model_parameters: {} });

      const emptyParamsAgent = await getAgent({ id: agentId });
      expect(emptyParamsAgent!.versions).toHaveLength(4);
      expect(emptyParamsAgent!.model_parameters).toEqual({});
    });

    test('should not create new version for duplicate updates', async () => {
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

        const updatedAgent = await updateAgent({ id: testAgentId }, testCase.update);
        expect(updatedAgent!.versions).toHaveLength(2); // No new version created

        // Update with duplicate data should succeed but not create a new version
        const duplicateUpdate = await updateAgent({ id: testAgentId }, testCase.duplicate);

        expect(duplicateUpdate!.versions).toHaveLength(2); // No new version created

        const agent = await getAgent({ id: testAgentId });
        expect(agent!.versions).toHaveLength(2);
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

      expect(updatedAgent!.versions).toHaveLength(2);
      expect((updatedAgent!.versions![1] as VersionEntry)?.updatedBy?.toString()).toBe(
        updatingUser.toString(),
      );
      expect(updatedAgent!.author.toString()).toBe(originalAuthor.toString());
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

      expect(updatedAgent!.versions).toHaveLength(2);
      expect((updatedAgent!.versions![1] as VersionEntry)?.updatedBy?.toString()).toBe(
        originalAuthor.toString(),
      );
      expect(updatedAgent!.author.toString()).toBe(originalAuthor.toString());
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

      expect(finalAgent!.versions).toHaveLength(5);
      expect(finalAgent!.author.toString()).toBe(originalAuthor.toString());

      // Check that each version has the correct updatedBy
      const versions = finalAgent!.versions! as VersionEntry[];
      expect(versions[0]?.updatedBy).toBeUndefined(); // Initial creation has no updatedBy
      expect(versions[1]?.updatedBy?.toString()).toBe(user1.toString());
      expect(versions[2]?.updatedBy?.toString()).toBe(originalAuthor.toString());
      expect(versions[3]?.updatedBy?.toString()).toBe(user2.toString());
      expect(versions[4]?.updatedBy?.toString()).toBe(user3.toString());

      // Verify the final state
      expect(finalAgent!.name).toBe('Updated by User 2');
      expect(finalAgent!.description).toBe('Final update by User 3');
      expect(finalAgent!.model).toBe('new-model');
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

      expect(firstUpdate!.versions).toHaveLength(2);

      // Second update with same data but forceVersion should still create a version
      const secondUpdate = await updateAgent(
        { id: agentId },
        { tools: ['listEvents_action_test.com', 'createEvent_action_test.com'] },
        { updatingUserId: authorId.toString(), forceVersion: true },
      );

      expect(secondUpdate!.versions).toHaveLength(3);

      // Update without forceVersion and no changes should not create a version
      const duplicateUpdate = await updateAgent(
        { id: agentId },
        { tools: ['listEvents_action_test.com', 'createEvent_action_test.com'] },
        { updatingUserId: authorId.toString(), forceVersion: false },
      );

      expect(duplicateUpdate!.versions).toHaveLength(3); // No new version created
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

      expect(updatedAgent!.versions).toHaveLength(2);
      expect(updatedAgent!.tools).toEqual(['tool1', 'tool2']);
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
      expect(updatedAgent!.versions).toHaveLength(2);
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
      expect(updatedAgent!.versions).toHaveLength(2);
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
      expect(agent!.versions).toHaveLength(3);
    });

    test('should handle version comparison with special field types', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        model_parameters: { temperature: 0.7 },
      });

      // Update with a real field change first
      const firstUpdate = await updateAgent({ id: agentId }, { description: 'New description' });

      expect(firstUpdate!.versions).toHaveLength(2);

      // Update with model parameters change
      const secondUpdate = await updateAgent(
        { id: agentId },
        { model_parameters: { temperature: 0.8 } },
      );

      expect(secondUpdate!.versions).toHaveLength(3);
    });

    test('should detect changes in support_contact fields', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent with initial support_contact
      await createAgent({
        id: agentId,
        name: 'Agent with Support Contact',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        support_contact: {
          name: 'Initial Support',
          email: 'initial@support.com',
        },
      });

      // Update support_contact name only
      const firstUpdate = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Updated Support',
            email: 'initial@support.com',
          },
        },
      );

      expect(firstUpdate!.versions).toHaveLength(2);
      expect(firstUpdate!.support_contact?.name).toBe('Updated Support');
      expect(firstUpdate!.support_contact?.email).toBe('initial@support.com');

      // Update support_contact email only
      const secondUpdate = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Updated Support',
            email: 'updated@support.com',
          },
        },
      );

      expect(secondUpdate!.versions).toHaveLength(3);
      expect(secondUpdate!.support_contact?.email).toBe('updated@support.com');

      // Try to update with same support_contact - should be detected as duplicate but return successfully
      const duplicateUpdate = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Updated Support',
            email: 'updated@support.com',
          },
        },
      );

      // Should not create a new version
      expect(duplicateUpdate?.versions).toHaveLength(3);
      expect((duplicateUpdate as IAgent & { version?: number })?.version).toBe(3);
      expect(duplicateUpdate?.support_contact?.email).toBe('updated@support.com');
    });

    test('should handle support_contact from empty to populated', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent without support_contact
      const agent = await createAgent({
        id: agentId,
        name: 'Agent without Support',
        provider: 'test',
        model: 'test-model',
        author: authorId,
      });

      // Verify support_contact is undefined since it wasn't provided
      expect(agent.support_contact).toBeUndefined();

      // Update to add support_contact
      const updated = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'New Support Team',
            email: 'support@example.com',
          },
        },
      );

      expect(updated?.versions).toHaveLength(2);
      expect(updated?.support_contact?.name).toBe('New Support Team');
      expect(updated?.support_contact?.email).toBe('support@example.com');
    });

    test('should handle support_contact edge cases in isDuplicateVersion', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent with support_contact
      await createAgent({
        id: agentId,
        name: 'Edge Case Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        support_contact: {
          name: 'Support',
          email: 'support@test.com',
        },
      });

      // Update to empty support_contact
      const emptyUpdate = await updateAgent(
        { id: agentId },
        {
          support_contact: {},
        },
      );

      expect(emptyUpdate?.versions).toHaveLength(2);
      expect(emptyUpdate?.support_contact).toEqual({});

      // Update back to populated support_contact
      const repopulated = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Support',
            email: 'support@test.com',
          },
        },
      );

      expect(repopulated?.versions).toHaveLength(3);

      // Verify all versions have correct support_contact
      const finalAgent = await getAgent({ id: agentId });
      expect(finalAgent!.versions![0]?.support_contact).toEqual({
        name: 'Support',
        email: 'support@test.com',
      });
      expect(finalAgent!.versions![1]?.support_contact).toEqual({});
      expect(finalAgent!.versions![2]?.support_contact).toEqual({
        name: 'Support',
        email: 'support@test.com',
      });
    });

    test('should preserve support_contact in version history', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent
      await createAgent({
        id: agentId,
        name: 'Version History Test',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        support_contact: {
          name: 'Initial Contact',
          email: 'initial@test.com',
        },
      });

      // Multiple updates with different support_contact values
      await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Second Contact',
            email: 'second@test.com',
          },
        },
      );

      await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'Third Contact',
            email: 'third@test.com',
          },
        },
      );

      const finalAgent = await getAgent({ id: agentId });

      // Verify version history
      expect(finalAgent!.versions).toHaveLength(3);
      expect(finalAgent!.versions![0]?.support_contact).toEqual({
        name: 'Initial Contact',
        email: 'initial@test.com',
      });
      expect(finalAgent!.versions![1]?.support_contact).toEqual({
        name: 'Second Contact',
        email: 'second@test.com',
      });
      expect(finalAgent!.versions![2]?.support_contact).toEqual({
        name: 'Third Contact',
        email: 'third@test.com',
      });

      // Current state should match last version
      expect(finalAgent!.support_contact).toEqual({
        name: 'Third Contact',
        email: 'third@test.com',
      });
    });

    test('should handle partial support_contact updates', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

      // Create agent with full support_contact
      await createAgent({
        id: agentId,
        name: 'Partial Update Test',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        support_contact: {
          name: 'Original Name',
          email: 'original@email.com',
        },
      });

      // MongoDB's findOneAndUpdate will replace the entire support_contact object
      // So we need to verify that partial updates still work correctly
      const updated = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'New Name',
            email: '', // Empty email
          },
        },
      );

      expect(updated?.versions).toHaveLength(2);
      expect(updated?.support_contact?.name).toBe('New Name');
      expect(updated?.support_contact?.email).toBe('');

      // Verify isDuplicateVersion works with partial changes - should return successfully without creating new version
      const duplicateUpdate = await updateAgent(
        { id: agentId },
        {
          support_contact: {
            name: 'New Name',
            email: '',
          },
        },
      );

      // Should not create a new version since content is the same
      expect(duplicateUpdate?.versions).toHaveLength(2);
      expect((duplicateUpdate as IAgent & { version?: number })?.version).toBe(2);
      expect(duplicateUpdate?.support_contact?.name).toBe('New Name');
      expect(duplicateUpdate?.support_contact?.email).toBe('');
    });

    // Edge Cases
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
        const agent_id = needsAgent ? agent!.id : `agent_${uuidv4()}`;

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
        const agent_id = needsAgent ? agent!.id : `agent_${uuidv4()}`;

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
        expect(agent!.versions).toHaveLength(21);
        expect(agent!.description).toBe('Version 19');
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
        expect(updatedAgent!.name).toBe('Test Agent');
        expect(updatedAgent!.versions).toHaveLength(1);
      });
    });
  });

  describe('Action Metadata and Hash Generation', () => {
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

  /* Load Agent Functionality tests moved to api/models/Agent.spec.js */

  describe('Agent Edge Cases and Error Handling', () => {
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
      expect(agent.versions![0]?.provider).toBe('test');
      expect(agent.versions![0]?.model).toBe('test-model');
    });

    test('should handle agent creation with all optional fields', async () => {
      const agentId = `agent_${uuidv4()}`;
      const authorId = new mongoose.Types.ObjectId();

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
        avatar: 'https://example.com/avatar.png',
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
      expect(agent.model_parameters?.temperature).toBe(0.8);
      expect(agent.model_parameters?.max_tokens).toBe(1000);
      expect(agent.avatar).toBe('https://example.com/avatar.png');
      expect(agent.tool_resources?.file_search?.file_ids).toEqual(['file1', 'file2']);
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
      expect(updatedAgent!.name).toBe('Test Agent');
      expect(updatedAgent!.versions).toHaveLength(1); // No new version should be created
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

      expect(updated1?.description).toBe('Updated Agent 1');
      expect(updated2?.description).toBe('Updated Agent 2');
      expect(updated1?.versions).toHaveLength(2);
      expect(updated2?.versions).toHaveLength(2);
    });

    test('should handle agent deletion with non-existent ID', async () => {
      const nonExistentId = `agent_${uuidv4()}`;
      const result = await deleteAgent({ id: nonExistentId });

      expect(result).toBeNull();
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

      expect(updatedAgent!.name).toBe('Updated Name');
      expect(updatedAgent!.tools).toContain('tool1');
      expect(updatedAgent!.tools).toContain('tool2');
      expect(updatedAgent!.versions).toHaveLength(2);
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

      await expect(
        addAgentResourceFile({
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

      expect(firstUpdate!.tools).toContain('tool1');
      expect(firstUpdate!.tools).toContain('tool2');

      // Second update with direct field update and $addToSet
      const secondUpdate = await updateAgent(
        { id: agentId },
        {
          name: 'Updated Agent',
          model_parameters: { temperature: 0.8, max_tokens: 500 },
          $addToSet: { tools: 'tool3' },
        },
      );

      expect(secondUpdate!.name).toBe('Updated Agent');
      expect(secondUpdate!.model_parameters?.temperature).toBe(0.8);
      expect(secondUpdate!.model_parameters?.max_tokens).toBe(500);
      expect(secondUpdate!.tools).toContain('tool1');
      expect(secondUpdate!.tools).toContain('tool2');
      expect(secondUpdate!.tools).toContain('tool3');
      expect(secondUpdate!.versions).toHaveLength(3);
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

      expect(finalAgent!.versions).toHaveLength(4);
      expect(finalAgent!.versions![0]?.name).toBe('Version 1');
      expect(finalAgent!.versions![1]?.name).toBe('Version 2');
      expect(finalAgent!.versions![2]?.name).toBe('Version 3');
      expect(finalAgent!.versions![3]?.name).toBe('Version 4');
      expect(finalAgent!.name).toBe('Version 4');
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
      expect(updatedAgent!.description).toBe('Updated description');
      expect(updatedAgent!.versions).toHaveLength(2);
    });

    test('should handle updateAgent with combined MongoDB operators', async () => {
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

      // Use multiple operators in single update - but avoid conflicting operations on same field
      const updatedAgent = await updateAgent(
        { id: agentId },
        {
          name: 'Updated Name',
          $push: { tools: 'tool2' },
        },
      );

      expect(updatedAgent).toBeDefined();
      expect(updatedAgent!.name).toBe('Updated Name');
      expect(updatedAgent!.tools).toContain('tool1');
      expect(updatedAgent!.tools).toContain('tool2');
      expect(updatedAgent!.versions).toHaveLength(2);
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
        return originalUpdateOne.apply(
          Agent,
          args as [update: UpdateQuery<IAgent> | UpdateWithAggregationPipeline],
        );
      });

      try {
        const result = await addAgentResourceFile({
          agent_id: agentId,
          tool_resource: 'new_tool',
          file_id: 'file123',
        });

        expect(result).toBeDefined();
        expect(result.tools).toContain('new_tool');
      } catch (error: unknown) {
        expect((error as Error).message).toBe('Database error');
      }

      Agent.updateOne = originalUpdateOne;
    });
  });

  describe('Agent IDs Field in Version Detection', () => {
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
      expect(updated?.versions).toHaveLength(2);
      expect(updated?.agent_ids).toEqual(['agent1', 'agent2', 'agent3']);
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

      const updatedAgent = await updateAgent(
        { id: agentId },
        { agent_ids: ['agent1', 'agent2', 'agent3'] },
      );
      expect(updatedAgent!.versions).toHaveLength(2);

      // Update with same agent_ids should succeed but not create a new version
      const duplicateUpdate = await updateAgent(
        { id: agentId },
        { agent_ids: ['agent1', 'agent2', 'agent3'] },
      );
      expect(duplicateUpdate?.versions).toHaveLength(2); // No new version created
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

      expect(updated?.versions).toHaveLength(2);
      expect(updated?.agent_ids).toEqual(['agent1', 'agent2']);
      expect(updated?.description).toBe('Updated description');

      const updated2 = await updateAgent({ id: agentId }, { description: 'Another description' });

      expect(updated2?.versions).toHaveLength(3);
      expect(updated2?.agent_ids).toEqual(['agent1', 'agent2']);
      expect(updated2?.description).toBe('Another description');
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

      expect(finalAgent!.versions).toHaveLength(3);
      expect(finalAgent!.versions![0]?.agent_ids).toEqual(['agent1']);
      expect(finalAgent!.versions![1]?.agent_ids).toEqual(['agent1', 'agent2']);
      expect(finalAgent!.versions![2]?.agent_ids).toEqual(['agent3']);
      expect(finalAgent!.agent_ids).toEqual(['agent3']);
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

      expect(updated?.versions).toHaveLength(2);
      expect(updated?.agent_ids).toEqual([]);

      // Update with same empty agent_ids should succeed but not create a new version
      const duplicateUpdate = await updateAgent({ id: agentId }, { agent_ids: [] });
      expect(duplicateUpdate?.versions).toHaveLength(2); // No new version created
      expect(duplicateUpdate?.agent_ids).toEqual([]);
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

      expect(updated?.versions).toHaveLength(2);
      expect(updated?.agent_ids).toEqual(['agent1']);
    });
  });
});

describe('Support Contact Field', () => {
  beforeEach(async () => {
    await Agent.deleteMany({});
  });

  it('should not create subdocument with ObjectId for support_contact', async () => {
    const userId = new mongoose.Types.ObjectId();
    const agentData = {
      id: 'agent_test_support',
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: userId,
      support_contact: {
        name: 'Support Team',
        email: 'support@example.com',
      },
    };

    // Create agent
    const agent = await createAgent(agentData);

    // Verify support_contact is stored correctly
    expect(agent.support_contact).toBeDefined();
    expect(agent.support_contact?.name).toBe('Support Team');
    expect(agent.support_contact?.email).toBe('support@example.com');

    // Verify no _id field is created in support_contact
    expect((agent.support_contact as Record<string, unknown>)?._id).toBeUndefined();

    // Fetch from database to double-check
    const dbAgent = await Agent.findOne({ id: agentData.id });
    expect(dbAgent?.support_contact).toBeDefined();
    expect(dbAgent?.support_contact?.name).toBe('Support Team');
    expect(dbAgent?.support_contact?.email).toBe('support@example.com');
    expect((dbAgent?.support_contact as Record<string, unknown>)?._id).toBeUndefined();
  });

  it('should handle empty support_contact correctly', async () => {
    const userId = new mongoose.Types.ObjectId();
    const agentData = {
      id: 'agent_test_empty_support',
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: userId,
      support_contact: {},
    };

    const agent = await createAgent(agentData);

    // Verify empty support_contact is stored as empty object
    expect(agent.support_contact).toEqual({});
    expect((agent.support_contact as Record<string, unknown>)?._id).toBeUndefined();
  });

  it('should handle missing support_contact correctly', async () => {
    const userId = new mongoose.Types.ObjectId();
    const agentData = {
      id: 'agent_test_no_support',
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: userId,
    };

    const agent = await createAgent(agentData);

    // Verify support_contact is undefined when not provided
    expect(agent.support_contact).toBeUndefined();
  });

  describe('getListAgentsByAccess - Security Tests', () => {
    let userA: mongoose.Types.ObjectId, userB: mongoose.Types.ObjectId;
    let agentA1: Awaited<ReturnType<AgentMethods['createAgent']>>,
      agentA2: Awaited<ReturnType<AgentMethods['createAgent']>>,
      agentA3: Awaited<ReturnType<AgentMethods['createAgent']>>;

    beforeEach(async () => {
      await Agent.deleteMany({});
      await AclEntry.deleteMany({});

      // Create two users
      userA = new mongoose.Types.ObjectId();
      userB = new mongoose.Types.ObjectId();

      // Create agents for user A
      agentA1 = await createAgent({
        id: `agent_${uuidv4().slice(0, 12)}`,
        name: 'Agent A1',
        description: 'User A agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
      });

      agentA2 = await createAgent({
        id: `agent_${uuidv4().slice(0, 12)}`,
        name: 'Agent A2',
        description: 'User A agent 2',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
      });

      agentA3 = await createAgent({
        id: `agent_${uuidv4().slice(0, 12)}`,
        name: 'Agent A3',
        description: 'User A agent 3',
        provider: 'openai',
        model: 'gpt-4',
        author: userA,
      });
    });

    test('should return empty list when user has no accessible agents (empty accessibleIds)', async () => {
      // User B has no agents and no shared agents
      const result = await getListAgentsByAccess({
        accessibleIds: [],
        otherParams: {},
      });

      expect(result.data).toHaveLength(0);
      expect(result.has_more).toBe(false);
      expect(result.first_id).toBeNull();
      expect(result.last_id).toBeNull();
    });

    test('should not return other users agents when accessibleIds is empty', async () => {
      // User B trying to list agents with empty accessibleIds should not see User A's agents
      const result = await getListAgentsByAccess({
        accessibleIds: [],
        otherParams: { author: userB },
      });

      expect(result.data).toHaveLength(0);
      expect(result.has_more).toBe(false);
    });

    test('should only return agents in accessibleIds list', async () => {
      // Give User B access to only one of User A's agents
      const accessibleIds = [agentA1._id] as mongoose.Types.ObjectId[];

      const result = await getListAgentsByAccess({
        accessibleIds,
        otherParams: {},
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(agentA1.id);
      expect(result.data[0].name).toBe('Agent A1');
    });

    test('should return multiple accessible agents when provided', async () => {
      // Give User B access to two of User A's agents
      const accessibleIds = [agentA1._id, agentA3._id] as mongoose.Types.ObjectId[];

      const result = await getListAgentsByAccess({
        accessibleIds,
        otherParams: {},
      });

      expect(result.data).toHaveLength(2);
      const returnedIds = result.data.map((agent) => agent.id);
      expect(returnedIds).toContain(agentA1.id);
      expect(returnedIds).toContain(agentA3.id);
      expect(returnedIds).not.toContain(agentA2.id);
    });

    test('should respect other query parameters while enforcing accessibleIds', async () => {
      // Give access to all agents but filter by name
      const accessibleIds = [agentA1._id, agentA2._id, agentA3._id] as mongoose.Types.ObjectId[];

      const result = await getListAgentsByAccess({
        accessibleIds,
        otherParams: { name: 'Agent A2' },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(agentA2.id);
    });

    test('should handle pagination correctly with accessibleIds filter', async () => {
      // Create more agents
      const moreAgents = [];
      for (let i = 4; i <= 10; i++) {
        const agent = await createAgent({
          id: `agent_${uuidv4().slice(0, 12)}`,
          name: `Agent A${i}`,
          description: `User A agent ${i}`,
          provider: 'openai',
          model: 'gpt-4',
          author: userA,
        });
        moreAgents.push(agent);
      }

      // Give access to all agents
      const allAgentIds = [agentA1, agentA2, agentA3, ...moreAgents].map(
        (a) => a._id,
      ) as mongoose.Types.ObjectId[];

      // First page
      const page1 = await getListAgentsByAccess({
        accessibleIds: allAgentIds,
        otherParams: {},
        limit: 5,
      });

      expect(page1.data).toHaveLength(5);
      expect(page1.has_more).toBe(true);
      expect(page1.after).toBeTruthy();

      // Second page
      const page2 = await getListAgentsByAccess({
        accessibleIds: allAgentIds,
        otherParams: {},
        limit: 5,
        after: page1.after,
      });

      expect(page2.data).toHaveLength(5);
      expect(page2.has_more).toBe(false);

      // Verify no overlap between pages
      const page1Ids = page1.data.map((a) => a.id);
      const page2Ids = page2.data.map((a) => a.id);
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      expect(intersection).toHaveLength(0);
    });

    test('should return empty list when accessibleIds contains non-existent IDs', async () => {
      // Try with non-existent agent IDs
      const fakeIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

      const result = await getListAgentsByAccess({
        accessibleIds: fakeIds,
        otherParams: {},
      });

      expect(result.data).toHaveLength(0);
      expect(result.has_more).toBe(false);
    });

    test('should handle undefined accessibleIds as empty array', async () => {
      // When accessibleIds is undefined, it should be treated as empty array
      const result = await getListAgentsByAccess({
        accessibleIds: undefined,
        otherParams: {},
      });

      expect(result.data).toHaveLength(0);
      expect(result.has_more).toBe(false);
    });

    test('should combine accessibleIds with author filter correctly', async () => {
      // Create an agent for User B
      const agentB1 = await createAgent({
        id: `agent_${uuidv4().slice(0, 12)}`,
        name: 'Agent B1',
        description: 'User B agent 1',
        provider: 'openai',
        model: 'gpt-4',
        author: userB,
      });

      // Give User B access to one of User A's agents
      const accessibleIds = [agentA1._id, agentB1._id] as mongoose.Types.ObjectId[];

      // Filter by author should further restrict the results
      const result = await getListAgentsByAccess({
        accessibleIds,
        otherParams: { author: userB },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(agentB1.id);
      expect(result.data[0].author).toBe(userB.toString());
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
    fileId: uuidv4(),
  };
}

function createFileOperations(agentId: string, fileIds: string[], operation = 'add') {
  return fileIds.map((fileId) =>
    operation === 'add'
      ? addAgentResourceFile({
          agent_id: agentId,
          tool_resource: EToolResources.execute_code,
          file_id: fileId,
        })
      : removeAgentResourceFiles({
          agent_id: agentId,
          files: [{ tool_resource: EToolResources.execute_code, file_id: fileId }],
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
    return original.apply(
      Agent,
      args as [
        filter?: RootFilterQuery<IAgent> | undefined,
        update?: UpdateQuery<IAgent> | undefined,
        options?: QueryOptions<IAgent> | null | undefined,
      ],
    );
  });

  return () => {
    Agent.findOneAndUpdate = original;
  };
}

function generateVersionTestCases() {
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
  ];
}
