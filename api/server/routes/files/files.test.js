const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;

// Mock dependencies
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

const { createFile } = require('~/models/File');
const { createAgent } = require('~/models/Agent');
const { getProjectByName } = require('~/models/Project');
const { processDeleteRequest } = require('~/server/services/Files/process');

// Import the router after mocks
const router = require('./files');

describe('File Routes - Delete with Agent Access', () => {
  let app;
  let mongoServer;
  let authorId;
  let otherUserId;
  let agentId;
  let fileId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Initialize models
    require('~/db/models');

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
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Clear database
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }

    authorId = new mongoose.Types.ObjectId().toString();
    otherUserId = new mongoose.Types.ObjectId().toString();
    fileId = uuidv4();

    // Create a file owned by the author
    await createFile({
      user: authorId,
      file_id: fileId,
      filename: 'test.txt',
      filepath: `/uploads/${authorId}/${fileId}`,
      bytes: 1024,
      type: 'text/plain',
    });

    // Create an agent with the file attached
    const agent = await createAgent({
      id: uuidv4(),
      name: 'Test Agent',
      author: authorId,
      model: 'gpt-4',
      provider: 'openai',
      isCollaborative: true,
      tool_resources: {
        file_search: {
          file_ids: [fileId],
        },
      },
    });
    agentId = agent.id;

    // Share the agent globally
    const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, '_id');
    if (globalProject) {
      const { updateAgent } = require('~/models/Agent');
      await updateAgent({ id: agentId }, { projectIds: [globalProject._id] });
    }
  });

  describe('DELETE /files', () => {
    it('should allow deleting files owned by the user', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: `/uploads/${otherUserId}/${userFileId}`,
        bytes: 1024,
        type: 'text/plain',
      });

      const response = await request(app)
        .delete('/files')
        .send({
          files: [
            {
              file_id: userFileId,
              filepath: `/uploads/${otherUserId}/${userFileId}`,
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
              filepath: `/uploads/${authorId}/${fileId}`,
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(fileId);
      expect(processDeleteRequest).not.toHaveBeenCalled();
    });

    it('should allow deleting files accessible through shared agent', async () => {
      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agentId,
          files: [
            {
              file_id: fileId,
              filepath: `/uploads/${authorId}/${fileId}`,
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
        filepath: `/uploads/${authorId}/${unattachedFileId}`,
        bytes: 1024,
        type: 'text/plain',
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agentId,
          files: [
            {
              file_id: unattachedFileId,
              filepath: `/uploads/${authorId}/${unattachedFileId}`,
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unattachedFileId);
    });

    it('should handle mixed authorized and unauthorized files', async () => {
      // Create a file owned by the current user
      const userFileId = uuidv4();
      await createFile({
        user: otherUserId,
        file_id: userFileId,
        filename: 'user-file.txt',
        filepath: `/uploads/${otherUserId}/${userFileId}`,
        bytes: 1024,
        type: 'text/plain',
      });

      // Create an unauthorized file
      const unauthorizedFileId = uuidv4();
      await createFile({
        user: authorId,
        file_id: unauthorizedFileId,
        filename: 'unauthorized.txt',
        filepath: `/uploads/${authorId}/${unauthorizedFileId}`,
        bytes: 1024,
        type: 'text/plain',
      });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agentId,
          files: [
            {
              file_id: fileId, // Authorized through agent
              filepath: `/uploads/${authorId}/${fileId}`,
            },
            {
              file_id: userFileId, // Owned by user
              filepath: `/uploads/${otherUserId}/${userFileId}`,
            },
            {
              file_id: unauthorizedFileId, // Not authorized
              filepath: `/uploads/${authorId}/${unauthorizedFileId}`,
            },
          ],
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('You can only delete files you have access to');
      expect(response.body.unauthorizedFiles).toContain(unauthorizedFileId);
      expect(response.body.unauthorizedFiles).not.toContain(fileId);
      expect(response.body.unauthorizedFiles).not.toContain(userFileId);
    });

    it('should prevent deleting files when agent is not collaborative', async () => {
      // Update the agent to be non-collaborative
      const { updateAgent } = require('~/models/Agent');
      await updateAgent({ id: agentId }, { isCollaborative: false });

      const response = await request(app)
        .delete('/files')
        .send({
          agent_id: agentId,
          files: [
            {
              file_id: fileId,
              filepath: `/uploads/${authorId}/${fileId}`,
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
