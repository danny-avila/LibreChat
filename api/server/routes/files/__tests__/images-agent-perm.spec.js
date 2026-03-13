const express = require('express');
const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { SystemRoles } = require('librechat-data-provider');

jest.mock('~/server/services/Files/process', () => ({
  processAgentFileUpload: jest.fn().mockImplementation(async ({ res }) => {
    return res.status(200).json({ message: 'Agent file uploaded', file_id: 'test-file-id' });
  }),
  processImageFile: jest.fn().mockImplementation(async ({ res }) => {
    return res.status(200).json({ message: 'Image processed' });
  }),
  filterFile: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({
  getAgent: jest.fn(),
}));

jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn(),
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

const { processAgentFileUpload } = require('~/server/services/Files/process');
const { getAgent } = require('~/models/Agent');
const { checkPermission } = require('~/server/services/PermissionService');

const router = require('~/server/routes/files/images');

const AUTHOR_ID = 'author-user-id';
const OTHER_USER_ID = 'other-user-id';
const AGENT_ID = `agent_${uuidv4().replace(/-/g, '').substring(0, 21)}`;

const createApp = (userId, userRole = SystemRoles.USER) => {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    if (req.method === 'POST') {
      req.file = { originalname: 'test.png', mimetype: 'image/png', size: 100, path: '/tmp/t.png', filename: 'test.png' };
      req.file_id = uuidv4();
    }
    next();
  });

  app.use((req, _res, next) => {
    req.user = { id: userId, role: userRole };
    req.app = { locals: {} };
    req.config = { fileStrategy: 'local', paths: { imageOutput: '/tmp/images' } };
    next();
  });

  app.use('/images', router);
  return app;
};

describe('POST /images - Agent Upload Permission Check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAgent.mockResolvedValue({
      _id: 'agent-object-id',
      author: AUTHOR_ID,
      tool_resources: {},
    });
  });

  it('should return 403 when user is not the agent owner and lacks EDIT permission', async () => {
    checkPermission.mockResolvedValue(false);
    const app = createApp(OTHER_USER_ID);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: AGENT_ID,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
  });

  it('should allow the agent owner to upload successfully', async () => {
    const app = createApp(AUTHOR_ID);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: AGENT_ID,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should allow an admin to upload regardless of ownership', async () => {
    const app = createApp(OTHER_USER_ID, SystemRoles.ADMIN);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: AGENT_ID,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });

  it('should skip the permission check for regular image uploads without agent_id/tool_resource', async () => {
    const app = createApp(OTHER_USER_ID);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(getAgent).not.toHaveBeenCalled();
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('should return 404 when agent does not exist', async () => {
    getAgent.mockResolvedValue(null);
    const app = createApp(OTHER_USER_ID);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: 'agent_nonexistent',
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Not Found');
    expect(processAgentFileUpload).not.toHaveBeenCalled();
  });

  it('should allow upload when user has EDIT permission on the agent', async () => {
    checkPermission.mockResolvedValue(true);
    const app = createApp(OTHER_USER_ID);

    const response = await request(app).post('/images').send({
      endpoint: 'agents',
      agent_id: AGENT_ID,
      tool_resource: 'context',
      file_id: uuidv4(),
    });

    expect(response.status).toBe(200);
    expect(processAgentFileUpload).toHaveBeenCalled();
  });
});
