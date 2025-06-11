const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const { getFiles, createFile } = require('./File');
const { createAgent } = require('./Agent');
const { grantPermission } = require('~/server/services/PermissionService');
const { seedDefaultRoles } = require('~/models');

let File;
let Agent;
let AclEntry;
let User;
let modelsToCleanup = [];

describe('File Access Control', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialize all models
    const models = createModels(mongoose);

    // Track which models we're adding
    modelsToCleanup = Object.keys(models);

    // Register models on mongoose.models so methods can access them
    const dbModels = require('~/db/models');
    Object.assign(mongoose.models, dbModels);

    File = dbModels.File;
    Agent = dbModels.Agent;
    AclEntry = dbModels.AclEntry;
    User = dbModels.User;

    // Seed default roles
    await seedDefaultRoles();
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
    await File.deleteMany({});
    await Agent.deleteMany({});
    await AclEntry.deleteMany({});
    await User.deleteMany({});
    // Don't delete AccessRole as they are seeded defaults needed for tests
  });

  describe('hasAccessToFilesViaAgent', () => {
    it('should efficiently check access for multiple files at once', async () => {
      const userId = new mongoose.Types.ObjectId();
      const authorId = new mongoose.Types.ObjectId();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];

      // Create users
      await User.create({
        _id: userId,
        email: 'user@example.com',
        emailVerified: true,
        provider: 'local',
      });

      await User.create({
        _id: authorId,
        email: 'author@example.com',
        emailVerified: true,
        provider: 'local',
      });

      // Create files
      for (const fileId of fileIds) {
        await createFile({
          user: authorId,
          file_id: fileId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}`,
        });
      }

      // Create agent with only first two files attached
      const agent = await createAgent({
        id: agentId,
        name: 'Test Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        tool_resources: {
          file_search: {
            file_ids: [fileIds[0], fileIds[1]],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_editor',
        grantedBy: authorId,
      });

      // Check access for all files
      const { hasAccessToFilesViaAgent } = require('~/server/services/Files/permissions');
      const accessMap = await hasAccessToFilesViaAgent(userId.toString(), fileIds, agentId);

      // Should have access only to the first two files
      expect(accessMap.get(fileIds[0])).toBe(true);
      expect(accessMap.get(fileIds[1])).toBe(true);
      expect(accessMap.get(fileIds[2])).toBe(false);
      expect(accessMap.get(fileIds[3])).toBe(false);
    });

    it('should grant access to all files when user is the agent author', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4(), uuidv4()];

      // Create author user
      await User.create({
        _id: authorId,
        email: 'author@example.com',
        emailVerified: true,
        provider: 'local',
      });

      // Create agent
      await createAgent({
        id: agentId,
        name: 'Test Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        tool_resources: {
          file_search: {
            file_ids: [fileIds[0]], // Only one file attached
          },
        },
      });

      // Check access as the author
      const { hasAccessToFilesViaAgent } = require('~/server/services/Files/permissions');
      const accessMap = await hasAccessToFilesViaAgent(authorId.toString(), fileIds, agentId);

      // Author should have access to all files
      expect(accessMap.get(fileIds[0])).toBe(true);
      expect(accessMap.get(fileIds[1])).toBe(true);
      expect(accessMap.get(fileIds[2])).toBe(true);
    });

    it('should handle non-existent agent gracefully', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileIds = [uuidv4(), uuidv4()];

      // Create user
      await User.create({
        _id: userId,
        email: 'user@example.com',
        emailVerified: true,
        provider: 'local',
      });

      const { hasAccessToFilesViaAgent } = require('~/server/services/Files/permissions');
      const accessMap = await hasAccessToFilesViaAgent(
        userId.toString(),
        fileIds,
        'non-existent-agent',
      );

      // Should have no access to any files
      expect(accessMap.get(fileIds[0])).toBe(false);
      expect(accessMap.get(fileIds[1])).toBe(false);
    });

    it('should deny access when user only has VIEW permission', async () => {
      const userId = new mongoose.Types.ObjectId();
      const authorId = new mongoose.Types.ObjectId();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4()];

      // Create users
      await User.create({
        _id: userId,
        email: 'user@example.com',
        emailVerified: true,
        provider: 'local',
      });

      await User.create({
        _id: authorId,
        email: 'author@example.com',
        emailVerified: true,
        provider: 'local',
      });

      // Create agent with files
      const agent = await createAgent({
        id: agentId,
        name: 'View-Only Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        tool_resources: {
          file_search: {
            file_ids: fileIds,
          },
        },
      });

      // Grant only VIEW permission to user on the agent
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_viewer',
        grantedBy: authorId,
      });

      // Check access for files
      const { hasAccessToFilesViaAgent } = require('~/server/services/Files/permissions');
      const accessMap = await hasAccessToFilesViaAgent(userId.toString(), fileIds, agentId);

      // Should have no access to any files when only VIEW permission
      expect(accessMap.get(fileIds[0])).toBe(false);
      expect(accessMap.get(fileIds[1])).toBe(false);
    });
  });

  describe('getFiles with agent access control', () => {
    test('should return files owned by user and files accessible through agent', async () => {
      const authorId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const agentId = `agent_${uuidv4()}`;
      const ownedFileId = `file_${uuidv4()}`;
      const sharedFileId = `file_${uuidv4()}`;
      const inaccessibleFileId = `file_${uuidv4()}`;

      // Create users
      await User.create({
        _id: userId,
        email: 'user@example.com',
        emailVerified: true,
        provider: 'local',
      });

      await User.create({
        _id: authorId,
        email: 'author@example.com',
        emailVerified: true,
        provider: 'local',
      });

      // Create agent with shared file
      const agent = await createAgent({
        id: agentId,
        name: 'Shared Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        tool_resources: {
          file_search: {
            file_ids: [sharedFileId],
          },
        },
      });

      // Grant EDIT permission to user on the agent
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: agent._id,
        accessRoleId: 'agent_editor',
        grantedBy: authorId,
      });

      // Create files
      await createFile({
        file_id: ownedFileId,
        user: userId,
        filename: 'owned.txt',
        filepath: '/uploads/owned.txt',
        type: 'text/plain',
        bytes: 100,
      });

      await createFile({
        file_id: sharedFileId,
        user: authorId,
        filename: 'shared.txt',
        filepath: '/uploads/shared.txt',
        type: 'text/plain',
        bytes: 200,
        embedded: true,
      });

      await createFile({
        file_id: inaccessibleFileId,
        user: authorId,
        filename: 'inaccessible.txt',
        filepath: '/uploads/inaccessible.txt',
        type: 'text/plain',
        bytes: 300,
      });

      // Get all files first
      const allFiles = await getFiles(
        { file_id: { $in: [ownedFileId, sharedFileId, inaccessibleFileId] } },
        null,
        { text: 0 },
      );

      // Then filter by access control
      const { filterFilesByAgentAccess } = require('~/server/services/Files/permissions');
      const files = await filterFilesByAgentAccess(allFiles, userId.toString(), agentId);

      expect(files).toHaveLength(2);
      expect(files.map((f) => f.file_id)).toContain(ownedFileId);
      expect(files.map((f) => f.file_id)).toContain(sharedFileId);
      expect(files.map((f) => f.file_id)).not.toContain(inaccessibleFileId);
    });

    test('should return all files when no userId/agentId provided', async () => {
      const userId = new mongoose.Types.ObjectId();
      const fileId1 = `file_${uuidv4()}`;
      const fileId2 = `file_${uuidv4()}`;

      await createFile({
        file_id: fileId1,
        user: userId,
        filename: 'file1.txt',
        filepath: '/uploads/file1.txt',
        type: 'text/plain',
        bytes: 100,
      });

      await createFile({
        file_id: fileId2,
        user: new mongoose.Types.ObjectId(),
        filename: 'file2.txt',
        filepath: '/uploads/file2.txt',
        type: 'text/plain',
        bytes: 200,
      });

      const files = await getFiles({ file_id: { $in: [fileId1, fileId2] } });
      expect(files).toHaveLength(2);
    });
  });
});
