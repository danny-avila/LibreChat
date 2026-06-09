process.env.TENANT_ISOLATION_STRICT = 'true';

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { tenantStorage, createModels, runAsSystem } = require('@librechat/data-schemas');

const TENANT_A = 'tenant-groups-a';
const TENANT_B = 'tenant-groups-b';
const USER_A = 'admin-tenant-a';
const USER_B = 'admin-tenant-b';

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
    return tenantStorage.run({ tenantId }, () => next());
  };
});

jest.mock('~/server/middleware/roles/capabilities', () => ({
  requireCapability: () => (_req, _res, next) => next(),
  superAdminContextMiddleware: (_req, _res, next) => next(),
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return createMethods(mongoose, {});
});

let app;
let mongoServer;
let Group;

async function seedGroup(tenantId, name, memberIds = []) {
  let group;
  await tenantStorage.run({ tenantId }, async () => {
    group = await Group.create({
      name,
      source: 'local',
      memberIds,
    });
  });
  return group;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  Object.assign(mongoose.models, models);
  Group = mongoose.models.Group;

  app = express();
  app.use(express.json());
  app.use('/api/admin/groups', require('./groups'));
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await Group.deleteMany({});
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  delete process.env.TENANT_ISOLATION_STRICT;
});

describe('GET /api/admin/groups tenant isolation', () => {
  it('returns only groups belonging to the caller tenant', async () => {
    const groupA = await seedGroup(TENANT_A, 'Tenant A Group');
    await seedGroup(TENANT_B, 'Tenant B Group');

    mockCurrentUser = { id: USER_A, role: 'ADMIN', tenantId: TENANT_A };

    const res = await request(app).get('/api/admin/groups');

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].name).toBe('Tenant A Group');
    expect(res.body.groups.some((g) => g._id === groupA._id.toString())).toBe(true);
  });

  it('returns 404 when requesting a group from another tenant', async () => {
    const groupB = await seedGroup(TENANT_B, 'Tenant B Only');

    mockCurrentUser = { id: USER_A, role: 'ADMIN', tenantId: TENANT_A };

    const res = await request(app).get(`/api/admin/groups/${groupB._id}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/groups membership visibility', () => {
  it('tenant admin sees all groups in their tenant, not only groups they belong to', async () => {
    await seedGroup(TENANT_A, 'Member Group', [USER_A]);
    const otherGroup = await seedGroup(TENANT_A, 'Other Group', [USER_B]);

    mockCurrentUser = { id: USER_A, role: 'ADMIN', tenantId: TENANT_A };

    const res = await request(app).get('/api/admin/groups');

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(2);
    expect(res.body.groups.some((g) => g._id === otherGroup._id.toString())).toBe(true);
  });
});
