const express = require('express');
const request = require('supertest');

const mockMapAgentManagementError = jest.fn(() => ({
  status: 404,
  body: { error: { code: 'not_found', message: 'Agent not found' } },
}));
const mockList = jest.fn((_req, res) => res.status(200).json({ object: 'list', data: [] }));
const mockGet = jest.fn((_req, res) => res.status(200).json({ id: 'agent-one' }));
const mockCreateAgentManagementReadHandlers = jest.fn(() => ({
  list: mockList,
  get: mockGet,
}));
const mockCreate = jest.fn((_req, res) => res.status(201).json({ id: 'agent-created' }));
let mockCreateDeps;
const mockCreateAgentManagementCreateHandler = jest.fn((deps) => {
  mockCreateDeps = deps;
  return mockCreate;
});
const mockBrowserCreate = jest.fn();
const mockCheckBan = jest.fn((_req, _res, next) => next());
const mockConfigMiddleware = jest.fn((_req, _res, next) => next());
const mockUaParser = jest.fn((_req, _res, next) => next());

const mockRequireAgentManagementAuth = jest.fn((req, res, next) => {
  if (req.headers.authorization !== 'Bearer valid-token') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = { id: 'integration-user', tenantId: 'tenant-a', role: 'USER' };
  next();
});

jest.mock('../middleware', () => ({
  requireAgentManagementAuth: mockRequireAgentManagementAuth,
}));
jest.mock('@librechat/api', () => ({
  mapAgentManagementError: mockMapAgentManagementError,
  createAgentManagementCreateHandler: mockCreateAgentManagementCreateHandler,
  createAgentManagementReadHandlers: mockCreateAgentManagementReadHandlers,
}));
jest.mock('~/server/middleware', () => ({
  checkBan: mockCheckBan,
  configMiddleware: mockConfigMiddleware,
  uaParser: mockUaParser,
}));
jest.mock('~/server/controllers/agents/v1', () => ({ createAgent: mockBrowserCreate }));
jest.mock('~/server/middleware/roles/capabilities', () => ({ hasCapability: jest.fn() }));
jest.mock('~/server/services/PermissionService', () => ({
  checkPermission: jest.fn(),
  findAccessibleResources: jest.fn(),
}));
jest.mock('~/models', () => ({
  getRoleByName: jest.fn(),
  getAgentWithVersionCount: jest.fn(),
  getAgentManagementListByAccess: jest.fn(),
}));

const router = require('../management');

describe('Agent Management route boundary', () => {
  const app = express();
  app.use('/api/agents/v1/agents', router);

  beforeEach(() => {
    mockRequireAgentManagementAuth.mockClear();
    mockCheckBan.mockClear();
    mockConfigMiddleware.mockClear();
    mockUaParser.mockClear();
    mockMapAgentManagementError.mockClear();
  });

  it('rejects a request before reaching management routes without machine authentication', async () => {
    const response = await request(app)
      .post('/api/agents/v1/agents')
      .send({ name: 'Managed Agent', provider: 'openAI', model: 'gpt-5' });

    expect(response.status).toBe(401);
    expect(mockRequireAgentManagementAuth).toHaveBeenCalledTimes(1);
    expect(mockCheckBan).not.toHaveBeenCalled();
    expect(mockUaParser).not.toHaveBeenCalled();
  });

  it('allows an authenticated non-browser client into the management router', async () => {
    const response = await request(app)
      .post('/api/agents/v1/agents/not-a-management-operation')
      .set('Authorization', 'Bearer valid-token')
      .set('User-Agent', 'curl/8.0.0');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Agent not found' } });
    expect(mockCheckBan).toHaveBeenCalledTimes(1);
    expect(mockUaParser).not.toHaveBeenCalled();
    expect(mockMapAgentManagementError).toHaveBeenCalledWith('not_found');
    expect(mockRequireAgentManagementAuth).toHaveBeenCalledTimes(1);
  });

  it('dispatches authenticated list and retrieve requests to the management read handlers', async () => {
    const listResponse = await request(app)
      .get('/api/agents/v1/agents')
      .set('Authorization', 'Bearer valid-token');
    const getResponse = await request(app)
      .get('/api/agents/v1/agents/agent-one')
      .set('Authorization', 'Bearer valid-token');

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('loads Agent configuration and dispatches authenticated creation requests', async () => {
    const response = await request(app)
      .post('/api/agents/v1/agents')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Managed Agent', provider: 'openAI', model: 'gpt-5' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 'agent-created' });
    expect(mockConfigMiddleware).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreateDeps.getRoleByName).toEqual(expect.any(Function));
    expect(mockCreateDeps.createAgent).toBe(mockBrowserCreate);
  });
});
