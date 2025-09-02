const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { fileSchema } = require('@librechat/data-schemas');
const { agentSchema } = require('@librechat/data-schemas');
const { projectSchema } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { GLOBAL_PROJECT_NAME } = require('librechat-data-provider').Constants;
const { getFiles, createFile } = require('./File');
const { getProjectByName } = require('./Project');
const { createAgent } = require('./Agent');

let File;
let Agent;
let Project;

describe('File Access Control', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    File = mongoose.models.File || mongoose.model('File', fileSchema);
    Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
    Project = mongoose.models.Project || mongoose.model('Project', projectSchema);
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await File.deleteMany({});
    await Agent.deleteMany({});
    await Project.deleteMany({});
  });

  describe('hasAccessToFilesViaAgent', () => {
    it('should efficiently check access for multiple files at once', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const authorId = new mongoose.Types.ObjectId().toString();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];

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
      await createAgent({
        id: agentId,
        name: 'Test Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        isCollaborative: true,
        tool_resources: {
          file_search: {
            file_ids: [fileIds[0], fileIds[1]],
          },
        },
      });

      // Get or create global project
      const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, '_id');

      // Share agent globally
      await Agent.updateOne({ id: agentId }, { $push: { projectIds: globalProject._id } });

      // Check access for all files
      const { hasAccessToFilesViaAgent } = require('./File');
      const accessMap = await hasAccessToFilesViaAgent(userId, fileIds, agentId);

      // Should have access only to the first two files
      expect(accessMap.get(fileIds[0])).toBe(true);
      expect(accessMap.get(fileIds[1])).toBe(true);
      expect(accessMap.get(fileIds[2])).toBe(false);
      expect(accessMap.get(fileIds[3])).toBe(false);
    });

    it('should grant access to all files when user is the agent author', async () => {
      const authorId = new mongoose.Types.ObjectId().toString();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4(), uuidv4()];

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
      const { hasAccessToFilesViaAgent } = require('./File');
      const accessMap = await hasAccessToFilesViaAgent(authorId, fileIds, agentId);

      // Author should have access to all files
      expect(accessMap.get(fileIds[0])).toBe(true);
      expect(accessMap.get(fileIds[1])).toBe(true);
      expect(accessMap.get(fileIds[2])).toBe(true);
    });

    it('should handle non-existent agent gracefully', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const fileIds = [uuidv4(), uuidv4()];

      const { hasAccessToFilesViaAgent } = require('./File');
      const accessMap = await hasAccessToFilesViaAgent(userId, fileIds, 'non-existent-agent');

      // Should have no access to any files
      expect(accessMap.get(fileIds[0])).toBe(false);
      expect(accessMap.get(fileIds[1])).toBe(false);
    });

    it('should deny access when agent is not collaborative', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const authorId = new mongoose.Types.ObjectId().toString();
      const agentId = uuidv4();
      const fileIds = [uuidv4(), uuidv4()];

      // Create agent with files but isCollaborative: false
      await createAgent({
        id: agentId,
        name: 'Non-Collaborative Agent',
        author: authorId,
        model: 'gpt-4',
        provider: 'openai',
        isCollaborative: false,
        tool_resources: {
          file_search: {
            file_ids: fileIds,
          },
        },
      });

      // Get or create global project
      const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME, '_id');

      // Share agent globally
      await Agent.updateOne({ id: agentId }, { $push: { projectIds: globalProject._id } });

      // Check access for files
      const { hasAccessToFilesViaAgent } = require('./File');
      const accessMap = await hasAccessToFilesViaAgent(userId, fileIds, agentId);

      // Should have no access to any files when isCollaborative is false
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

      // Create/get global project using getProjectByName which will upsert
      const globalProject = await getProjectByName(GLOBAL_PROJECT_NAME);

      // Create agent with shared file
      await createAgent({
        id: agentId,
        name: 'Shared Agent',
        provider: 'test',
        model: 'test-model',
        author: authorId,
        projectIds: [globalProject._id],
        isCollaborative: true,
        tool_resources: {
          file_search: {
            file_ids: [sharedFileId],
          },
        },
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

      // Get files with access control
      const files = await getFiles(
        { file_id: { $in: [ownedFileId, sharedFileId, inaccessibleFileId] } },
        null,
        { text: 0 },
        { userId: userId.toString(), agentId },
      );

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
