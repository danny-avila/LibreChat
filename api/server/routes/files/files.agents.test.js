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

// Import the router after mocks
const router = require('./files');

describe('File Routes - Agent Files Endpoint', () => {
  let app;
  let mongoServer;
  let authorId;
  let otherUserId;
  let agentId;
  let fileId1;
  let fileId2;
  let fileId3;

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
    agentId = uuidv4();
    fileId1 = uuidv4();
    fileId2 = uuidv4();
    fileId3 = uuidv4();

    // Create files
    await createFile({
      user: authorId,
      file_id: fileId1,
      filename: 'agent-file1.txt',
      filepath: `/uploads/${authorId}/${fileId1}`,
      bytes: 1024,
      type: 'text/plain',
    });

    await createFile({
      user: authorId,
      file_id: fileId2,
      filename: 'agent-file2.txt',
      filepath: `/uploads/${authorId}/${fileId2}`,
      bytes: 2048,
      type: 'text/plain',
    });

    await createFile({
      user: otherUserId,
      file_id: fileId3,
      filename: 'user-file.txt',
      filepath: `/uploads/${otherUserId}/${fileId3}`,
      bytes: 512,
      type: 'text/plain',
    });

    // Create an agent with files attached
    await createAgent({
      id: agentId,
      name: 'Test Agent',
      author: authorId,
      model: 'gpt-4',
      provider: 'openai',
      isCollaborative: true,
      tool_resources: {
        file_search: {
          file_ids: [fileId1, fileId2],
        },
      },
    });

    // Share the agent globally
    const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, '_id');
    if (globalProject) {
      const { updateAgent } = require('~/models/Agent');
      await updateAgent({ id: agentId }, { projectIds: [globalProject._id] });
    }
  });

  describe('GET /files/agent/:agent_id', () => {
    it('should return files accessible through the agent for non-author', async () => {
      const response = await request(app).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2); // Only agent files, not user-owned files

      const fileIds = response.body.map((f) => f.file_id);
      expect(fileIds).toContain(fileId1);
      expect(fileIds).toContain(fileId2);
      expect(fileIds).not.toContain(fileId3); // User's own file not included
    });

    it('should return 400 when agent_id is not provided', async () => {
      const response = await request(app).get('/files/agent/');

      expect(response.status).toBe(404); // Express returns 404 for missing route parameter
    });

    it('should return empty array for non-existent agent', async () => {
      const response = await request(app).get('/files/agent/non-existent-agent');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]); // Empty array for non-existent agent
    });

    it('should return empty array when agent is not collaborative', async () => {
      // Create a non-collaborative agent
      const nonCollabAgentId = uuidv4();
      await createAgent({
        id: nonCollabAgentId,
        name: 'Non-Collaborative Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        isCollaborative: false,
        tool_resources: {
          file_search: {
            file_ids: [fileId1],
          },
        },
      });

      // Share it globally
      const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, '_id');
      if (globalProject) {
        const { updateAgent } = require('~/models/Agent');
        await updateAgent({ id: nonCollabAgentId }, { projectIds: [globalProject._id] });
      }

      const response = await request(app).get(`/files/agent/${nonCollabAgentId}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]); // Empty array when not collaborative
    });

    it('should return agent files for agent author', async () => {
      // Create a new app instance with author authentication
      const authorApp = express();
      authorApp.use(express.json());
      authorApp.use((req, res, next) => {
        req.user = { id: authorId };
        req.app = { locals: {} };
        next();
      });
      authorApp.use('/files', router);

      const response = await request(authorApp).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2); // Agent files for author

      const fileIds = response.body.map((f) => f.file_id);
      expect(fileIds).toContain(fileId1);
      expect(fileIds).toContain(fileId2);
      expect(fileIds).not.toContain(fileId3); // User's own file not included
    });

    it('should return files uploaded by other users to shared agent for author', async () => {
      // Create a file uploaded by another user
      const otherUserFileId = uuidv4();
      const anotherUserId = new mongoose.Types.ObjectId().toString();

      await createFile({
        user: anotherUserId,
        file_id: otherUserFileId,
        filename: 'other-user-file.txt',
        filepath: `/uploads/${anotherUserId}/${otherUserFileId}`,
        bytes: 4096,
        type: 'text/plain',
      });

      // Update agent to include the file uploaded by another user
      const { updateAgent } = require('~/models/Agent');
      await updateAgent(
        { id: agentId },
        {
          tool_resources: {
            file_search: {
              file_ids: [fileId1, fileId2, otherUserFileId],
            },
          },
        },
      );

      // Create app instance with author authentication
      const authorApp = express();
      authorApp.use(express.json());
      authorApp.use((req, res, next) => {
        req.user = { id: authorId };
        req.app = { locals: {} };
        next();
      });
      authorApp.use('/files', router);

      const response = await request(authorApp).get(`/files/agent/${agentId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3); // Including file from another user

      const fileIds = response.body.map((f) => f.file_id);
      expect(fileIds).toContain(fileId1);
      expect(fileIds).toContain(fileId2);
      expect(fileIds).toContain(otherUserFileId); // File uploaded by another user
    });
  });
});
