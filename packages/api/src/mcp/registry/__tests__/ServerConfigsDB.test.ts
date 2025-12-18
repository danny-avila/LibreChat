import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  AccessRoleIds,
  PermissionBits,
  PrincipalType,
  PrincipalModel,
  ResourceType,
} from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';

// Types for dynamically imported modules
type ServerConfigsDBType = import('../db/ServerConfigsDB').ServerConfigsDB;
type CreateMethodsType = typeof import('@librechat/data-schemas').createMethods;
type CreateModelsType = typeof import('@librechat/data-schemas').createModels;
type RoleBitsType = typeof import('@librechat/data-schemas').RoleBits;

let mongoServer: MongoMemoryServer;
let serverConfigsDB: ServerConfigsDBType;
let ServerConfigsDB: new (mongoose: typeof import('mongoose')) => ServerConfigsDBType;
let createModels: CreateModelsType;
let createMethods: CreateMethodsType;
let RoleBits: RoleBitsType;

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

let dbMethods: ReturnType<CreateMethodsType>;

beforeAll(async () => {
  // Set encryption keys BEFORE importing modules that use crypto
  process.env.CREDS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.CREDS_IV = '0123456789abcdef0123456789abcdef';

  // Clear module cache so crypto module loads with new env vars
  jest.resetModules();

  // Dynamic imports after setting env vars
  const dataSchemas = await import('@librechat/data-schemas');
  createModels = dataSchemas.createModels;
  createMethods = dataSchemas.createMethods;
  RoleBits = dataSchemas.RoleBits;

  // Mock logger after import (suppress logs during tests)
  jest.spyOn(dataSchemas.logger, 'error').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'warn').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'debug').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'info').mockReturnValue(dataSchemas.logger);

  const serverConfigsModule = await import('../db/ServerConfigsDB');
  ServerConfigsDB = serverConfigsModule.ServerConfigsDB;

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

      // Verify the secret is encrypted in DB after add (not plaintext)
      const MCPServer = mongoose.models.MCPServer;
      let server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).not.toBe('super-secret-key');

      // Update without client_secret
      const updatedConfig = createSSEConfig('OAuth Server', 'Updated description', {
        client_id: 'my-client-id',
        // client_secret not provided
      });
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the secret is still encrypted in DB (preserved, not plaintext)
      server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).not.toBe('super-secret-key');

      // Verify the secret is decrypted when accessed via get()
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.oauth?.client_secret).toBe('super-secret-key');
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

      // Verify the secret is encrypted in DB (not plaintext)
      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).not.toBe('new-secret');

      // Verify the secret is decrypted to the new value when accessed via get()
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.oauth?.client_secret).toBe('new-secret');
    });

    it('should encrypt oauth.client_secret when saving to database', async () => {
      const config = createSSEConfig('Encryption Test', 'Test', {
        client_id: 'test-client-id',
        client_secret: 'plaintext-secret',
      });
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Verify the secret is encrypted in DB (not plaintext)
      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.oauth?.client_secret).not.toBe('plaintext-secret');

      // Verify the secret is decrypted when accessed via get()
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.oauth?.client_secret).toBe('plaintext-secret');
    });

    it('should pass through config without oauth field unchanged', async () => {
      const config = createSSEConfig('No OAuth Server', 'Test without oauth');
      const created = await serverConfigsDB.add('temp-name', config, userId);

      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.oauth).toBeUndefined();
      expect(retrieved?.title).toBe('No OAuth Server');
    });

    it('should pass through config with oauth but no client_secret unchanged', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'OAuth No Secret',
        oauth: {
          client_id: 'my-client-id',
          // No client_secret
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.oauth?.client_id).toBe('my-client-id');
      expect(retrieved?.oauth?.client_secret).toBeUndefined();
    });

    it('should encrypt apiKey.key when saving admin-provided API key', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'Admin API Key Server',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'my-secret-api-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Verify the key is encrypted in DB (not plaintext)
      const MCPServer = mongoose.models.MCPServer;
      const server = await MCPServer.findOne({ serverName: created.serverName });
      expect(server?.config?.apiKey?.key).not.toBe('my-secret-api-key');
      expect(server?.config?.apiKey?.source).toBe('admin');
      expect(server?.config?.apiKey?.authorization_type).toBe('bearer');

      // Verify the key is decrypted when accessed via get()
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.key).toBe('my-secret-api-key');
    });

    it('should preserve apiKey.key when not provided in update (admin mode)', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Preserve Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'original-api-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update without providing the key
      const updatedConfig: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Preserve Test',
        description: 'Updated description',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          // key not provided - should be preserved
        },
      };
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the key is still available and decrypted
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.key).toBe('original-api-key');
      expect(retrieved?.description).toBe('Updated description');
    });

    it('should allow updating apiKey.key when explicitly provided', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Update Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'old-api-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update with new key
      const updatedConfig: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Update Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'new-api-key',
        },
      };
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the key is updated
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.key).toBe('new-api-key');
    });

    it('should preserve apiKey.key when authorization_type changes (bearer to custom)', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Auth Type Change Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'my-api-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update: change from bearer to custom header, without providing key
      const updatedConfig: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Auth Type Change Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'custom',
          custom_header: 'X-My-Api-Key',
          // key not provided - should be preserved
        },
      };
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the key is preserved and authorization_type/custom_header updated
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.key).toBe('my-api-key');
      expect(retrieved?.apiKey?.authorization_type).toBe('custom');
      expect(retrieved?.apiKey?.custom_header).toBe('X-My-Api-Key');
    });

    it('should NOT preserve apiKey.key when switching from admin to user source', async () => {
      // Create server with admin-provided API key
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'Source Switch Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'admin-secret-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update to user-provided mode (no key should be preserved)
      const updatedConfig: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'Source Switch Test',
        apiKey: {
          source: 'user',
          authorization_type: 'bearer',
        },
      };
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify the old admin key is NOT preserved (would be a security issue)
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.source).toBe('user');
      expect(retrieved?.apiKey?.key).toBeUndefined();
    });

    it('should NOT preserve apiKey.key when switching from user to admin without providing key', async () => {
      // Create server with user-provided API key mode
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'User to Admin Switch Test',
        apiKey: {
          source: 'user',
          authorization_type: 'bearer',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Update to admin mode without providing a key
      const updatedConfig: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'User to Admin Switch Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          // key not provided - should NOT try to preserve from user mode
        },
      };
      await serverConfigsDB.update(created.serverName, updatedConfig, userId);

      // Verify no key is present (user mode doesn't store keys)
      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      expect(retrieved?.apiKey?.source).toBe('admin');
      expect(retrieved?.apiKey?.key).toBeUndefined();
    });

    it('should transform user-provided API key config with customUserVars and headers', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'User API Key Server',
        apiKey: {
          source: 'user',
          authorization_type: 'bearer',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      // Cast to access headers (SSE config has headers)
      const retrievedWithHeaders = retrieved as ParsedServerConfig & {
        headers?: Record<string, string>;
      };

      // Should have customUserVars with MCP_API_KEY
      expect(retrieved?.customUserVars).toBeDefined();
      expect(retrieved?.customUserVars?.MCP_API_KEY).toEqual({
        title: 'API Key',
        description: 'Your API key for this MCP server',
      });

      // Should have headers with placeholder
      expect(retrievedWithHeaders?.headers).toBeDefined();
      expect(retrievedWithHeaders?.headers?.Authorization).toBe('Bearer {{MCP_API_KEY}}');

      // Key should be undefined (user provides it)
      expect(retrieved?.apiKey?.key).toBeUndefined();
    });

    it('should transform user-provided API key with custom header', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'Custom Header API Key Server',
        apiKey: {
          source: 'user',
          authorization_type: 'custom',
          custom_header: 'X-My-Api-Key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      const retrieved = await serverConfigsDB.get(created.serverName, userId);
      // Cast to access headers (SSE config has headers)
      const retrievedWithHeaders = retrieved as ParsedServerConfig & {
        headers?: Record<string, string>;
      };

      // Should have headers with custom header name
      expect(retrievedWithHeaders?.headers?.['X-My-Api-Key']).toBe('{{MCP_API_KEY}}');
      expect(retrievedWithHeaders?.headers?.Authorization).toBeUndefined();
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

      it('should decrypt oauth.client_secret for multiple servers', async () => {
        const config1 = createSSEConfig('Secret Server 1', 'First', {
          client_id: 'client-1',
          client_secret: 'secret-one',
        });
        const config2 = createSSEConfig('Secret Server 2', 'Second', {
          client_id: 'client-2',
          client_secret: 'secret-two',
        });
        const config3 = createSSEConfig('No Secret Server', 'Third');

        await serverConfigsDB.add('temp1', config1, userId);
        await serverConfigsDB.add('temp2', config2, userId);
        await serverConfigsDB.add('temp3', config3, userId);

        const result = await serverConfigsDB.getAll(userId);

        expect(Object.keys(result)).toHaveLength(3);
        // Verify secrets are decrypted
        expect(result['secret-server-1']?.oauth?.client_secret).toBe('secret-one');
        expect(result['secret-server-2']?.oauth?.client_secret).toBe('secret-two');
        // Verify server without secret is unaffected
        expect(result['no-secret-server']?.oauth).toBeUndefined();
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

  describe('encryption/decryption error handling', () => {
    it('should return config without secret when decryption fails (graceful degradation)', async () => {
      // Create a server normally first
      const config = createSSEConfig('Decryption Failure Test', 'Test', {
        client_id: 'test-client',
        client_secret: 'test-secret',
      });
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Directly corrupt the encrypted secret in the database to simulate decryption failure
      const MCPServer = mongoose.models.MCPServer;
      await MCPServer.updateOne(
        { serverName: created.serverName },
        { $set: { 'config.oauth.client_secret': 'invalid:corrupted:encrypted:value' } },
      );

      // Get should return config without the secret (graceful degradation)
      const retrieved = await serverConfigsDB.get(created.serverName, userId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('Decryption Failure Test');
      expect(retrieved?.oauth?.client_id).toBe('test-client');
      // Secret should be removed due to decryption failure
      expect(retrieved?.oauth?.client_secret).toBeUndefined();
    });

    it('should handle getAll with mixed valid and corrupted secrets', async () => {
      // Create servers with valid secrets
      const config1 = createSSEConfig('Valid Secret Server', 'Test', {
        client_id: 'client-1',
        client_secret: 'valid-secret',
      });
      const config2 = createSSEConfig('Corrupted Secret Server', 'Test', {
        client_id: 'client-2',
        client_secret: 'will-be-corrupted',
      });
      const created1 = await serverConfigsDB.add('temp1', config1, userId);
      const created2 = await serverConfigsDB.add('temp2', config2, userId);

      // Corrupt the second server's secret
      const MCPServer = mongoose.models.MCPServer;
      await MCPServer.updateOne(
        { serverName: created2.serverName },
        { $set: { 'config.oauth.client_secret': 'invalid:corrupted:data' } },
      );

      // GetAll should still return both servers
      const result = await serverConfigsDB.getAll(userId);

      expect(Object.keys(result)).toHaveLength(2);
      // First server should have decrypted secret
      expect(result[created1.serverName]?.oauth?.client_secret).toBe('valid-secret');
      // Second server should have secret removed due to decryption failure
      expect(result[created2.serverName]?.oauth?.client_id).toBe('client-2');
      expect(result[created2.serverName]?.oauth?.client_secret).toBeUndefined();
    });

    it('should return config without apiKey.key when decryption fails (graceful degradation)', async () => {
      const config: ParsedServerConfig = {
        type: 'sse',
        url: 'https://example.com/mcp',
        title: 'API Key Decryption Failure Test',
        apiKey: {
          source: 'admin',
          authorization_type: 'bearer',
          key: 'test-api-key',
        },
      };
      const created = await serverConfigsDB.add('temp-name', config, userId);

      // Directly corrupt the encrypted key in the database to simulate decryption failure
      const MCPServer = mongoose.models.MCPServer;
      await MCPServer.updateOne(
        { serverName: created.serverName },
        { $set: { 'config.apiKey.key': 'invalid:corrupted:encrypted:value' } },
      );

      // Get should return config without the key (graceful degradation)
      const retrieved = await serverConfigsDB.get(created.serverName, userId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('API Key Decryption Failure Test');
      expect(retrieved?.apiKey?.source).toBe('admin');
      expect(retrieved?.apiKey?.authorization_type).toBe('bearer');
      // Key should be removed due to decryption failure
      expect(retrieved?.apiKey?.key).toBeUndefined();
    });
  });
});
