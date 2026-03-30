const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

describe('resolvePendingMemberships', () => {
  it('does nothing when no pending groups exist', async () => {
    const { resolvePendingMemberships } = require('../../models/Group');
    await expect(resolvePendingMemberships('nobody@trivium.cz', 'userId123')).resolves.toBeUndefined();
  });

  it('returns early when email is empty', async () => {
    const { resolvePendingMemberships } = require('../../models/Group');
    await expect(resolvePendingMemberships('', 'userId123')).resolves.toBeUndefined();
  });
});
