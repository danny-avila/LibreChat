import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IGroup, IUser } from '~/types';
import { tenantStorage, runAsSystem } from '~/config/tenantContext';
import { createModels } from '../models';
import { createUserGroupMethods } from './userGroup';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Group: mongoose.Model<IGroup>;
let User: mongoose.Model<IUser>;
let methods: ReturnType<typeof createUserGroupMethods>;
let modelsToCleanup: string[] = [];

beforeAll(async () => {
  process.env.TENANT_ISOLATION_STRICT = 'true';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  Group = mongoose.models.Group as mongoose.Model<IGroup>;
  User = mongoose.models.User as mongoose.Model<IUser>;
  methods = createUserGroupMethods(mongoose);
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await Group.deleteMany({});
    await User.deleteMany({});
  });
});

afterAll(async () => {
  delete process.env.TENANT_ISOLATION_STRICT;
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

describe('Group tenant and membership isolation', () => {
  it('listGroups returns only groups for the requested tenantId', async () => {
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await Group.create({ name: 'Tenant A', source: 'local', memberIds: [] });
    });
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
      await Group.create({ name: 'Tenant B', source: 'local', memberIds: [] });
    });

    const groups = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.listGroups({ tenantId: 'tenant-a' }),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('Tenant A');
  });

  it('findGroupsByMemberId returns only memberships in the caller tenant', async () => {
    let userId = '';
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      const user = await User.create({
        name: 'User A',
        email: 'user-a@test.com',
        provider: 'local',
      });
      userId = user._id.toString();
      await Group.create({
        name: 'Group A',
        source: 'local',
        memberIds: [userId],
      });
    });
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
      await Group.create({
        name: 'Group B',
        source: 'local',
        memberIds: [userId],
      });
    });

    const groups = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.findGroupsByMemberId(userId),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('Group A');
  });

  it('findGroupsByMemberId does not return groups the user is not a member of', async () => {
    let userAId = '';
    let userBId = '';
    await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      const userA = await User.create({
        name: 'User A',
        email: 'user-a@test.com',
        provider: 'local',
      });
      const userB = await User.create({
        name: 'User B',
        email: 'user-b@test.com',
        provider: 'local',
      });
      userAId = userA._id.toString();
      userBId = userB._id.toString();
      await Group.create({
        name: 'User B Group',
        source: 'local',
        memberIds: [userBId],
      });
      await Group.create({
        name: 'Shared Group',
        source: 'local',
        memberIds: [userAId, userBId],
      });
    });

    const groups = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.findGroupsByMemberId(userAId),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.name).toBe('Shared Group');
    expect(groups.some((g) => g.name === 'User B Group')).toBe(false);
  });

  it('findGroupById returns null for a group in another tenant', async () => {
    let otherGroupId = '';
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () => {
      const group = await Group.create({
        name: 'Other Tenant Group',
        source: 'local',
        memberIds: [],
      });
      otherGroupId = group._id.toString();
    });

    const group = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.findGroupById(otherGroupId),
    );

    expect(group).toBeNull();
  });
});
