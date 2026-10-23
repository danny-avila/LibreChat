const express = require('express');
const request = require('supertest');
const mongoSanitize = require('express-mongo-sanitize');
const { createRequestSanitizer } = require('@librechat/api');

let hasAdminAccess;
const mockRequireJwtAuth = jest.fn((req, res, next) => {
  if (req.headers.authorization !== 'Bearer admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  req.user = { id: 'user-1', _id: 'user-1', role: 'ADMIN' };
  next();
});
const mockRequireCapability = jest.fn(() => (_req, res, next) => {
  if (!hasAdminAccess) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
});
const mockDb = {
  listAllConfigs: jest.fn(),
  findConfigByPrincipal: jest.fn(),
  writeConfigDocument: jest.fn(),
  unsetConfigField: jest.fn(),
  deleteConfig: jest.fn(),
  toggleConfigActiveTracked: jest.fn(),
  recordAuditEntry: jest.fn(),
};

jest.mock('~/server/middleware', () => ({ requireJwtAuth: mockRequireJwtAuth }));

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: mockRequireCapability,
  hasCapability: jest.fn(async () => true),
  hasConfigCapability: jest.fn(async () => true),
  hasAnyConfigReadAccess: jest.fn(async () => true),
  getReadableConfigSections: jest.fn(async () => ({ broad: true, sections: new Set() })),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(async () => ({ config: {} })),
  overrideCacheTtl: 15_000,
  invalidateConfigCaches: jest.fn(async () => undefined),
}));

jest.mock('~/models', () => mockDb);

/** The app-level order of `api/server/index.js`: body parsing, writable query, sanitizer, router. */
function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'query', {
      ...Object.getOwnPropertyDescriptor(req, 'query'),
      value: req.query,
      writable: true,
    });
    next();
  });
  app.use(createRequestSanitizer(mongoSanitize));
  app.use('/api/admin/config', require('./config'));
  return app;
}

const PROFILE = 'us.anthropic.claude-sonnet-4-6';
const ARN =
  'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-6';

describe('admin config routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    hasAdminAccess = true;
    mockDb.findConfigByPrincipal.mockResolvedValue(null);
    mockDb.writeConfigDocument.mockImplementation(async (principalType, principalId, draft) => ({
      _id: 'c1',
      principalType,
      principalId,
      configVersion: 1,
      ...draft,
    }));
  });

  const unsafeBody = {
    entries: [{ fieldPath: 'endpoints.bedrock.inferenceProfiles', value: { $where: 'sleep(1)' } }],
  };

  it('answers 401 before the key guard for an unauthenticated `$` key', async () => {
    const response = await request(app)
      .patch('/api/admin/config/role/USER/fields')
      .send(unsafeBody)
      .expect(401);

    expect(response.body).toEqual({ message: 'Unauthorized' });
    expect(mockDb.writeConfigDocument).not.toHaveBeenCalled();
  });

  it('answers 403 before the key guard without admin access', async () => {
    hasAdminAccess = false;

    await request(app)
      .patch('/api/admin/config/role/USER/fields')
      .set('authorization', 'Bearer admin')
      .send(unsafeBody)
      .expect(403);

    expect(mockDb.writeConfigDocument).not.toHaveBeenCalled();
  });

  it.each([
    ['a `$` operator key', unsafeBody],
    ['a `__proto__` key', JSON.parse('{"overrides":{"registration":{"__proto__":{"x":1}}}}')],
  ])('answers 400 CONFIG_UNSAFE_KEY for %s after auth', async (_label, body) => {
    const response = await request(app)
      .put('/api/admin/config/role/USER')
      .set('authorization', 'Bearer admin')
      .send(body)
      .expect(400);

    expect(response.body.code).toBe('CONFIG_UNSAFE_KEY');
    expect(JSON.stringify(response.body)).not.toMatch(/\$where|__proto__/);
    expect(mockDb.writeConfigDocument).not.toHaveBeenCalled();
  });

  it('delivers dotted record keys to the write method intact', async () => {
    const response = await request(app)
      .patch('/api/admin/config/role/USER/fields')
      .set('authorization', 'Bearer admin')
      .send({
        entries: [{ fieldPath: 'endpoints.bedrock.inferenceProfiles', value: { [PROFILE]: ARN } }],
      })
      .expect(200);

    expect(mockDb.writeConfigDocument).toHaveBeenCalledWith(
      'role',
      'USER',
      expect.objectContaining({
        overrides: { endpoints: { bedrock: { inferenceProfiles: { [PROFILE]: ARN } } } },
      }),
      'absent',
    );
    expect(response.body.config.overrides.endpoints.bedrock.inferenceProfiles).toEqual({
      [PROFILE]: ARN,
    });
  });

  it('serves the config contract behind the same auth', async () => {
    await request(app).get('/api/admin/config/meta').expect(401);

    const response = await request(app)
      .get('/api/admin/config/meta')
      .set('authorization', 'Bearer admin')
      .expect(200);

    expect(response.body.metaVersion).toBe(1);
    expect(response.body.features.dottedKeys).toBe(true);
    expect(response.body.limits).toEqual({
      maxPatchEntries: 100,
      maxChangeOps: 1000,
      overrideCacheTtlMs: 15_000,
    });
  });
});
