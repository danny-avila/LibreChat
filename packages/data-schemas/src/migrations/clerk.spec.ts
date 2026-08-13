import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { ensureClerkIndexes, ClerkIndexAssuranceError, CLERK_INDEX_SPECS } from './clerk';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

describe('ensureClerkIndexes — replica set (transactions supported)', () => {
  let mongoServer: MongoMemoryReplSet;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    /** Drop (not just deleteMany) so indexes from a prior test never leak into the next. */
    const collections = await connection.db!.listCollections().toArray();
    await Promise.all(
      collections.map((c) =>
        connection
          .db!.collection(c.name)
          .drop()
          .catch(() => undefined),
      ),
    );
  });

  test('creates every named index on a fresh database with the exact declared definition', async () => {
    await ensureClerkIndexes(connection);

    for (const spec of CLERK_INDEX_SPECS) {
      const indexes = await connection.db!.collection(spec.collection).indexes();
      const created = indexes.find((idx) => idx.name === spec.options.name);
      expect(created).toBeDefined();
      expect(created!.key).toEqual(spec.key);
      expect(Boolean(created!.unique)).toBe(Boolean(spec.options.unique));
      if (spec.options.partialFilterExpression) {
        expect(created!.partialFilterExpression).toEqual(spec.options.partialFilterExpression);
      }
      if (spec.options.expireAfterSeconds != null) {
        expect(created!.expireAfterSeconds).toBe(spec.options.expireAfterSeconds);
      }
    }
  });

  test('is idempotent on rerun — no duplicate or errored second pass', async () => {
    await ensureClerkIndexes(connection);
    await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();

    const indexes = await connection.db!.collection('users').indexes();
    expect(indexes.filter((idx) => idx.name === 'clerkId_1_tenantId_1')).toHaveLength(1);
  });

  test('fails preflight when an existing document has a blank clerkId', async () => {
    await connection.db!.collection('users').insertOne({ email: 'a@test.com', clerkId: '   ' });

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/null\/empty\/whitespace/);
  });

  test('fails preflight when existing documents have a duplicate clerkId within the same tenant scope', async () => {
    await connection.db!.collection('users').insertMany([
      { email: 'a@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
      { email: 'b@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
    ]);

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/duplicate values/);
  });

  test('does not fail preflight for the same clerkId across different tenant scopes', async () => {
    await connection.db!.collection('users').insertMany([
      { email: 'a@test.com', clerkId: 'dup', tenantId: 'tenant-a' },
      { email: 'b@test.com', clerkId: 'dup', tenantId: 'tenant-b' },
    ]);

    await expect(ensureClerkIndexes(connection)).resolves.toBeUndefined();
  });

  test('fails on an existing same-name index with an incompatible definition', async () => {
    await connection
      .db!.collection('users')
      .createIndex({ email: 1 }, { name: 'clerkId_1_tenantId_1' });

    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/incompatible/);
  });

  test('rejects when the connection has no database handle', async () => {
    const bareConnection = { db: undefined } as unknown as mongoose.Connection;
    await expect(ensureClerkIndexes(bareConnection)).rejects.toBeInstanceOf(
      ClerkIndexAssuranceError,
    );
  });
});

describe('ensureClerkIndexes — standalone (no transaction support)', () => {
  let mongoServer: MongoMemoryServer;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongoServer.getUri()).asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongoServer.stop();
  });

  test('fails closed when multi-document transactions are unavailable', async () => {
    await expect(ensureClerkIndexes(connection)).rejects.toThrow(/transaction/);
  });
});

describe('production code never calls syncIndexes()', () => {
  test('migrations/clerk.ts source has no syncIndexes call', () => {
    const source = fs.readFileSync(path.join(__dirname, 'clerk.ts'), 'utf8');
    expect(source).not.toMatch(/\.syncIndexes\(/);
  });
});
