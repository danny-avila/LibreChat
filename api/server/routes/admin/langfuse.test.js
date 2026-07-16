const express = require('express');
const request = require('supertest');

let deniedCapability;
const middlewareCalls = [];
const mockRequireJwtAuth = jest.fn((req, _res, next) => {
  req.user = { id: 'user-1', role: 'DELEGATED_ADMIN', tenantId: 'tenant-a' };
  middlewareCalls.push('jwt');
  next();
});
const mockRequireCapability = jest.fn((capability) => (req, res, next) => {
  middlewareCalls.push(capability);
  if (deniedCapability === capability) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});
const mockHandlers = {
  getConnection: jest.fn((_req, res) => res.status(200).json({ handler: 'get' })),
  updateConnection: jest.fn((_req, res) => res.status(200).json({ handler: 'update' })),
  testConnection: jest.fn((_req, res) => res.status(200).json({ handler: 'test' })),
};

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: { ACCESS_ADMIN: 'access:admin' },
  configCapability: (section) => `manage:configs:${section}`,
}));

jest.mock('@librechat/api', () => ({
  createAdminLangfuseHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: mockRequireCapability,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: mockRequireJwtAuth,
}));

jest.mock('~/server/services/Config', () => ({
  invalidateConfigCaches: jest.fn(),
}));

jest.mock('~/models', () => ({
  findConfigByPrincipal: jest.fn(),
  patchConfigFields: jest.fn(),
}));

describe('admin Langfuse routes', () => {
  function createApp() {
    delete require.cache[require.resolve('./langfuse')];
    const router = require('./langfuse');
    const app = express();
    app.use(express.json());
    app.use('/api/admin/langfuse', router);
    return app;
  }

  beforeEach(() => {
    deniedCapability = undefined;
    middlewareCalls.length = 0;
    jest.clearAllMocks();
  });

  it('requires admin access and Langfuse manage access for connection reads', async () => {
    const response = await request(createApp()).get('/api/admin/langfuse/connection').expect(200);

    expect(response.body).toEqual({ handler: 'get' });
    expect(middlewareCalls).toEqual(['jwt', 'access:admin', 'manage:configs:langfuse']);
    expect(mockHandlers.getConnection).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PUT', '/api/admin/langfuse/connection', 'updateConnection'],
    ['POST', '/api/admin/langfuse/connection/test', 'testConnection'],
  ])('requires Langfuse manage access for %s %s', async (method, path, handlerName) => {
    const app = createApp();
    const response = await request(app)[method.toLowerCase()](path).send({}).expect(200);

    expect(response.body).toEqual({
      handler: handlerName === 'updateConnection' ? 'update' : 'test',
    });
    expect(middlewareCalls).toEqual(['jwt', 'access:admin', 'manage:configs:langfuse']);
    expect(mockHandlers[handlerName]).toHaveBeenCalledTimes(1);
  });

  it('blocks updates when the user lacks Langfuse manage access', async () => {
    deniedCapability = 'manage:configs:langfuse';

    await request(createApp()).put('/api/admin/langfuse/connection').send({}).expect(403);

    expect(mockHandlers.updateConnection).not.toHaveBeenCalled();
  });
});
