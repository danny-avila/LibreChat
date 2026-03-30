import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { dropSupersededTenantIndexes, SUPERSEDED_INDEXES } from './tenantIndexes';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('dropSupersededTenantIndexes', () => {
  describe('with pre-existing single-field unique indexes (simulates upgrade)', () => {
    beforeAll(async () => {
      const db = mongoose.connection.db!;

      await db.createCollection('users');
      const users = db.collection('users');
      await users.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
      await users.createIndex({ googleId: 1 }, { unique: true, sparse: true, name: 'googleId_1' });
      await users.createIndex(
        { facebookId: 1 },
        { unique: true, sparse: true, name: 'facebookId_1' },
      );
      await users.createIndex({ openidId: 1 }, { unique: true, sparse: true, name: 'openidId_1' });
      await users.createIndex({ samlId: 1 }, { unique: true, sparse: true, name: 'samlId_1' });
      await users.createIndex({ ldapId: 1 }, { unique: true, sparse: true, name: 'ldapId_1' });
      await users.createIndex({ githubId: 1 }, { unique: true, sparse: true, name: 'githubId_1' });
      await users.createIndex(
        { discordId: 1 },
        { unique: true, sparse: true, name: 'discordId_1' },
      );
      await users.createIndex({ appleId: 1 }, { unique: true, sparse: true, name: 'appleId_1' });

      await db.createCollection('roles');
      await db.collection('roles').createIndex({ name: 1 }, { unique: true, name: 'name_1' });

      await db.createCollection('agents');
      await db.collection('agents').createIndex({ id: 1 }, { unique: true, name: 'id_1' });

      await db.createCollection('conversations');
      await db
        .collection('conversations')
        .createIndex({ conversationId: 1 }, { unique: true, name: 'conversationId_1' });
      await db
        .collection('conversations')
        .createIndex(
          { conversationId: 1, user: 1 },
          { unique: true, name: 'conversationId_1_user_1' },
        );

      await db.createCollection('messages');
      await db
        .collection('messages')
        .createIndex({ messageId: 1 }, { unique: true, name: 'messageId_1' });
      await db
        .collection('messages')
        .createIndex({ messageId: 1, user: 1 }, { unique: true, name: 'messageId_1_user_1' });

      await db.createCollection('presets');
      await db
        .collection('presets')
        .createIndex({ presetId: 1 }, { unique: true, name: 'presetId_1' });

      await db.createCollection('agentcategories');
      await db
        .collection('agentcategories')
        .createIndex({ value: 1 }, { unique: true, name: 'value_1' });

      await db.createCollection('accessroles');
      await db
        .collection('accessroles')
        .createIndex({ accessRoleId: 1 }, { unique: true, name: 'accessRoleId_1' });

      await db.createCollection('conversationtags');
      await db
        .collection('conversationtags')
        .createIndex({ tag: 1, user: 1 }, { unique: true, name: 'tag_1_user_1' });

      await db.createCollection('mcpservers');
      await db
        .collection('mcpservers')
        .createIndex({ serverName: 1 }, { unique: true, name: 'serverName_1' });

      await db.createCollection('files');
      await db
        .collection('files')
        .createIndex(
          { filename: 1, conversationId: 1, context: 1 },
          { unique: true, name: 'filename_1_conversationId_1_context_1' },
        );

      await db.createCollection('groups');
      await db
        .collection('groups')
        .createIndex(
          { idOnTheSource: 1, source: 1 },
          { unique: true, name: 'idOnTheSource_1_source_1' },
        );
    });

    it('drops all superseded indexes', async () => {
      const result = await dropSupersededTenantIndexes(mongoose.connection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped.length).toBeGreaterThan(0);

      const totalExpected = Object.values(SUPERSEDED_INDEXES).reduce(
        (sum, arr) => sum + arr.length,
        0,
      );
      expect(result.dropped).toHaveLength(totalExpected);
    });

    it('reports no superseded indexes on second run (idempotent)', async () => {
      const result = await dropSupersededTenantIndexes(mongoose.connection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.skipped.length).toBeGreaterThan(0);
    });

    it('old unique indexes are actually gone from users collection', async () => {
      const indexes = await mongoose.connection.db!.collection('users').indexes();
      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).not.toContain('email_1');
      expect(indexNames).not.toContain('googleId_1');
      expect(indexNames).not.toContain('openidId_1');
      expect(indexNames).toContain('_id_');
    });

    it('old unique indexes are actually gone from roles collection', async () => {
      const indexes = await mongoose.connection.db!.collection('roles').indexes();
      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).not.toContain('name_1');
    });

    it('old compound unique indexes are gone from conversations collection', async () => {
      const indexes = await mongoose.connection.db!.collection('conversations').indexes();
      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).not.toContain('conversationId_1_user_1');
    });
  });

  describe('multi-tenant writes after migration', () => {
    beforeAll(async () => {
      const db = mongoose.connection.db!;

      const users = db.collection('users');
      await users.createIndex(
        { email: 1, tenantId: 1 },
        { unique: true, name: 'email_1_tenantId_1' },
      );
    });

    it('allows same email in different tenants after old index is dropped', async () => {
      const users = mongoose.connection.db!.collection('users');

      await users.insertOne({
        email: 'shared@example.com',
        tenantId: 'tenant-a',
        name: 'User A',
      });
      await users.insertOne({
        email: 'shared@example.com',
        tenantId: 'tenant-b',
        name: 'User B',
      });

      const countA = await users.countDocuments({
        email: 'shared@example.com',
        tenantId: 'tenant-a',
      });
      const countB = await users.countDocuments({
        email: 'shared@example.com',
        tenantId: 'tenant-b',
      });

      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    it('still rejects duplicate email within same tenant', async () => {
      const users = mongoose.connection.db!.collection('users');

      await users.insertOne({
        email: 'unique-within@example.com',
        tenantId: 'tenant-dup',
        name: 'First',
      });

      await expect(
        users.insertOne({
          email: 'unique-within@example.com',
          tenantId: 'tenant-dup',
          name: 'Second',
        }),
      ).rejects.toThrow(/E11000|duplicate key/);
    });
  });

  describe('on a fresh database (no pre-existing collections)', () => {
    let freshServer: InstanceType<typeof MongoMemoryServer>;
    let freshConnection: mongoose.Connection;

    beforeAll(async () => {
      freshServer = await MongoMemoryServer.create();
      freshConnection = mongoose.createConnection(freshServer.getUri());
      await freshConnection.asPromise();
    });

    afterAll(async () => {
      await freshConnection.close();
      await freshServer.stop();
    });

    it('skips all indexes gracefully (no errors)', async () => {
      const result = await dropSupersededTenantIndexes(freshConnection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toHaveLength(0);
      expect(result.skipped.length).toBeGreaterThan(0);
    });
  });

  describe('partial migration (some indexes exist, some do not)', () => {
    let partialServer: InstanceType<typeof MongoMemoryServer>;
    let partialConnection: mongoose.Connection;

    beforeAll(async () => {
      partialServer = await MongoMemoryServer.create();
      partialConnection = mongoose.createConnection(partialServer.getUri());
      await partialConnection.asPromise();

      const db = partialConnection.db!;
      await db.createCollection('users');
      await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_1' });
    });

    afterAll(async () => {
      await partialConnection.close();
      await partialServer.stop();
    });

    it('drops existing indexes and skips missing ones', async () => {
      const result = await dropSupersededTenantIndexes(partialConnection);

      expect(result.errors).toHaveLength(0);
      expect(result.dropped).toContain('users.email_1');
      expect(result.skipped.length).toBeGreaterThan(0);

      const skippedCollections = result.skipped.filter((s) => s.includes('does not exist'));
      expect(skippedCollections.length).toBeGreaterThan(0);
    });
  });

  describe('SUPERSEDED_INDEXES coverage', () => {
    it('covers all collections with unique index changes', () => {
      const expectedCollections = [
        'users',
        'roles',
        'conversations',
        'messages',
        'agentcategories',
        'accessroles',
        'conversationtags',
        'mcpservers',
        'files',
        'groups',
      ];

      for (const col of expectedCollections) {
        expect(SUPERSEDED_INDEXES).toHaveProperty(col);
        expect(SUPERSEDED_INDEXES[col].length).toBeGreaterThan(0);
      }
    });

    it('users collection lists all 9 OAuth ID indexes plus email', () => {
      expect(SUPERSEDED_INDEXES.users).toHaveLength(9);
      expect(SUPERSEDED_INDEXES.users).toContain('email_1');
      expect(SUPERSEDED_INDEXES.users).toContain('googleId_1');
      expect(SUPERSEDED_INDEXES.users).toContain('openidId_1');
    });
  });
});
