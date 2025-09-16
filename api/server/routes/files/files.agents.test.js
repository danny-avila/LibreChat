const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { AccessRoleIds, ResourceType, PrincipalType } = require('librechat-data-provider');
const { createAgent } = require('~/models/Agent');
const { createFile } = require('~/models/File');

// Only mock the external dependencies that we don't want to test
jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn().mockResolvedValue({}),
  filterFile: jest.fn(),
  processFileUpload: jest.fn(),
  processAgentFileUpload: jest.fn(),
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
});
