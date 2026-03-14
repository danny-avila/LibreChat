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
const { createAgent } = require('~/models/Agent');

jest.mock('~/server/services/Files/process', () => ({
  processAgentFileUpload: jest.fn().mockImplementation(async ({ res }) => {
    return res.status(200).json({ message: 'Agent file uploaded', file_id: 'test-file-id' });
  }),
  processImageFile: jest.fn().mockImplementation(async ({ res }) => {
    return res.status(200).json({ message: 'Image processed' });
  }),
  filterFile: jest.fn(),
}));

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

const fs = require('fs');
const { processAgentFileUpload } = require('~/server/services/Files/process');

const router = require('~/server/routes/files/images');

describe('POST /images - Agent Upload Permission Check (Integration)', () => {
  let mongoServer;
  let authorId;
  let otherUserId;
  let agentCustomId;
  let User;
  let Agent;
  let AclEntry;
  let methods;
  let modelsToCleanup = [];

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const { createModels } = require('@librechat/data-schemas');
    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);
    methods = createMethods(mongoose);

    User = models.User;
    Agent = models.Agent;
    AclEntry = models.AclEntry;

    await methods.seedDefaultRoles();
  });

  afterAll(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    for (const modelName of modelsToCleanup) {
      if (mongoose.models[modelName]) {
        delete mongoose.models[modelName];
      }
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Agent.deleteMany({});
    await User.deleteMany({});
    await AclEntry.deleteMany({});

    authorId = new mongoose.Types.ObjectId();
    otherUserId = new mongoose.Types.ObjectId();
    agentCustomId = `agent_${uuidv4().replace(/-/g, '').substring(0, 21)}`;

    await User.create({ _id: authorId, username: 'author', email: 'author@test.com' });
    await User.create({ _id: otherUserId, username: 'other', email: 'other@test.com' });

    jest.clearAllMocks();
  });

  const createAppWithUser = (userId, userRole = SystemRoles.USER) => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.method === 'POST') {
        req.file = {
          originalname: 'test.png',
          mimetype: 'image/png',
          size: 100,
          path: '/tmp/t.png',
          filename: 'test.png',
        };
        req.file_id = uuidv4();
      }
      next();
    });
    app.use((req, _res, next) => {
      req.user = { id: userId.toString(), role: userRole };
      req.app = { locals: {} };
      req.config = { fileStrategy: 'local', paths: { imageOutput: '/tmp/images' } };
      next();
    });
    app.use('/images', router);
    return app;
  };

  it('should return 403 when user has no permission on agent', async () => {
    await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/t.png');
  });

  it('should allow upload for agent owner', async () => {
    await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const app = createAppWithUser(authorId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should allow upload for admin regardless of ownership', async () => {
    await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const app = createAppWithUser(otherUserId, SystemRoles.ADMIN);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should allow upload for user with EDIT permission', async () => {
    const agent = await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
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

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should deny upload for user with only VIEW permission', async () => {
    const agent = await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const { grantPermission } = require('~/server/services/PermissionService');
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: otherUserId,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      grantedBy: authorId,
    });

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/t.png');
  });

  it('should skip permission check for regular image uploads without agent_id/tool_resource', async () => {
    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
  });

  it('should return 404 for non-existent agent', async () => {
    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: 'agent_nonexistent123456789',
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not Found');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/t.png');
  });

  it('should allow message_file attachment (boolean true) without EDIT permission', async () => {
    const agent = await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const { grantPermission } = require('~/server/services/PermissionService');
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: otherUserId,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      grantedBy: authorId,
    });

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      message_file: true,
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should allow message_file attachment (string "true") without EDIT permission', async () => {
    const agent = await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const { grantPermission } = require('~/server/services/PermissionService');
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: otherUserId,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      grantedBy: authorId,
    });

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      message_file: 'true',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should deny upload when message_file is false (not a message attachment)', async () => {
    const agent = await createAgent({
      id: agentCustomId,
      name: 'Test Agent',
      provider: 'openai',
      model: 'gpt-4',
      author: authorId,
    });

    const { grantPermission } = require('~/server/services/PermissionService');
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: otherUserId,
      resourceType: ResourceType.AGENT,
      resourceId: agent._id,
      accessRoleId: AccessRoleIds.AGENT_VIEWER,
      grantedBy: authorId,
    });

    const app = createAppWithUser(otherUserId);
    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: agentCustomId,
      tool_resource: 'context',
      message_file: false,
      file_id: uuidv4(),
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/t.png');
  });
});
