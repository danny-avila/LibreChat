const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { createMethods } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
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

jest.mock('~/server/services/Files/S3/crud', () => ({
  refreshS3FileUrls: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const { processDeleteRequest } = require('~/server/services/Files/process');

// Import the router after mocks
const router = require('./files');

describe('File Routes - Delete with Agent Access', () => {
  let app;
  let mongoServer;
  let authorId;
  let otherUserId;
  let fileId;
  let File;
  let Agent;
  let AclEntry;
  let User;
  let methods;
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

    // Seed default roles using our methods
    await methods.seedDefaultRoles();

    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: otherUserId ? otherUserId.toString() : 'default-user' };
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
    jest.clearAllMocks();

    // Clear database - clean up all test data
    await File.deleteMany({});
    await Agent.deleteMany({});
    await User.deleteMany({});
    await AclEntry.deleteMany({});
    // Don't delete AccessRole as they are seeded defaults needed for tests

    // Create test data
    authorId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();
    fileId = uuidv4();

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

    // Create a file owned by the author
    await createFile({
      user: authorId,
      file_id: fileId,
      filename: 'test.txt',
      filepath: '/uploads/test.txt',
      bytes: 100,
      type: 'text/plain',
    });
  });

  describe('DELETE /files', () => {
    it('should allow deleting files owned by the user', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: '/uploads/user-file.txt',
        bytes: 200,
        type: 'text/plain',
      });

      const response = await request(app)
        .delete('/files')
        .send({
          files: [
            {
              file_id: userFileId,
              filepath: '/uploads/user-file.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files deleted successfully');
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should prevent deleting files not owned by user without agent context', async () => {
      const response = await request(app)
        .delete('/files')
        .send({
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(fileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should allow deleting files accessible through shared agent', async () => {
      // Create an agent with the file attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: 'user',
        principalId: otherUserId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_editor',
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Files deleted successfully');
      expect(processDeleteRequest).toHaveBeenCalled();
    });

    it('should prevent deleting files not attached to the specified agent', async () => {
      // Create another file not attached to the agent
      const unattachedFileId = uuidv4();
      await createFile({
        user: authorId,
        file_id: unattachedFileId,
        filename: 'unattached.txt',
        filepath: '/uploads/unattached.txt',
        bytes: 300,
        type: 'text/plain',
      });

      // Create an agent without the unattached file
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId], // Only fileId, not unattachedFileId
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: 'user',
        principalId: otherUserId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_editor',
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: unattachedFileId,
              filepath: '/uploads/unattached.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unattachedFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should handle mixed authorized and unauthorized files', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: '/uploads/user-file.txt',
        bytes: 200,
        type: 'text/plain',
      });

      // Create an unauthorized file
      const unauthorizedFileId = uuidv4();
      await createFile({
        user: authorId,
        file_id: unauthorizedFileId,
        filename: 'unauthorized.txt',
        filepath: '/uploads/unauthorized.txt',
        bytes: 400,
        type: 'text/plain',
      });

      // Create an agent with only fileId attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: 'user',
        principalId: otherUserId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_editor',
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            { file_id: userFileId, filepath: '/uploads/user-file.txt' },
            { file_id: fileId, filepath: '/uploads/test.txt' },
            { file_id: unauthorizedFileId, filepath: '/uploads/unauthorized.txt' },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unauthorizedFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should prevent deleting files when user lacks EDIT permission on agent', async () => {
      // Create an agent with the file attached
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [fileId],
          },
        },
      });

      // Grant only VIEW permission to user on the agent
      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: 'user',
        principalId: otherUserId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_viewer',
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: fileId,
              filepath: '/uploads/test.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(fileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });
  });
});
