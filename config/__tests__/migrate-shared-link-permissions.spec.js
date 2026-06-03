jest.mock('../connect', () => jest.fn().mockResolvedValue(true));
jest.mock('@librechat/api', () => ({
  ensureRequiredCollectionsExist: jest.fn().mockResolvedValue(undefined),
  matchModelName: jest.fn(),
  findMatchingPattern: jest.fn(),
}));
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('~/cache/getLogStores', () => jest.fn());

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createMethods } = require('@librechat/data-schemas');

describe('migrate-shared-link-permissions', () => {
  let mongoServer;
  let SharedLink, AclEntry;
  let migrateSharedLinkPermissions;
  const testUserId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const migration = require('../migrate-shared-link-permissions');
    migrateSharedLinkPermissions = migration.migrateSharedLinkPermissions;

    SharedLink = mongoose.models.SharedLink;
    AclEntry = mongoose.models.AclEntry;

    await createMethods(mongoose).seedDefaultRoles();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await AclEntry.deleteMany({});
    await SharedLink.deleteMany({});
    jest.restoreAllMocks();
  });

  async function createLegacyLink(isPublic = true) {
    const link = await SharedLink.create({
      shareId: `share-${Date.now()}-${Math.random()}`,
      conversationId: 'convo1',
      user: testUserId,
      messages: [],
    });
    await mongoose.connection.db
      .collection('sharedlinks')
      .updateOne({ _id: link._id }, { $set: { isPublic } });
    return link;
  }

  test('removes isPublic from all links on success', async () => {
    const link1 = await createLegacyLink(true);
    const link2 = await createLegacyLink(true);

    const result = await migrateSharedLinkPermissions({ dryRun: false, batchSize: 100 });

    expect(result.errors).toBe(0);
    expect(result.failedLinkCount).toBe(0);

    const raw1 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link1._id });
    const raw2 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link2._id });
    expect(raw1).not.toHaveProperty('isPublic');
    expect(raw2).not.toHaveProperty('isPublic');
  });

  test('preserves isPublic on links with partial write errors', async () => {
    const link1 = await createLegacyLink(true);
    const link2 = await createLegacyLink(true);
    const link3 = await createLegacyLink(true);

    const originalBulkWrite = AclEntry.bulkWrite.bind(AclEntry);
    jest.spyOn(AclEntry, 'bulkWrite').mockImplementationOnce(async (ops, options) => {
      const failedIndices = [];
      const successOps = [];

      for (let i = 0; i < ops.length; i++) {
        if (ops[i].updateOne.filter.resourceId.equals(link2._id)) {
          failedIndices.push(i);
        } else {
          successOps.push(ops[i]);
        }
      }

      if (successOps.length > 0) {
        await originalBulkWrite(successOps, options);
      }

      const error = new Error('Partial bulk write failure');
      error.writeErrors = failedIndices.map((idx) => ({
        index: idx,
        errmsg: 'Simulated write error',
      }));
      throw error;
    });

    const result = await migrateSharedLinkPermissions({ dryRun: false, batchSize: 100 });

    expect(result.failedLinkCount).toBe(1);
    expect(result.errors).toBeGreaterThan(0);

    const raw1 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link1._id });
    const raw2 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link2._id });
    const raw3 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link3._id });

    expect(raw2).toHaveProperty('isPublic', true);
    expect(raw1).not.toHaveProperty('isPublic');
    expect(raw3).not.toHaveProperty('isPublic');
  });

  test('preserves isPublic on all batch links when bulk write fails entirely', async () => {
    const link1 = await createLegacyLink(true);
    const link2 = await createLegacyLink(true);

    jest.spyOn(AclEntry, 'bulkWrite').mockRejectedValueOnce(new Error('Connection lost'));

    const result = await migrateSharedLinkPermissions({ dryRun: false, batchSize: 100 });

    expect(result.failedLinkCount).toBe(2);

    const raw1 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link1._id });
    const raw2 = await mongoose.connection.db
      .collection('sharedlinks')
      .findOne({ _id: link2._id });

    expect(raw1).toHaveProperty('isPublic', true);
    expect(raw2).toHaveProperty('isPublic', true);
  });

  test('does not grant PUBLIC VIEWER to isPublic false links when forced', async () => {
    const link = await createLegacyLink(false);

    const result = await migrateSharedLinkPermissions({ dryRun: false, force: true });

    expect(result.aborted).toBeUndefined();
    expect(result.publicViewerSkipped).toBe(1);

    const publicEntry = await AclEntry.findOne({
      resourceId: link._id,
      principalType: 'public',
    }).lean();
    expect(publicEntry).toBeNull();

    const ownerEntry = await AclEntry.findOne({
      resourceId: link._id,
      principalType: 'user',
    }).lean();
    expect(ownerEntry).toBeDefined();
  });
});
