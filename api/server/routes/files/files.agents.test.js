const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  AccessRoleIds,
  ResourceType,
  PrincipalType,
} = require('librechat-data-provider');
const { createAgent, createFile } = require('~/models');

// Only mock the external dependencies that we don't want to test
jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn().mockResolvedValue({}),
  filterFile: jest.fn(),
  processFileUpload: jest.fn(),
  processAgentFileUpload: jest.fn().mockImplementation(async ({ res }) => {
    // processAgentFileUpload sends response directly via res.json()
    return res.status(200).json({
      message: 'Agent file uploaded and processed successfully',
      file_id: 'test-file-id',
    });
  }),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({})),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3FileUrls: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Mock fs.promises.unlink to prevent file cleanup errors in tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      ...actualFs.promises,
      unlink: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const { processAgentFileUpload } = require('~/server/services/Files/process');

// Import the router
const router = require('~/server/routes/files/files');

describe('File Routes - Agent Files Endpoint', () => {
  let app;
  let mongoServer;
  let authorId;
  let otherUserId;
  let agentId;
  let fileId1;
  let fileId2;
  let fileId3;
  let File;
  let User;
  let Agent;
  let methods;
  let AclEntry;
  // eslint-disable-next-line no-unused-vars
  let AccessRole;
  let modelsToCleanup = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialize all models using createModels
    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);

    // Track which models we're adding
    modelsToCleanup = Object.keys(models);

    // Register models on mongoose.models so methods can access them
    Object.assign(mongoose.models, models);

    // Create methods with our test mongoose instance
    methods = createMethods(mongoose);

    // Now we can access models from the db/models
    File = models.File;
    Agent = models.Agent;
    AclEntry = models.AclEntry;
    User = models.User;
    AccessRole = models.AccessRole;

    // Seed default roles using our methods
    await methods.seedDefaultRoles();

    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: otherUserId || 'default-user' };
      req.app = { locals: {} };
      next();
    });

    app.use('/files', router);
  });

  afterAll(async () => {
    // Clean up all collections before disconnecting
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    // Clear only the models we added
    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }

    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up all test data
    await File.deleteMany({});
    await Agent.deleteMany({});
    await User.deleteMany({});
    await AclEntry.deleteMany({});
    // Don't delete AccessRole as they are seeded defaults needed for tests

    // Create test users
    authorId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();
    agentId = uuidv4();
    fileId1 = uuidv4();
    fileId2 = uuidv4();
    fileId3 = uuidv4();

    // Create users in database
    await User.create({
      _id: authorId,
      username: 'author',
      email: 'author@test.com',
    });

    await User.create({
      _id: otherUserId,
      username: 'other',
      email: 'other@test.com',
    });

    // Create files
    await createFile({
      user: authorId,
      file_id: fileId1,
      filename: 'file1.txt',
      filepath: '/uploads/file1.txt',
      bytes: 100,
      type: 'text/plain',
    });

    await createFile({
      user: authorId,
      file_id: fileId2,
      filename: 'file2.txt',
      filepath: '/uploads/file2.txt',
      bytes: 200,
      type: 'text/plain',
    });

    await createFile({
      user: otherUserId,
      file_id: fileId3,
      filename: 'file3.txt',
      filepath: '/uploads/file3.txt',
      bytes: 300,
      type: 'text/plain',
    });
  });

  describe('GET /files/agent/:agent_id', () => {
    it('should return files accessible through the agent for non-author with EDIT permission', async () => {
      // Create an agent with files attached
      const agent = await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId1, fileId2],
          },
        },
      });

      // Grant EDIT permission to user on the agent using PermissionService
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      // Mock req.user for this request
      app.use((req, res, next) => {
        req.user = { id: otherUserId.toString() };
        next();
      });

      const response = await request(app).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body.map((f) => f.file_id)).toContain(fileId1);
      expect(response.body.map((f) => f.file_id)).toContain(fileId2);
    });

    it('should return 400 when agent_id is not provided', async () => {
      const response = await request(app).get('/files/agent/');

      expect(response.status).toBe(404); // Express returns 404 for missing route parameter
    });

    it('should return empty array for non-existent agent', async () => {
      const response = await request(app).get('/files/agent/non-existent-agent');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual([]);
    });

    it('should return empty array when user only has VIEW permission', async () => {
      // Create an agent with files attached
      const agent = await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId1, fileId2],
          },
        },
      });

      // Grant only VIEW permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const response = await request(app).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual([]);
    });

    it('should return agent files for agent author', async () => {
      // Create an agent with files attached
      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId1, fileId2],
          },
        },
      });

      // Create a new app instance with author authentication
      const authorApp = express();
      authorApp.use(express.json());
      authorApp.use((req, res, next) => {
        req.user = { id: authorId.toString() };
        req.app = { locals: {} };
        next();
      });
      authorApp.use('/files', router);

      const response = await request(authorApp).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it('should return files uploaded by other users to shared agent for author', async () => {
      const anotherUserId = new mongoose.Types.ObjectId();
      const otherUserFileId = uuidv4();

      await User.create({
        _id: anotherUserId,
        username: 'another',
        email: 'another@test.com',
      });

      await createFile({
        user: anotherUserId,
        file_id: otherUserFileId,
        filename: 'other-user-file.txt',
        filepath: '/uploads/other-user-file.txt',
        bytes: 400,
        type: 'text/plain',
      });

      // Create agent to include the file uploaded by another user
      await createAgent({
        id: agentId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId1, otherUserFileId],
          },
        },
      });

      // Create a new app instance with author authentication
      const authorApp = express();
      authorApp.use(express.json());
      authorApp.use((req, res, next) => {
        req.user = { id: authorId.toString() };
        req.app = { locals: {} };
        next();
      });
      authorApp.use('/files', router);

      const response = await request(authorApp).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body.map((f) => f.file_id)).toContain(fileId1);
      expect(response.body.map((f) => f.file_id)).toContain(otherUserFileId);
    });
  });

  describe('POST /files - Agent File Upload Permission Check', () => {
    let agentCustomId;

    beforeEach(async () => {
      agentCustomId = `agent_${uuidv4().replace(/-/g, '').substring(0, 21)}`;
      jest.clearAllMocks();
    });

    /**
     * Helper to create an Express app with specific user context
     */
    const createAppWithUser = (userId, userRole = SystemRoles.USER) => {
      const testApp = express();
      testApp.use(express.json());

      // Mock multer - populate req.file
      testApp.use((req, res, next) => {
        if (req.method === 'POST') {
          req.file = {
            originalname: 'test.txt',
            mimetype: 'text/plain',
            size: 100,
            path: '/tmp/test.txt',
          };
          req.file_id = uuidv4();
        }
        next();
      });

      testApp.use((req, res, next) => {
        req.user = { id: userId.toString(), role: userRole };
        req.app = { locals: {} };
        req.config = { fileStrategy: 'local' };
        next();
      });

      testApp.use('/files', router);
      return testApp;
    };

    it('should deny file upload to agent when user has no permission', async () => {
      // Create an agent owned by authorId
      await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Insufficient permissions to upload files to this agent');
      expect(processAgentFileUpload).not.toHaveBeenCalled();
    });

    it('should allow file upload to agent for agent author', async () => {
      // Create an agent owned by authorId
      await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      const testApp = createAppWithUser(authorId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should allow file upload to agent for user with EDIT permission', async () => {
      // Create an agent owned by authorId
      const agent = await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Grant EDIT permission to otherUserId
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should deny file upload to agent for user with only VIEW permission', async () => {
      // Create an agent owned by authorId
      const agent = await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Grant only VIEW permission to otherUserId
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'file_search',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
      expect(processAgentFileUpload).not.toHaveBeenCalled();
    });

    it('should allow file upload for admin user regardless of agent ownership', async () => {
      // Create an agent owned by authorId
      await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Create app with admin user (otherUserId as admin)
      const testApp = createAppWithUser(otherUserId, SystemRoles.ADMIN);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should return 404 when uploading to non-existent agent', async () => {
      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: 'agent_nonexistent123456789',
        tool_resource: 'context',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
      expect(response.body.message).toBe('Agent not found');
      expect(processAgentFileUpload).not.toHaveBeenCalled();
    });

    it('should allow file upload without agent_id (message attachment)', async () => {
      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        file_id: uuidv4(),
        // No agent_id or tool_resource - this is a message attachment
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should allow file upload with agent_id but no tool_resource (message attachment)', async () => {
      // Create an agent owned by authorId
      await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        file_id: uuidv4(),
        // No tool_resource - permission check should not apply
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should allow message_file attachment to agent even without EDIT permission', async () => {
      // Create an agent owned by authorId
      const agent = await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Grant only VIEW permission to otherUserId
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      // message_file: true indicates this is a chat message attachment, not a permanent file upload
      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        message_file: true,
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should allow message_file attachment (string "true") to agent even without EDIT permission', async () => {
      // Create an agent owned by authorId
      const agent = await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Grant only VIEW permission to otherUserId
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      // message_file as string "true" (from form data) should also be allowed
      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        message_file: 'true',
        file_id: uuidv4(),
      });

      expect(response.status).toBe(200);
      expect(processAgentFileUpload).toHaveBeenCalled();
    });

    it('should deny file upload when message_file is false (not a message attachment)', async () => {
      // Create an agent owned by authorId
      const agent = await createAgent({
        id: agentCustomId,
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
      });

      // Grant only VIEW permission to otherUserId
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: authorId,
      });

      const testApp = createAppWithUser(otherUserId);

      // message_file: false should NOT bypass permission check
      const response = await request(testApp).post('/files').send({
        endpoint: 'agents',
        agent_id: agentCustomId,
        tool_resource: 'context',
        message_file: false,
        file_id: uuidv4(),
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden');
      expect(processAgentFileUpload).not.toHaveBeenCalled();
    });
  });
});
