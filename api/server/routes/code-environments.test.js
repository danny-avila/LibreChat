const express = require('express');
const request = require('supertest');

const middlewareCalls = [];
const mockRequireJwtAuth = jest.fn((req, _res, next) => {
  middlewareCalls.push('jwt');
  req.user = { id: '68b2f0c498f24c1e78fa0001', role: 'USER' };
  next();
});
const mockRequireCapability = jest.fn((capability) => (req, _res, next) => {
  middlewareCalls.push(capability);
  next();
});
const mockCodeEnvironmentPairingLimiter = jest.fn((_req, _res, next) => {
  middlewareCalls.push('pairing-limit');
  next();
});
const mockRegistry = {};
const mockGetCodeEnvironmentRegistry = jest.fn(() => mockRegistry);
const mockHandlers = {
  list: jest.fn((_req, res) => res.status(200).json({ environments: [] })),
  register: jest.fn((_req, res) => res.status(201).json({ environment: { id: 'code-1' } })),
  pair: jest.fn((_req, res) => res.status(201).json({ environment: { id: 'code-1' } })),
  status: jest.fn((_req, res) =>
    res.status(200).json({ environmentId: 'code-1', status: 'ready' }),
  ),
  updateSettings: jest.fn((_req, res) => res.status(200).json({ environment: { id: 'code-1' } })),
  remove: jest.fn((_req, res) => res.status(200).json({ environment: { id: 'code-1' } })),
};

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: { MANAGE_CODE_ENVIRONMENTS: 'manage:code_environments' },
}));

jest.mock('@librechat/api', () => ({
  createCodeEnvironmentRegistry: jest.fn(() => mockRegistry),
  createCodeEnvironmentHttpHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: mockRequireCapability,
}));
jest.mock('~/server/middleware/limiters/code', () => ({
  codeEnvironmentPairingLimiter: mockCodeEnvironmentPairingLimiter,
}));

jest.mock('~/server/middleware', () => ({ requireJwtAuth: mockRequireJwtAuth }));
jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  getCodeEnvironmentRegistry: mockGetCodeEnvironmentRegistry,
}));
jest.mock('~/models', () => ({ isAgentTriggerPrincipalActive: jest.fn() }));

function createApp() {
  delete require.cache[require.resolve('./code-environments')];
  const router = require('./code-environments');
  const app = express();
  app.use(express.json());
  app.use('/api/code-environments', router);
  return app;
}

describe('code environment routes', () => {
  beforeEach(() => {
    middlewareCalls.length = 0;
    jest.clearAllMocks();
  });

  it('defers registry initialization until the route is requested', () => {
    createApp();

    expect(mockGetCodeEnvironmentRegistry).not.toHaveBeenCalled();
  });

  it('allows authenticated discovery without the management capability', async () => {
    await request(createApp()).get('/api/code-environments').expect(200, { environments: [] });

    expect(middlewareCalls).toEqual(['jwt']);
    expect(mockHandlers.list).toHaveBeenCalledTimes(1);
  });

  it('requires the management capability before registration', async () => {
    await request(createApp())
      .post('/api/code-environments')
      .send({ name: 'Personal VM' })
      .expect(201);

    expect(middlewareCalls).toEqual(['jwt', 'manage:code_environments']);
    expect(mockHandlers.register).toHaveBeenCalledTimes(1);
  });

  it('allows an authenticated user to pair through an opted-in control plane', async () => {
    await request(createApp())
      .post('/api/code-environments/pairings')
      .send({ name: 'Personal VM', controlPlaneId: 'shared-code-api' })
      .expect(201);

    expect(middlewareCalls).toEqual(['jwt', 'pairing-limit']);
    expect(mockHandlers.pair).toHaveBeenCalledTimes(1);
  });

  it('allows an authenticated owner to remove an environment', async () => {
    await request(createApp()).delete('/api/code-environments/code-1').expect(200);

    expect(middlewareCalls).toEqual(['jwt']);
    expect(mockHandlers.remove).toHaveBeenCalledTimes(1);
  });

  it('allows an authenticated principal to read environment status', async () => {
    await request(createApp()).get('/api/code-environments/code-1/status').expect(200, {
      environmentId: 'code-1',
      status: 'ready',
    });

    expect(middlewareCalls).toEqual(['jwt']);
    expect(mockHandlers.status).toHaveBeenCalledTimes(1);
  });

  it('allows an authenticated owner to update exposed environment settings', async () => {
    await request(createApp())
      .patch('/api/code-environments/code-1/settings')
      .send({ settings: { permissions: { fileWrite: 'ask' } } })
      .expect(200);

    expect(middlewareCalls).toEqual(['jwt']);
    expect(mockHandlers.updateSettings).toHaveBeenCalledTimes(1);
  });
});
