import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AccessRoleIds,
  PermissionBits,
  PrincipalType,
  PrincipalModel,
  ResourceType,
} from 'librechat-data-provider';
import { createModels, createMethods, RoleBits } from '@librechat/data-schemas';
import { ServerConfigsDB } from '../db/ServerConfigsDB';
import type { ParsedServerConfig } from '~/mcp/types';

// Mock the logger
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

let mongoServer: MongoMemoryServer;
let serverConfigsDB: ServerConfigsDB;

// Test data helpers
const createSSEConfig = (
  title?: string,
  description?: string,
  oauth?: { client_secret?: string; client_id?: string },
): ParsedServerConfig => ({
  type: 'sse',
  url: 'https://example.com/mcp',
  ...(title && { title }),
  ...(description && { description }),
  ...(oauth && { oauth }),
});

let dbMethods: ReturnType<typeof createMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Initialize all models
  createModels(mongoose);

  // Create methods and seed default roles
  dbMethods = createMethods(mongoose);
  await dbMethods.seedDefaultRoles();

  serverConfigsDB = new ServerConfigsDB(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear collections except AccessRole
  await mongoose.models.MCPServer.deleteMany({});
  await mongoose.models.Agent.deleteMany({});
  await mongoose.models.AclEntry.deleteMany({});
});

