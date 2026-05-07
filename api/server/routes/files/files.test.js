const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');
const { createMethods, tenantStorage } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  FileSources,
} = require('librechat-data-provider');
const { createAgent, createFile } = require('~/models');

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

jest.mock('sharp', () =>
  jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({}),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(0)),
  })),
);

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
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
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

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

    app.use((req, res, next) => {
      req.user = {
        id: otherUserId?.toString() || 'default-user',
        role: SystemRoles.USER,
      };
      req.app.locals = {};
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
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
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

    it('should prevent deleting files not owned by the agent author', async () => {
      const thirdUserId = new mongoose.Types.ObjectId();
      const thirdUserFileId = uuidv4();
      await createFile({
        user: thirdUserId,
        file_id: thirdUserFileId,
        filename: 'third-user-file.txt',
        filepath: '/uploads/third-user-file.txt',
        bytes: 300,
        type: 'text/plain',
      });

      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [thirdUserFileId],
          },
        },
      });

      const { grantPermission } = require('~/server/services/PermissionService');
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
        grantedBy: authorId,
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          files: [
            {
              file_id: thirdUserFileId,
              filepath: '/uploads/third-user-file.txt',
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(thirdUserFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
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
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
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
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_EDITOR,
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
        principalType: PrincipalType.USER,
        principalId: otherUserId,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
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

    it('unlinks missing agent resource files without invoking storage deletion', async () => {
      const missingFileId = uuidv4();
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: otherUserId,
        tool_resources: {
          file_search: {
            file_ids: [missingFileId],
          },
        },
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          tool_resource: 'file_search',
          files: [{ file_id: missingFileId, filepath: '/uploads/missing.txt' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('File associations removed successfully from agent');
      expect(processDeleteRequest).not.toHaveBeenCalled();

      const updatedAgent = await Agent.findOne({ id: agent.id }).lean();
      expect(updatedAgent.tool_resources.file_search.file_ids).toEqual([]);
    });

    it('prevents unlinking missing agent resource files without agent edit access', async () => {
      const missingFileId = uuidv4();
      const agent = await createAgent({
        id: uuidv4(),
        name: 'Test Agent',
        provider: 'openai',
        model: 'gpt-4',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [missingFileId],
          },
        },
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agent.id,
          tool_resource: 'file_search',
          files: [{ file_id: missingFileId, filepath: '/uploads/missing.txt' }],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(missingFileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();

      const updatedAgent = await Agent.findOne({ id: agent.id }).lean();
      expect(updatedAgent.tool_resources.file_search.file_ids).toEqual([missingFileId]);
    });
  });

  describe('GET /files/download-url/:userId/:file_id', () => {
    it('returns a direct signed download URL when the strategy supports it', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockResolvedValue('https://cdn.example.com/file.pdf?signed');
      getStrategyFunctions.mockReturnValue({ getDownloadURL });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        bytes: 200,
        type: 'application/pdf',
        source: FileSources.s3,
        text: 'private extracted text',
      });

      const response = await request(app).get(`/files/download-url/${otherUserId}/${userFileId}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        url: 'https://cdn.example.com/file.pdf?signed',
        filename: 'file.pdf',
        type: 'application/pdf',
      });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.metadata).toMatchObject({
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        source: FileSources.s3,
      });
      expect(response.body.metadata).not.toHaveProperty('_id');
      expect(response.body.metadata).not.toHaveProperty('__v');
      expect(response.body.metadata).not.toHaveProperty('user');
      expect(response.body.metadata).not.toHaveProperty('tenantId');
      expect(response.body.metadata).not.toHaveProperty('text');
      expect(getDownloadURL).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ file_id: userFileId }),
          customFilename: 'file.pdf',
          contentType: 'application/pdf',
        }),
      );
    });

    it('returns 501 when the strategy does not support direct URLs', async () => {
      const userFileId = uuidv4();
      getStrategyFunctions.mockReturnValue({});

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.txt',
        filepath: 'uploads/user/file.txt',
        bytes: 200,
        type: 'text/plain',
        source: FileSources.local,
      });

      const response = await request(app).get(`/files/download-url/${otherUserId}/${userFileId}`);

      expect(response.status).toBe(501);
    });

    it('denies tenant-scoped files before issuing a signed URL', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockResolvedValue('https://cdn.example.com/file.pdf?signed');
      getStrategyFunctions.mockReturnValue({ getDownloadURL });

      await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
        createFile({
          user: otherUserId,
          file_id: userFileId,
          filename: 'file.pdf',
          filepath: 'uploads/user/file.pdf',
          bytes: 200,
          type: 'application/pdf',
          source: FileSources.s3,
          tenantId: 'tenant-a',
        }),
      );

      const response = await request(app).get(`/files/download-url/${otherUserId}/${userFileId}`);

      expect(response.status).toBe(403);
      expect(getDownloadURL).not.toHaveBeenCalled();
    });

    it('returns 500 when direct URL generation fails', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockRejectedValue(new Error('signing failed'));
      getStrategyFunctions.mockReturnValue({ getDownloadURL });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        bytes: 200,
        type: 'application/pdf',
        source: FileSources.s3,
      });

      const response = await request(app).get(`/files/download-url/${otherUserId}/${userFileId}`);

      expect(response.status).toBe(500);
      expect(response.text).toBe('Error generating file download URL');
    });
  });

  describe('GET /files/download/:userId/:file_id', () => {
    it('streams proxied downloads by default when a direct URL is available', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockResolvedValue('https://cdn.example.com/file.pdf?signed');
      const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(['file content']));
      getStrategyFunctions.mockReturnValue({ getDownloadURL, getDownloadStream });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        bytes: 200,
        type: 'application/pdf',
        source: FileSources.cloudfront,
        text: 'private extracted text',
      });

      const response = await request(app).get(`/files/download/${otherUserId}/${userFileId}`);

      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe('file content');
      expect(response.headers.location).toBeUndefined();
      const metadata = JSON.parse(decodeURIComponent(response.headers['x-file-metadata']));
      expect(metadata).toMatchObject({
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        source: FileSources.cloudfront,
      });
      expect(metadata).not.toHaveProperty('_id');
      expect(metadata).not.toHaveProperty('__v');
      expect(metadata).not.toHaveProperty('user');
      expect(metadata).not.toHaveProperty('tenantId');
      expect(metadata).not.toHaveProperty('text');
      expect(getDownloadURL).not.toHaveBeenCalled();
      expect(getDownloadStream).toHaveBeenCalledWith(expect.any(Object), 'uploads/user/file.pdf');
    });

    it('redirects to a direct signed download URL when explicitly requested', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockResolvedValue('https://cdn.example.com/file.pdf?signed');
      const getDownloadStream = jest.fn();
      getStrategyFunctions.mockReturnValue({ getDownloadURL, getDownloadStream });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.pdf',
        filepath: 'uploads/user/file.pdf',
        bytes: 200,
        type: 'application/pdf',
        source: FileSources.cloudfront,
      });

      const response = await request(app).get(
        `/files/download/${otherUserId}/${userFileId}?direct=true`,
      );

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://cdn.example.com/file.pdf?signed');
      expect(response.headers['x-file-metadata']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      expect(getDownloadStream).not.toHaveBeenCalled();
    });

    it('falls back to streaming when direct URL generation fails', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockRejectedValue(new Error('missing signing keys'));
      const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(['file content']));
      getStrategyFunctions.mockReturnValue({ getDownloadURL, getDownloadStream });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.txt',
        filepath: 'uploads/user/file.txt',
        bytes: 200,
        type: 'text/plain',
        source: FileSources.s3,
      });

      const response = await request(app).get(
        `/files/download/${otherUserId}/${userFileId}?direct=true`,
      );

      expect(response.status).toBe(200);
      expect(response.body.toString()).toBe('file content');
      expect(response.headers.location).toBeUndefined();
      expect(response.headers['cache-control']).toBeUndefined();
      expect(getDownloadURL).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ file_id: userFileId }),
          customFilename: 'file.txt',
          contentType: 'text/plain',
        }),
      );
      expect(getDownloadStream).toHaveBeenCalledWith(expect.any(Object), 'uploads/user/file.txt');
    });

    it('returns 501 when direct URL generation fails and no stream fallback exists', async () => {
      const userFileId = uuidv4();
      const getDownloadURL = jest.fn().mockRejectedValue(new Error('missing signing keys'));
      getStrategyFunctions.mockReturnValue({ getDownloadURL });

      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'file.txt',
        filepath: 'uploads/user/file.txt',
        bytes: 200,
        type: 'text/plain',
        source: FileSources.cloudfront,
      });

      const response = await request(app).get(
        `/files/download/${otherUserId}/${userFileId}?direct=true`,
      );

      expect(response.status).toBe(501);
      expect(response.text).toBe('Not Implemented');
      expect(response.headers.location).toBeUndefined();
      expect(getDownloadURL).toHaveBeenCalledWith(
        expect.objectContaining({
          file: expect.objectContaining({ file_id: userFileId }),
          customFilename: 'file.txt',
          contentType: 'text/plain',
        }),
      );
    });
  });
});
