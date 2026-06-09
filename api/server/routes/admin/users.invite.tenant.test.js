process.env.TENANT_ISOLATION_STRICT = 'true';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles } = require('librechat-data-provider');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const TENANT_A = 'tenant-invite-a';
const TENANT_B = 'tenant-invite-b';
const ADMIN_A = 'admin-invite-a';

let mockCurrentUser;

jest.mock('~/server/middleware/requireJwtAuth', () => {
  const { tenantStorage } = require('@librechat/data-schemas');
  return (req, res, next) => {
    if (!mockCurrentUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = mockCurrentUser;
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    return tenantStorage.run({ tenantId }, async () => next());
  };
});

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: () => (_req, _res, next) => next(),
  superAdminContextMiddleware: (_req, _res, next) => next(),
}));

jest.mock('~/server/utils', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  checkEmailConfig: () => false,
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return createMethods(mongoose, {});
});

let app;
let mongoServer;
let User;
let Token;

async function seedUser(tenantId, email, role = SystemRoles.USER) {
  let user;
  await tenantStorage.run({ tenantId }, async () => {
    user = await User.create({
      name: 'Existing User',
      email,
      provider: 'local',
      role,
    });
  });
  return user;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  User = mongoose.models.User;
  Token = mongoose.models.Token;

  app = express();
  app.use(express.json());
  app.use('/api/admin/users', require('./users'));
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await User.deleteMany({});
    if (Token) {
      await Token.deleteMany({});
    }
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.TENANT_ISOLATION_STRICT;
});

describe('POST /api/admin/users/invite existing user validation', () => {
  it('returns 409 when the email already belongs to a user in the caller tenant', async () => {
    await seedUser(TENANT_A, 'existing@example.com');

    mockCurrentUser = { id: ADMIN_A, role: SystemRoles.ADMIN, tenantId: TENANT_A };

    const res = await request(app)
      .post('/api/admin/users/invite')
      .send({ email: 'existing@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A user with that email already exists');
    const tokenCount = await runAsSystem(async () =>
      Token.countDocuments({ email: 'existing@example.com' }),
    );
    expect(tokenCount).toBe(0);
  });

  it('allows inviting an email that exists only in another tenant', async () => {
    await seedUser(TENANT_B, 'shared@example.com');

    mockCurrentUser = { id: ADMIN_A, role: SystemRoles.ADMIN, tenantId: TENANT_A };

    const res = await request(app)
      .post('/api/admin/users/invite')
      .send({ email: 'shared@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const tokenCount = await runAsSystem(async () =>
      Token.countDocuments({ email: 'shared@example.com' }),
    );
    expect(tokenCount).toBe(1);
  });
});