describe('ServerConfigsDB', () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const userId2 = new mongoose.Types.ObjectId().toString();

  describe('constructor', () => {
    it('should throw error when mongoose is not provided', () => {
      expect(() => new ServerConfigsDB(null as unknown as typeof mongoose)).toThrow(
        'ServerConfigsDB requires mongoose instance',
      );
    });

    it('should create instance when mongoose is provided', () => {
      const instance = new ServerConfigsDB(mongoose);
      expect(instance).toBeInstanceOf(ServerConfigsDB);
    });
  });

  describe('add()', () => {
    it('should throw error when userId is not provided', async () => {
      await expect(serverConfigsDB.add('test-server', createSSEConfig('Test'))).rejects.toThrow(
        'User ID is required to create a database-stored MCP server',
      );
    });

    it('should create server and return AddServerResult with generated serverName', async () => {
      const config = createSSEConfig('My Test Server', 'A test server');
      const result = await serverConfigsDB.add('temp-name', config, userId);

      expect(result).toBeDefined();
      expect(result.serverName).toBe('my-test-server');
      expect(result.config).toMatchObject({
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'My Test Server',
        description: 'A test server',
      });
      expect(result.config.dbId).toBeDefined();
    });

    it('should grant owner ACL to the user', async () => {
      const config = createSSEConfig('ACL Test Server');
      const result = await serverConfigsDB.add('temp-name', config, userId);

      // Verify ACL entry was created
      const aclEntry = await mongoose.models.AclEntry.findOne({
        principalType: PrincipalType.USER,
        principalId: new mongoose.Types.ObjectId(userId),
        resourceType: ResourceType.MCPSERVER,
      });

      expect(aclEntry).toBeDefined();
      expect(aclEntry!.resourceId.toString()).toBe(result.config.dbId);
      // OWNER role has VIEW | EDIT | DELETE | SHARE = 15
      expect(aclEntry!.permBits).toBe(RoleBits.OWNER);
    });

    it('should include dbId and updatedAt in returned config', async () => {
      const config = createSSEConfig('Metadata Test');
      const result = await serverConfigsDB.add('temp-name', config, userId);

      expect(result.config.dbId).toBeDefined();
      expect(typeof result.config.dbId).toBe('string');
      expect(result.config.updatedAt).toBeDefined();
      expect(typeof result.config.updatedAt).toBe('number');
    });
  });

  describe('update()', () => {
    it('should throw error when userId is not provided', async () => {
      await expect(serverConfigsDB.update('test-server', createSSEConfig('Test'))).rejects.toThrow(
        'User ID is required to update a database-stored MCP server',
      );
    });

    it('should update server config', async () => {
      const config = createSSEConfig('Original Title', 'Original description');
      const created = await serverConfigsDB.add('temp-name', config, userId);

      const updatedConfig = createSSEConfig('Original Title', 'Updated description');
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.description).toBe('Updated description');
    });

    it('should preserve oauth.client_secret when not provided in update', async () => {
      const config = createSSEConfig('OAuth Server', 'Test', {
        client_id: 'my-client-id',
        client_secret: 'super-secret-key',
      });
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update without client_secret
      const updatedConfig = createSSEConfig('OAuth Server', 'Updated description', {
        client_id: 'my-client-id',
        // client_secret not provided
      });
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the secret is preserved
      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).toBe('super-secret-key');
    });

    it('should allow updating oauth.client_secret when explicitly provided', async () => {
      const config = createSSEConfig('OAuth Server 2', 'Test', {
        client_id: 'my-client-id',
        client_secret: 'old-secret',
      });
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update with new client_secret
      const updatedConfig = createSSEConfig('OAuth Server 2', 'Updated', {
        client_id: 'my-client-id',
        client_secret: 'new-secret',
      });
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the secret is updated
      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).toBe('new-secret');
    });
  });

  describe('remove()', () => {
    it('should delete server from database', async () => {
      const config = createSSEConfig('Delete Test');
      const created = await serverConfigsDB.add('temp-name', config, userId);

      await serverConfigsDB.remove(created.serverName, userId);

      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server).toBeNull();
    });

    it('should remove all ACL entries for the server', async () => {
      const config = createSSEConfig('ACL Delete Test');
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Verify ACL exists before deletion
      let aclEntries = await mongoose.models.AclEntry.find({
        resourceType: ResourceType.MCPSERVER,
        resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
      });
      expect(aclEntries.length).toBeGreaterThan(0);

      await serverConfigsDB.remove(created.serverName, userId);

      // Verify ACL entries are removed
      aclEntries = await mongoose.models.AclEntry.find({
        resourceType: ResourceType.MCPSERVER,
        resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
      });
      expect(aclEntries.length).toBe(0);
    });

    it('should handle non-existent server gracefully', async () => {
      // Should not throw
      await expect(serverConfigsDB.remove('non-existent-server', userId)).resolves.toBeUndefined();
    });
  });

  describe('get()', () => {
    describe('public access (no userId)', () => {
      it('should return undefined for non-public server without userId', async () => {
        const config = createSSEConfig('Private Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        const result = await serverConfigsDB.get(created.serverName);
        expect(result).toBeUndefined();
      });

      it('should return server when publicly shared', async () => {
        const config = createSSEConfig('Public Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // Grant public access
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.PUBLIC,
          resourceType: ResourceType.MCPSERVER,
          resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
          permBits: PermissionBits.VIEW,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.get(created.serverName);
        expect(result).toBeDefined();
        expect(result?.title).toBe('Public Server');
      });

      it('should return server with consumeOnly when accessible via public agent', async () => {
        const config = createSSEConfig('Agent MCP Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // Create an agent that has this MCP server
        const Agent = mongoose.models.Agent;
        const agent = await Agent.create({
          id: 'test-agent-id',
          name: 'Test Agent',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created.serverName],
        });

        // Grant public access to the agent
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.PUBLIC,
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          permBits: PermissionBits.VIEW,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.get(created.serverName);
        expect(result).toBeDefined();
        expect(result?.consumeOnly).toBe(true);
      });
    });

    describe('user direct access', () => {
      it('should return server when user has direct VIEW permission', async () => {
        const config = createSSEConfig('Direct Access Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // The owner should have access
        const result = await serverConfigsDB.get(created.serverName, userId);
        expect(result).toBeDefined();
        expect(result?.title).toBe('Direct Access Server');
        expect(result?.consumeOnly).toBeUndefined();
      });

      it('should return undefined when user has no permission', async () => {
        const config = createSSEConfig('Restricted Server');
        await serverConfigsDB.add('temp-name', config, userId);

        // Different user without access
        const result = await serverConfigsDB.get('restricted-server', userId2);
        expect(result).toBeUndefined();
      });

      it('should return server when user is granted VIEW permission', async () => {
        const config = createSSEConfig('Shared Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // Grant VIEW permission to userId2
        const role = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.MCPSERVER,
          resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
          permBits: PermissionBits.VIEW,
          roleId: role!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.get(created.serverName, userId2);
        expect(result).toBeDefined();
        expect(result?.title).toBe('Shared Server');
      });
    });

    describe('agent-based access (consumeOnly)', () => {
      it('should return server with consumeOnly when user has access via agent', async () => {
        const config = createSSEConfig('Agent Accessible Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // Create an agent with this MCP server
        const Agent = mongoose.models.Agent;
        const agent = await Agent.create({
          id: 'agent-for-user2',
          name: 'Agent for User 2',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created.serverName],
        });

        // Grant agent access to userId2
        const agentRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          permBits: PermissionBits.VIEW,
          roleId: agentRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.get(created.serverName, userId2);
        expect(result).toBeDefined();
        expect(result?.consumeOnly).toBe(true);
        expect(result?.title).toBe('Agent Accessible Server');
      });

      it('should prefer direct access over agent access (no consumeOnly)', async () => {
        const config = createSSEConfig('Both Access Server');
        const created = await serverConfigsDB.add('temp-name', config, userId);

        // Create an agent with this MCP server
        const Agent = mongoose.models.Agent;
        const agent = await Agent.create({
          id: 'agent-both-access',
          name: 'Agent Both Access',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created.serverName],
        });

        // Grant userId2 both direct MCP access and agent access
        const mcpRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.MCPSERVER,
          resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
          permBits: PermissionBits.VIEW,
          roleId: mcpRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const agentRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          permBits: PermissionBits.VIEW,
          roleId: agentRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        // Direct access should take precedence (no consumeOnly)
        const result = await serverConfigsDB.get(created.serverName, userId2);
        expect(result).toBeDefined();
        expect(result?.consumeOnly).toBeUndefined();
      });
    });

    it('should return undefined for non-existent server', async () => {
      const result = await serverConfigsDB.get('non-existent-server', userId);
      expect(result).toBeUndefined();
    });
  });

  describe('getAll()', () => {
    describe('public access (no userId)', () => {
      it('should return empty object when no public servers exist', async () => {
        const config = createSSEConfig('Private Server');
        await serverConfigsDB.add('temp-name', config, userId);

        const result = await serverConfigsDB.getAll();
        expect(Object.keys(result)).toHaveLength(0);
      });

      it('should return only publicly shared servers', async () => {
        const config1 = createSSEConfig('Public Server 1');
        const config2 = createSSEConfig('Private Server');
        const created1 = await serverConfigsDB.add('temp1', config1, userId);
        await serverConfigsDB.add('temp2', config2, userId);

        // Make first server public
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.PUBLIC,
          resourceType: ResourceType.MCPSERVER,
          resourceId: new mongoose.Types.ObjectId(created1.config.dbId!),
          permBits: PermissionBits.VIEW,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.getAll();
        expect(Object.keys(result)).toHaveLength(1);
        expect(result['public-server-1']).toBeDefined();
      });
    });

    describe('user access', () => {
      it('should return servers directly accessible by user', async () => {
        const config1 = createSSEConfig('User Server 1');
        const config2 = createSSEConfig('User Server 2');
        await serverConfigsDB.add('temp1', config1, userId);
        await serverConfigsDB.add('temp2', config2, userId);

        // Create server by different user (not accessible)
        await serverConfigsDB.add('temp3', createSSEConfig('Other User Server'), userId2);

        const result = await serverConfigsDB.getAll(userId);
        expect(Object.keys(result)).toHaveLength(2);
        expect(result['user-server-1']).toBeDefined();
        expect(result['user-server-2']).toBeDefined();
        expect(result['other-user-server']).toBeUndefined();
      });

      it('should include agent-accessible servers with consumeOnly flag', async () => {
        const config1 = createSSEConfig('Direct Server');
        const config2 = createSSEConfig('Agent Only Server');
        await serverConfigsDB.add('temp1', config1, userId);
        const created2 = await serverConfigsDB.add('temp2', config2, userId);

        // Create an agent with second MCP server, accessible by userId2
        const Agent = mongoose.models.Agent;
        const agent = await Agent.create({
          id: 'getall-agent',
          name: 'GetAll Agent',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created2.serverName],
        });

        const agentRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          permBits: PermissionBits.VIEW,
          roleId: agentRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.getAll(userId2);
        expect(Object.keys(result)).toHaveLength(1);
        expect(result['agent-only-server']).toBeDefined();
        expect(result['agent-only-server'].consumeOnly).toBe(true);
      });

      it('should deduplicate servers with both direct and agent access', async () => {
        const config = createSSEConfig('Dedup Server');
        const created = await serverConfigsDB.add('temp', config, userId);

        // Create an agent with this MCP server
        const Agent = mongoose.models.Agent;
        const agent = await Agent.create({
          id: 'dedup-agent',
          name: 'Dedup Agent',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created.serverName],
        });

        // Grant userId2 both direct MCP access and agent access
        const mcpRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.MCPSERVER,
          resourceId: new mongoose.Types.ObjectId(created.config.dbId!),
          permBits: PermissionBits.VIEW,
          roleId: mcpRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const agentRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        });
        await mongoose.models.AclEntry.create({
          principalType: PrincipalType.USER,
          principalModel: PrincipalModel.USER,
          principalId: new mongoose.Types.ObjectId(userId2),
          resourceType: ResourceType.AGENT,
          resourceId: agent._id,
          permBits: PermissionBits.VIEW,
          roleId: agentRole!._id,
          grantedBy: new mongoose.Types.ObjectId(userId),
        });

        const result = await serverConfigsDB.getAll(userId2);
        // Should only have one entry (deduplicated)
        expect(Object.keys(result)).toHaveLength(1);
        // Direct access takes precedence - no consumeOnly
        expect(result['dedup-server']).toBeDefined();
        expect(result['dedup-server'].consumeOnly).toBeUndefined();
      });

      it('should merge servers from multiple agents', async () => {
        const config1 = createSSEConfig('Agent1 Server');
        const config2 = createSSEConfig('Agent2 Server');
        const created1 = await serverConfigsDB.add('temp1', config1, userId);
        const created2 = await serverConfigsDB.add('temp2', config2, userId);

        // Create two agents, each with a different MCP server
        const Agent = mongoose.models.Agent;
        const agent1 = await Agent.create({
          id: 'multi-agent-1',
          name: 'Multi Agent 1',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created1.serverName],
        });

        const agent2 = await Agent.create({
          id: 'multi-agent-2',
          name: 'Multi Agent 2',
          provider: 'openai',
          model: 'gpt-4',
          author: new mongoose.Types.ObjectId(userId),
          mcpServerNames: [created2.serverName],
        });

        // Grant userId2 access to both agents
        const agentRole = await mongoose.models.AccessRole.findOne({
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        });

        await mongoose.models.AclEntry.create([
          {
            principalType: PrincipalType.USER,
            principalModel: PrincipalModel.USER,
            principalId: new mongoose.Types.ObjectId(userId2),
            resourceType: ResourceType.AGENT,
            resourceId: agent1._id,
            permBits: PermissionBits.VIEW,
            roleId: agentRole!._id,
            grantedBy: new mongoose.Types.ObjectId(userId),
          },
          {
            principalType: PrincipalType.USER,
            principalModel: PrincipalModel.USER,
            principalId: new mongoose.Types.ObjectId(userId2),
            resourceType: ResourceType.AGENT,
            resourceId: agent2._id,
            permBits: PermissionBits.VIEW,
            roleId: agentRole!._id,
            grantedBy: new mongoose.Types.ObjectId(userId),
          },
        ]);

        const result = await serverConfigsDB.getAll(userId2);
        expect(Object.keys(result)).toHaveLength(2);
        expect(result['agent1-server']?.consumeOnly).toBe(true);
        expect(result['agent2-server']?.consumeOnly).toBe(true);
      });
    });
  });

  describe('hasAccessViaAgent() - private method integration', () => {
    it('should return false when no agents exist', async () => {
      const config = createSSEConfig('No Agent Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      // Access via get() which uses hasAccessViaAgent internally
      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeUndefined();
    });

    it('should return false when agent has MCP but user has no agent access', async () => {
      const config = createSSEConfig('Inaccessible Agent Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      // Create an agent with this MCP server but no ACL for userId2
      const Agent = mongoose.models.Agent;
      await Agent.create({
        id: 'inaccessible-agent',
        name: 'Inaccessible Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        mcpServerNames: [created.serverName],
      });

      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeUndefined();
    });

    it('should return true when user has VIEW access to agent with the MCP server', async () => {
      const config = createSSEConfig('Accessible Agent Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      const Agent = mongoose.models.Agent;
      const agent = await Agent.create({
        id: 'accessible-agent',
        name: 'Accessible Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        mcpServerNames: [created.serverName],
      });

      const agentRole = await mongoose.models.AccessRole.findOne({
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      });
      await mongoose.models.AclEntry.create({
        principalType: PrincipalType.USER,
        principalModel: PrincipalModel.USER,
        principalId: new mongoose.Types.ObjectId(userId2),
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: PermissionBits.VIEW,
        roleId: agentRole!._id,
        grantedBy: new mongoose.Types.ObjectId(userId),
      });

      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeDefined();
      expect(result?.consumeOnly).toBe(true);
    });

    it('should handle multiple agents - one accessible, one not', async () => {
      const config = createSSEConfig('Multi Agent Access Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      const Agent = mongoose.models.Agent;

      // Agent 1: has MCP server but no user access
      await Agent.create({
        id: 'no-access-agent',
        name: 'No Access Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        mcpServerNames: [created.serverName],
      });

      // Agent 2: has MCP server AND user has access
      const accessibleAgent = await Agent.create({
        id: 'has-access-agent',
        name: 'Has Access Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        mcpServerNames: [created.serverName],
      });

      const agentRole = await mongoose.models.AccessRole.findOne({
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      });
      await mongoose.models.AclEntry.create({
        principalType: PrincipalType.USER,
        principalModel: PrincipalModel.USER,
        principalId: new mongoose.Types.ObjectId(userId2),
        resourceType: ResourceType.AGENT,
        resourceId: accessibleAgent._id,
        permBits: PermissionBits.VIEW,
        roleId: agentRole!._id,
        grantedBy: new mongoose.Types.ObjectId(userId),
      });

      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeDefined();
      expect(result?.consumeOnly).toBe(true);
    });
  });

  describe('reset()', () => {
    it('should be a no-op and not throw', async () => {
      // Create a server first
      const config = createSSEConfig('Reset Test');
      await serverConfigsDB.add('temp', config, userId);

      // Reset should complete without error
      await expect(serverConfigsDB.reset()).resolves.toBeUndefined();

      // Server should still exist (reset is no-op for DB storage)
      const result = await serverConfigsDB.get('reset-test', userId);
      expect(result).toBeDefined();
    });
  });

  describe('mapDBServerToParsedConfig()', () => {
    it('should include dbId from _id', async () => {
      const config = createSSEConfig('Map Test');
      const created = await serverConfigsDB.add('temp', config, userId);

      expect(created.config.dbId).toBeDefined();
      expect(typeof created.config.dbId).toBe('string');
      expect(mongoose.Types.ObjectId.isValid(created.config.dbId!)).toBe(true);
    });

    it('should include updatedAt as timestamp', async () => {
      const config = createSSEConfig('Timestamp Test');
      const created = await serverConfigsDB.add('temp', config, userId);

      expect(created.config.updatedAt).toBeDefined();
      expect(typeof created.config.updatedAt).toBe('number');
      expect(created.config.updatedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('edge cases', () => {
    it('should handle server with empty mcpServerNames in agent', async () => {
      const config = createSSEConfig('Edge Case Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      // Create an agent with empty mcpServerNames
      const Agent = mongoose.models.Agent;
      const agent = await Agent.create({
        id: 'empty-mcp-agent',
        name: 'Empty MCP Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        mcpServerNames: [], // Empty array
      });

      const agentRole = await mongoose.models.AccessRole.findOne({
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      });
      await mongoose.models.AclEntry.create({
        principalType: PrincipalType.USER,
        principalModel: PrincipalModel.USER,
        principalId: new mongoose.Types.ObjectId(userId2),
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: PermissionBits.VIEW,
        roleId: agentRole!._id,
        grantedBy: new mongoose.Types.ObjectId(userId),
      });

      // Should not find the server via agent (empty mcpServerNames)
      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeUndefined();
    });

    it('should handle agent without mcpServerNames field', async () => {
      const config = createSSEConfig('No Field Server');
      const created = await serverConfigsDB.add('temp', config, userId);

      // Create an agent without mcpServerNames field (uses default)
      const Agent = mongoose.models.Agent;
      const agent = await Agent.create({
        id: 'no-field-agent',
        name: 'No Field Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: new mongoose.Types.ObjectId(userId),
        // mcpServerNames not specified - should default to []
      });

      const agentRole = await mongoose.models.AccessRole.findOne({
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
      });
      await mongoose.models.AclEntry.create({
        principalType: PrincipalType.USER,
        principalModel: PrincipalModel.USER,
        principalId: new mongoose.Types.ObjectId(userId2),
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        permBits: PermissionBits.VIEW,
        roleId: agentRole!._id,
        grantedBy: new mongoose.Types.ObjectId(userId),
      });

      // Should not find the server via agent
      const result = await serverConfigsDB.get(created.serverName, userId2);
      expect(result).toBeUndefined();
    });
  });
});
