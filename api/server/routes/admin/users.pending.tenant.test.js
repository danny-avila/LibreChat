process.env.TENANT_ISOLATION_STRICT = 'true';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles } = require('librechat-data-provider');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const TENANT_A = 'tenant-pending-a';
const ADMIN_A = 'admin-pending-a';

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
      name: 'Active User',
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

describe('GET /api/admin/users pending invites', () => {
  it('lists unaccepted invites as pending users for tenant admins', async () => {
    mockCurrentUser = { id: ADMIN_A, role: SystemRoles.ADMIN, tenantId: TENANT_A };

    const inviteRes = await request(app)
      .post('/api/admin/users/invite')
      .send({ email: 'pending@example.com' });
    expect(inviteRes.status).toBe(200);

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0]).toMatchObject({
      email: 'pending@example.com',
      status: 'pending',
      role: SystemRoles.USER,
      provider: 'invite',
    });
    expect(res.body.users[0].id).toMatch(/^invite:/);
  });

  it('omits pending invites once the email belongs to a registered user', async () => {
    await seedUser(TENANT_A, 'active@example.com');
    mockCurrentUser = { id: ADMIN_A, role: SystemRoles.ADMIN, tenantId: TENANT_A };

    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users.every((user) => user.status === 'active')).toBe(true);
    expect(res.body.users.some((user) => user.email === 'active@example.com')).toBe(true);
  });
});
