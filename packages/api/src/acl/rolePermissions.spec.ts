import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  ResourceType,
  AccessRoleIds,
  PermissionBits,
  PrincipalModel,
  PrincipalType,
} from 'librechat-data-provider';
import {
  RoleBits,
  createModels,
  createMethods,
  tenantStorage,
  permissionBitSupersets,
} from '@librechat/data-schemas';
import type { IAclEntry } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import { AccessControlService } from './accessControlService';

let mongo: MongoMemoryServer;
let entries: Model<IAclEntry>;
let methods: ReturnType<typeof createMethods>;
let service: AccessControlService;
const resourceId = new Types.ObjectId();
const userId = new Types.ObjectId();
const grantedBy = new Types.ObjectId();
const filter = {
  principalType: PrincipalType.USER,
  principalId: userId,
  resourceType: ResourceType.AGENT,
  resourceId,
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({ instance: { args: ['--nounixsocket'] } });
  await mongoose.connect(mongo.getUri());
  createModels(mongoose);
  entries = mongoose.models.AclEntry as Model<IAclEntry>;
  methods = createMethods(mongoose);
  await methods.seedDefaultRoles();
});

beforeEach(async () => {
  await entries.deleteMany({});
  service = new AccessControlService(mongoose, methods);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

async function seed(permBits: number, tenantId?: string): Promise<void> {
  const role = await methods.findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
  await entries.create({
    ...filter,
    principalModel: PrincipalModel.USER,
    permBits,
    roleId: role!._id,
    grantedBy,
    ...(tenantId && { tenantId }),
  });
}

function updateRole(accessRoleId = AccessRoleIds.AGENT_EDITOR) {
  return service.bulkUpdateResourcePermissions({
    resourceType: ResourceType.AGENT,
    resourceId,
    updatedPrincipals: [{ type: PrincipalType.USER, id: userId.toString(), accessRoleId }],
    grantedBy,
  });
}

describe('role-only ACL writes', () => {
  test.each([
    [AccessRoleIds.AGENT_VIEWER, RoleBits.VIEWER],
    [AccessRoleIds.AGENT_EDITOR, RoleBits.EDITOR],
    [AccessRoleIds.AGENT_OWNER, RoleBits.OWNER],
  ])('replaces role bits for every valid mask with %s', async (roleId, roleBits) => {
    const masks = permissionBitSupersets(0);
    for (const mask of masks) {
      await seed(mask);
    }
    const before = await entries.find(filter).sort({ _id: 1 }).lean();
    const result = await updateRole(roleId);
    const after = await entries.find(filter).sort({ _id: 1 }).lean();
    expect(after).toHaveLength(before.length);
    expect(after.map((entry) => entry.permBits)).toEqual(
      before.map((entry) => (entry.permBits & ~RoleBits.OWNER) | roleBits),
    );
    const role = await methods.findRoleByIdentifier(roleId);
    expect(after.every((entry) => entry.roleId?.toString() === role!._id.toString())).toBe(true);
    expect(result.insightsChanges).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each([
    { type: PrincipalType.USER, id: userId.toString(), model: PrincipalModel.USER },
    { type: PrincipalType.GROUP, id: new Types.ObjectId().toString(), model: PrincipalModel.GROUP },
    { type: PrincipalType.ROLE, id: 'USER', model: PrincipalModel.ROLE },
  ])(
    'initializes and updates a $type principal without granting Insights',
    async ({ type, id, model }) => {
      for (const accessRoleId of [AccessRoleIds.AGENT_OWNER, AccessRoleIds.AGENT_VIEWER]) {
        const result = await service.bulkUpdateResourcePermissions({
          resourceType: ResourceType.AGENT,
          resourceId,
          updatedPrincipals: [{ type, id, accessRoleId }],
          grantedBy,
        });
        expect(result.errors).toEqual([]);
        expect(result.insightsChanges).toEqual([]);
      }
      const after = await entries.find({ resourceId, principalType: type }).lean();
      expect(after).toHaveLength(1);
      expect(after[0].principalId?.toString()).toBe(id);
      expect(after[0].principalModel).toBe(model);
      expect(after[0].permBits).toBe(RoleBits.VIEWER);
    },
  );

  test('emits single-operator bit writes and an identity-only insert', async () => {
    const spy = jest.spyOn(methods, 'bulkWriteAclEntries');
    await updateRole();
    await updateRole();
    expect(await entries.countDocuments(filter)).toBe(1);
    expect((await entries.findOne(filter))!.permBits).toBe(RoleBits.EDITOR);
    for (const [ops] of spy.mock.calls) {
      expect(ops).toHaveLength(3);
      for (const op of ops) {
        if ('updateMany' in op) {
          const update = op.updateMany.update as { $bit?: Record<string, object> };
          expect(op.updateMany.filter).toEqual(expect.objectContaining(filter));
          expect(op.updateMany.filter).not.toHaveProperty('permBits');
          expect(op.updateMany.upsert).not.toBe(true);
          expect(Array.isArray(update)).toBe(false);
          for (const bag of Object.values(update.$bit ?? {})) {
            expect(Object.keys(bag)).toHaveLength(1);
          }
        } else {
          expect(op).toMatchObject({
            updateOne: {
              filter,
              update: { $setOnInsert: { permBits: RoleBits.EDITOR } },
              upsert: true,
            },
          });
          if ('updateOne' in op) expect(op.updateOne.filter).not.toHaveProperty('permBits');
        }
      }
    }
  });

  test.each([
    { label: 'grant', initial: 1, concurrent: 17, expected: 19 },
    { label: 'revocation', initial: 17, concurrent: 1, expected: 3 },
    { label: 'deletion', initial: 17, concurrent: null, expected: 3 },
  ])(
    'preserves a concurrent Insights $label after the snapshot',
    async ({ initial, concurrent, expected }) => {
      await seed(initial);
      const write = methods.bulkWriteAclEntries;
      jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (...args) => {
        if (concurrent === null) await entries.deleteMany(filter);
        else await entries.updateMany(filter, { $set: { permBits: concurrent } });
        return write(...args);
      });
      const result = await updateRole();
      expect((await entries.findOne(filter))!.permBits).toBe(expected);
      expect(result.insightsChanges).toEqual([]);
      expect(result.errors).toEqual([]);
    },
  );

  test.each([
    { initial: 1, concurrent: 17, expected: 19 },
    { initial: 17, concurrent: 1, expected: 3 },
  ])(
    'does not overwrite an Insights change between mask partitions: $concurrent',
    async ({ initial, concurrent, expected }) => {
      await seed(initial);
      const write = methods.bulkWriteAclEntries;
      jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (ops, options) => {
        let result = await write([ops[0]], options);
        await entries.updateMany(filter, { $set: { permBits: concurrent } });
        for (const op of ops.slice(1)) result = await write([op], options);
        return result;
      });
      const result = await updateRole();
      expect((await entries.findOne(filter))!.permBits).toBe(expected);
      expect(result.insightsChanges).toEqual([]);
    },
  );

  test('does not overwrite a new Insights grant between partitions and the identity upsert', async () => {
    const write = methods.bulkWriteAclEntries;
    jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (ops, options) => {
      await write(ops.slice(0, -1), options);
      await seed(PermissionBits.VIEW | PermissionBits.VIEW_INSIGHTS);
      return write(ops.slice(-1), options);
    });
    await updateRole();
    expect(await entries.countDocuments(filter)).toBe(1);
    expect((await entries.findOne(filter))!.permBits).toBe(17);
  });

  test('keeps explicit Insights upsert indices correct after expanded role-only writes', async () => {
    await seed(17);
    const write = methods.bulkWriteAclEntries;
    jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (...args) => {
      await entries.deleteMany(filter);
      return write(...args);
    });
    const result = await service.bulkUpdateResourcePermissions({
      resourceType: ResourceType.AGENT,
      resourceId,
      updatedPrincipals: [
        {
          type: PrincipalType.USER,
          id: new Types.ObjectId().toString(),
          accessRoleId: AccessRoleIds.AGENT_EDITOR,
        },
        {
          type: PrincipalType.USER,
          id: userId.toString(),
          accessRoleId: AccessRoleIds.AGENT_EDITOR,
          viewInsights: false,
        },
      ],
      grantedBy,
    });
    expect(result.insightsChanges).toEqual([
      expect.objectContaining({ action: 'removed', previousEntry: null }),
    ]);
    await service.restoreInsightsPermissionChanges({
      resourceType: ResourceType.AGENT,
      resourceId,
      changes: result.insightsChanges,
    });
    expect(await entries.findOne(filter)).toBeNull();
    expect(await entries.countDocuments({ resourceId })).toBe(1);
  });

  test('initializes missing legacy permission fields without inheriting Insights', async () => {
    await seed(1);
    await entries.collection.updateMany(filter, { $unset: { permBits: '' } });
    await updateRole();
    const after = await entries.find(filter).lean();
    expect(after).toHaveLength(1);
    expect(after[0].permBits).toBe(RoleBits.EDITOR);
  });

  test('applies the role even when a preserved bit changes mid-write (#16170 review)', async () => {
    await seed(RoleBits.OWNER | PermissionBits.VIEW_INSIGHTS);
    const write = methods.bulkWriteAclEntries;
    jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (ops, options) => {
      let result = await write([ops[0]], options);
      /** An admin revokes Insights between the two bit writes. */
      await entries.updateMany(filter, {
        $bit: { permBits: { and: ~PermissionBits.VIEW_INSIGHTS } },
      });
      for (const op of ops.slice(1)) result = await write([op], options);
      return result;
    });
    const result = await service.bulkUpdateResourcePermissions({
      resourceType: ResourceType.AGENT,
      resourceId,
      updatedPrincipals: [
        {
          type: PrincipalType.USER,
          id: userId.toString(),
          accessRoleId: AccessRoleIds.AGENT_VIEWER,
        },
      ],
      grantedBy,
    });
    expect(result.errors).toEqual([]);
    const entry = await entries.findOne(filter).lean();
    /** The downgrade lands: no retained owner bits, no resurrected Insights. */
    expect(entry!.permBits).toBe(RoleBits.VIEWER);
    const role = await methods.findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
    expect(entry!.roleId?.toString()).toBe(role!._id.toString());
  });

  test('propagates a partial batch failure without leaving half-updated role bits', async () => {
    await seed(RoleBits.OWNER);
    await seed(RoleBits.OWNER | PermissionBits.VIEW_INSIGHTS);
    const write = methods.bulkWriteAclEntries;
    jest.spyOn(methods, 'bulkWriteAclEntries').mockImplementationOnce(async (ops, options) => {
      await write([ops[0]], options);
      throw new Error('injected write failure');
    });
    await expect(updateRole()).rejects.toThrow('injected write failure');
    const after = await entries.find(filter).lean();
    expect(after.map((entry) => entry.permBits).sort((a, b) => a - b)).toEqual([0, 16]);
    await updateRole();
    const retried = await entries.find(filter).lean();
    expect(retried.map((entry) => entry.permBits).sort((a, b) => a - b)).toEqual([3, 19]);
  });

  test('scopes every partition and the identity upsert to the active tenant', async () => {
    await seed(17, 'tenant-a');
    await seed(1, 'tenant-b');
    const result = await tenantStorage.run({ tenantId: 'tenant-a' }, async () => {
      await methods.seedDefaultRoles();
      return updateRole();
    });
    expect(result.errors).toEqual([]);
    const after = await entries.find(filter).sort({ tenantId: 1 }).lean();
    expect(after.map((entry) => [entry.tenantId, entry.permBits])).toEqual([
      ['tenant-a', 19],
      ['tenant-b', 1],
    ]);
  });

  test('keeps all guarded writes inside a caller-owned transaction', async () => {
    const replica = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ args: ['--nounixsocket'] }],
    });
    const connection = new mongoose.Mongoose();
    try {
      await connection.connect(replica.getUri());
      createModels(connection);
      const transactionMethods = createMethods(connection);
      await transactionMethods.seedDefaultRoles();
      const transactionService = new AccessControlService(connection, transactionMethods);
      const acl = connection.models.AclEntry as Model<IAclEntry>;
      const role = await transactionMethods.findRoleByIdentifier(AccessRoleIds.AGENT_VIEWER);
      await acl.create({
        ...filter,
        principalModel: PrincipalModel.USER,
        permBits: 17,
        roleId: role!._id,
        grantedBy,
      });
      /**
       * `createModels` schedules autoIndex builds and the insert above creates
       * the collection; both are catalog changes. A transaction that starts
       * while one is still in flight aborts with a transient "Unable to write
       * to collection ... due to catalog changes" error, so let the models this
       * transaction touches finish building before opening the session.
       */
      await Promise.all([acl.init(), connection.models.AccessRole.init()]);
      const session = await connection.startSession();
      try {
        session.startTransaction();
        const result = await transactionService.bulkUpdateResourcePermissions({
          resourceType: ResourceType.AGENT,
          resourceId,
          updatedPrincipals: [
            {
              type: PrincipalType.USER,
              id: userId.toString(),
              accessRoleId: AccessRoleIds.AGENT_EDITOR,
            },
          ],
          grantedBy,
          session,
        });
        expect(result.errors).toEqual([]);
        expect((await acl.findOne(filter).session(session))!.permBits).toBe(19);
        await session.abortTransaction();
        expect((await acl.findOne(filter))!.permBits).toBe(17);
      } finally {
        await session.endSession();
      }
    } finally {
      await connection.disconnect();
      await replica.stop();
    }
  }, 30000);
});
