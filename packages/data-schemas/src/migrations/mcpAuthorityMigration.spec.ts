import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { MCPAuthorityTargetInput } from '~/types';
import {
  MCP_AUTHORITY_PROOF_COLLECTIONS,
  createMCPAuthorityMethods,
  createMCPAuthorityBootRevision,
  createMCPAuthorityConfigSourceRevision,
  createMCPAuthorityCredentialRevision,
  createMCPAuthorityUserSourceRevision,
} from '../methods/mcpAuthority';
import { createMCPAuthorityProofCollections } from './mcpAuthorityCollections';
import { createMCPAuthorityLookupIndexes } from './mcpAuthorityIndexes';
import { assertMCPAuthorityReadiness } from './mcpAuthorityReadiness';
import { backfillMCPServerNormalizedNames } from './mcpServerNames';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

jest.setTimeout(60_000);

const TENANT_ID = 'migration-tenant';
const ROLE_NAME = 'MCP_MIGRATION_USER';
const SERVER_NAME = 'migration-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  mongoose.set('autoCreate', false);
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongoServer.getUri(), { autoCreate: false, autoIndex: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

test('migrates a fresh database before resolving and asserting a real proof', async () => {
  await mongoose.connection.dropDatabase();
  const models = createModels(mongoose);
  const methods = createMCPAuthorityMethods(mongoose);
  const before = await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray();
  expect(before.map(({ name }) => name)).not.toEqual(
    expect.arrayContaining(['configs', 'aclentries']),
  );

  await createMCPAuthorityProofCollections(mongoose.connection);
  await backfillMCPServerNormalizedNames(mongoose.connection);
  await createMCPAuthorityLookupIndexes(mongoose.connection);

  await expect(assertMCPAuthorityReadiness(mongoose.connection)).resolves.toEqual({
    scannedServers: 0,
    collections: MCP_AUTHORITY_PROOF_COLLECTIONS,
    indexes: expect.arrayContaining([
      'normalizedServerName_1_tenantId_1',
      'memberIds_1_tenantId_1',
      'mcpServerNames_1_tenantId_1',
      'userId_1_pluginKey_1_authField_1_tenantId_1',
      'userId_1_type_1_identifier_1_tenantId_1',
    ]),
  });

  const userId = new mongoose.Types.ObjectId();
  await tenantStorage.run({ tenantId: TENANT_ID, userId: userId.toHexString() }, async () => {
    const user = await models.User.create({
      _id: userId,
      email: 'migration-authority@example.com',
      emailVerified: true,
      provider: 'local',
      role: ROLE_NAME,
    });
    await models.Role.create({
      name: ROLE_NAME,
      permissions: {
        [PermissionTypes.MCP_SERVERS]: { [Permissions.USE]: true },
      },
    });

    const immutableConfig = {
      mcpServers: {
        [SERVER_NAME]: { type: 'sse' as const, url: 'https://migration.example/mcp' },
      },
      mcpSettings: { allowedDomains: ['migration.example'] },
    };
    const boot = createMCPAuthorityBootRevision('migration-boot', immutableConfig);
    const target: MCPAuthorityTargetInput = {
      serverName: SERVER_NAME,
      source: 'config',
      sourceRevision: createMCPAuthorityConfigSourceRevision(boot.digest, []),
      configSourceRevision: createMCPAuthorityConfigSourceRevision(boot.digest, []),
      expectedCredentialRevision: createMCPAuthorityCredentialRevision([], []),
      expectedOAuthGrantGeneration: null,
      resolvedConfig: immutableConfig.mcpServers[SERVER_NAME],
      requiresOAuth: false,
    };
    const proof = await methods.resolveMCPAuthorityProof({
      userId: userId.toHexString(),
      tenantId: TENANT_ID,
      expectedUserSourceRevision: createMCPAuthorityUserSourceRevision({
        ...user.toObject(),
        id: userId.toHexString(),
      }),
      boot,
      targets: [target],
    });

    await expect(
      methods.assertMCPAuthorityProofsCurrent({ proofs: proof, boot }),
    ).resolves.toBeUndefined();
  });
});
