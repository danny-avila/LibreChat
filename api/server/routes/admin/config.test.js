const express = require('express');
const request = require('supertest');

let mockDenyAdminAccess = false;
const mockReloadConfig = jest.fn((_req, res) => res.status(200).json({ scope: 'local' }));
const mockHandlers = {
  listConfigs: jest.fn(),
  getBaseConfig: jest.fn(),
  reloadConfig: mockReloadConfig,
  getConfig: jest.fn(),
  upsertConfigOverrides: jest.fn(),
  patchConfigField: jest.fn(),
  tombstoneConfigField: jest.fn(),
  deleteConfigField: jest.fn(),
  deleteConfigOverrides: jest.fn(),
  toggleConfig: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  createAdminConfigHandlers: jest.fn(() => mockHandlers),
}));

jest.mock('@librechat/data-schemas', () => ({
  SystemCapabilities: { ACCESS_ADMIN: 'access:admin' },
}));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  hasCapability: jest.fn(),
  hasConfigCapability: jest.fn(),
  hasAnyConfigReadAccess: jest.fn(),
  getReadableConfigSections: jest.fn(),
  requireCapability: jest.fn(() => (_req, res, next) => {
    if (mockDenyAdminAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  }),
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: jest.fn((req, _res, next) => {
    req.user = { id: 'admin-1', role: 'ADMIN' };
    next();
  }),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  invalidateConfigCaches: jest.fn(),
  reloadCustomConfig: jest.fn(),
}));

jest.mock('~/models', () => ({}));

function createApp() {
  delete require.cache[require.resolve('./config')];
  const app = express();
  app.use('/api/admin/config', require('./config'));
  return app;
}

describe('admin config reload route', () => {
  beforeEach(() => {
    mockDenyAdminAccess = false;
    jest.clearAllMocks();
  });

  it('allows an authenticated admin', async () => {
    const response = await request(createApp()).post('/api/admin/config/reload').expect(200);

    expect(response.body).toEqual({ scope: 'local' });
    expect(mockReloadConfig).toHaveBeenCalledTimes(1);
  });

  it('returns 403 before the handler for a non-admin', async () => {
    mockDenyAdminAccess = true;

    await request(createApp()).post('/api/admin/config/reload').expect(403);

    expect(mockReloadConfig).not.toHaveBeenCalled();
  });
});
