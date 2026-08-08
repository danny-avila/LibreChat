import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { assertMCPAuthorityReadiness, MCPAuthorityReadinessError } from './mcpAuthorityReadiness';
import { createMCPAuthorityProofCollections } from './mcpAuthorityCollections';
import { MCP_AUTHORITY_PROOF_COLLECTIONS } from '../methods/mcpAuthority';
import { createMCPAuthorityLookupIndexes } from './mcpAuthorityIndexes';
import { backfillMCPServerNormalizedNames } from './mcpServerNames';

let mongoServer: InstanceType<typeof MongoMemoryServer>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function migratePrerequisites(): Promise<void> {
  await createMCPAuthorityProofCollections(mongoose.connection);
  await backfillMCPServerNormalizedNames(mongoose.connection);
  await createMCPAuthorityLookupIndexes(mongoose.connection);
}

describe('assertMCPAuthorityReadiness', () => {
  test('requires an explicit Strong-consistency confirmation for Azure Cosmos MongoDB', async () => {
    await migratePrerequisites();

    await expect(
      assertMCPAuthorityReadiness(mongoose.connection, {
        mongoHost: 'authority.mongo.cosmos.azure.com',
        cosmosStrongConsistencyConfirmed: false,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: MCPAuthorityReadinessError.name,
        message: expect.stringContaining('Strong consistency'),
      }),
    );
    await expect(
      assertMCPAuthorityReadiness(mongoose.connection, {
        mongoHost: 'authority.mongo.cosmos.azure.com',
        cosmosStrongConsistencyConfirmed: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ scannedServers: 0 }));
  });

  test('accepts a clean post-migration database and remains idempotent', async () => {
    await mongoose.connection.db!.collection('mcpservers').insertMany([
      { serverName: 'selected server', tenantId: 'tenant-a' },
      { serverName: 'selected/server', tenantId: 'tenant-b' },
    ]);

    await migratePrerequisites();
    await migratePrerequisites();

    await expect(assertMCPAuthorityReadiness(mongoose.connection)).resolves.toEqual({
      scannedServers: 2,
      collections: MCP_AUTHORITY_PROOF_COLLECTIONS,
      indexes: expect.arrayContaining([
        'normalizedServerName_1_tenantId_1',
        'memberIds_1_tenantId_1',
        'mcpServerNames_1_tenantId_1',
        'userId_1_pluginKey_1_authField_1_tenantId_1',
        'userId_1_type_1_identifier_1_tenantId_1',
      ]),
    });
  });

  test('rejects a missing normalized server name', async () => {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await mongoose.connection.db!.collection('mcpservers').insertOne({
      serverName: 'selected server',
      tenantId: 'tenant-a',
    });

    await expect(assertMCPAuthorityReadiness(mongoose.connection)).rejects.toEqual(
      expect.objectContaining({
        name: MCPAuthorityReadinessError.name,
        message: expect.stringContaining('missing or stale'),
      }),
    );
  });

  test('rejects normalized-name collisions during the provider-neutral readiness scan', async () => {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await mongoose.connection.db!.collection('mcpservers').insertMany([
      {
        serverName: 'selected server',
        normalizedServerName: 'selected_server',
        tenantId: 'tenant-a',
      },
      {
        serverName: 'selected/server',
        normalizedServerName: 'selected_server',
        tenantId: 'tenant-a',
      },
    ]);

    await mongoose.connection.db!.collection('mcpservers').createIndex({
      normalizedServerName: 1,
      tenantId: 1,
    });

    await expect(assertMCPAuthorityReadiness(mongoose.connection)).rejects.toEqual(
      expect.objectContaining({
        name: MCPAuthorityReadinessError.name,
        message: expect.stringContaining('normalized identity collision'),
      }),
    );
  });

  test('rejects a missing authority lookup index', async () => {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await backfillMCPServerNormalizedNames(mongoose.connection);

    await expect(assertMCPAuthorityReadiness(mongoose.connection)).rejects.toEqual(
      expect.objectContaining({
        name: MCPAuthorityReadinessError.name,
        message: expect.stringContaining('lookup index is missing'),
      }),
    );
  });

  test.each(['configs', 'aclentries'] as const)(
    'rejects when the %s proof collection is missing',
    async (collectionName) => {
      await migratePrerequisites();
      await mongoose.connection.db!.dropCollection(collectionName);

      await expect(assertMCPAuthorityReadiness(mongoose.connection)).rejects.toEqual(
        expect.objectContaining({
          name: MCPAuthorityReadinessError.name,
          message: expect.stringContaining(`"${collectionName}"`),
        }),
      );
    },
  );

  test('pins the portable server scan to primary with majority read concern', async () => {
    await migratePrerequisites();
    const findSpy = jest.spyOn(mongoose.mongo.Collection.prototype, 'find');
    const aggregateSpy = jest.spyOn(mongoose.mongo.Collection.prototype, 'aggregate');

    try {
      await assertMCPAuthorityReadiness(mongoose.connection);

      expect(findSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          batchSize: 500,
          readPreference: 'primary',
          readConcern: { level: 'majority' },
        }),
      );
      expect(aggregateSpy).not.toHaveBeenCalled();
    } finally {
      findSpy.mockRestore();
      aggregateSpy.mockRestore();
    }
  });
});
