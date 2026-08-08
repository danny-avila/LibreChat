import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Permissions,
  PermissionBits,
  ResourceType,
  PrincipalType,
  PrincipalModel,
  PermissionTypes,
} from 'librechat-data-provider';
import type { ConnectOptions } from 'mongoose';
import type { MCPAuthorityProofError } from '~/methods/mcpAuthority';
import type { MCPAuthorityTargetInput } from '~/types';
import {
  MCP_AUTHORITY_PROOF_COLLECTIONS,
  createMCPAuthorityMethods,
  createMCPAuthorityBootRevision,
  createMCPAuthorityConfigSourceRevision,
  createMCPAuthorityCredentialRevision,
  createMCPAuthorityDatabaseSourceRevision,
  createMCPAuthorityUserSourceRevision,
} from '~/methods/mcpAuthority';
import { createMCPAuthorityProofCollections } from '~/migrations/mcpAuthorityCollections';
import { createMCPAuthorityLookupIndexes } from '~/migrations/mcpAuthorityIndexes';
import { assertMCPAuthorityReadiness } from '~/migrations/mcpAuthorityReadiness';
import { backfillMCPServerNormalizedNames } from '~/migrations/mcpServerNames';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

const EXTERNAL_URI = process.env.MCP_AUTHORITY_MONGO_WIRE_URI;
const PROVIDER = process.env.MCP_AUTHORITY_MONGO_WIRE_PROVIDER ?? 'native-mongodb';
const RUN_ID = randomUUID().slice(0, 12);
const TENANT_ID = `authority-conformance-${RUN_ID}`;
const ROLE_NAME = `MCP_AUTHORITY_${RUN_ID}`;
const SERVER_NAME = `authority-${RUN_ID}`;
const PLUGIN_KEY = `mcp_${SERVER_NAME}`;
const LEGACY_SERVER_NAME = `legacy authority ${RUN_ID}`;

let memoryServer: MongoMemoryServer | undefined;
let models: ReturnType<typeof createModels>;
let methods: ReturnType<typeof createMCPAuthorityMethods>;
let userId: mongoose.Types.ObjectId;
let groupId: mongoose.Types.ObjectId;
let serverId: mongoose.Types.ObjectId;
let agentId: mongoose.Types.ObjectId;
const legacyServerId = new mongoose.Types.ObjectId();

const immutableConfig = {
  mcpServers: {},
  mcpSettings: { allowedDomains: [`${SERVER_NAME}.example`] },
};
const boot = createMCPAuthorityBootRevision(`mongo-wire-${RUN_ID}`, immutableConfig);

function inTenant<Result>(action: () => Promise<Result>): Promise<Result> {
  return tenantStorage.run({ tenantId: TENANT_ID, userId: userId?.toHexString() }, action);
}

async function createTarget(): Promise<MCPAuthorityTargetInput> {
  const [server, configs, credentials] = await inTenant(() =>
    Promise.all([
      models.MCPServer.findById(serverId).lean(),
      models.Config.find({
        principalType: PrincipalType.USER,
        principalId: userId.toHexString(),
      }).lean(),
      models.PluginAuth.find({ userId: userId.toHexString(), pluginKey: PLUGIN_KEY }).lean(),
    ]),
  );
  if (!server) {
    throw new Error('Mongo-wire conformance server was not created');
  }
  return {
    serverName: SERVER_NAME,
    source: 'database',
    databaseId: serverId.toHexString(),
    sourceRevision: createMCPAuthorityDatabaseSourceRevision({
      databaseId: server._id.toHexString(),
      serverName: server.serverName,
      author: server.author.toString(),
      config: server.config,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    }),
    configSourceRevision: createMCPAuthorityConfigSourceRevision(boot.digest, configs),
    expectedCredentialRevision: createMCPAuthorityCredentialRevision(['API_KEY'], credentials),
    expectedOAuthGrantGeneration: 'mongo-wire-generation-1',
    resolvedConfig: {
      type: 'sse',
      url: `https://${SERVER_NAME}.example/mcp`,
      customUserVars: { API_KEY: { title: 'API key', description: 'Conformance credential' } },
    },
    requiresOAuth: true,
  };
}

async function currentUserSourceRevision(): Promise<string> {
  const user = await inTenant(() => models.User.findById(userId).lean());
  if (!user) {
    throw new Error('Mongo-wire conformance user was not created');
  }
  return createMCPAuthorityUserSourceRevision({ ...user, id: userId.toHexString() });
}

async function seedAuthorityFixture(): Promise<void> {
  userId = new mongoose.Types.ObjectId();
  groupId = new mongoose.Types.ObjectId();
  serverId = new mongoose.Types.ObjectId();
  agentId = new mongoose.Types.ObjectId();
  const expiresAt = new Date(Date.now() + 3_600_000);
  await inTenant(async () => {
    await Promise.all([
      models.User.create({
        _id: userId,
        email: `${RUN_ID}@authority.test`,
        emailVerified: true,
        provider: 'openid',
        role: ROLE_NAME,
        idOnTheSource: `source-${RUN_ID}`,
        openidId: `openid-${RUN_ID}`,
        openidIssuer: 'https://issuer.example',
      }),
      models.Role.create({
        name: ROLE_NAME,
        permissions: {
          [PermissionTypes.MCP_SERVERS]: { [Permissions.USE]: true },
        },
      }),
      models.Group.create({
        _id: groupId,
        name: `Authority ${RUN_ID}`,
        source: 'entra',
        idOnTheSource: `group-${RUN_ID}`,
        memberIds: [`source-${RUN_ID}`],
      }),
      models.Config.create({
        principalType: PrincipalType.USER,
        principalId: userId.toHexString(),
        principalModel: PrincipalModel.USER,
        priority: 30,
        overrides: {
          mcpServers: { [SERVER_NAME]: { startup: false } },
          mcpSettings: { allowedDomains: [`${SERVER_NAME}.example`] },
        },
        tombstones: ['mcpSettings.autoStart'],
        isActive: true,
        configVersion: 1,
      }),
      models.MCPServer.create({
        _id: serverId,
        serverName: SERVER_NAME,
        config: { type: 'sse', url: `https://${SERVER_NAME}.example/mcp` },
        author: userId,
      }),
      models.Agent.create({
        _id: agentId,
        id: `agent-${RUN_ID}`,
        name: `Authority ${RUN_ID}`,
        provider: 'openAI',
        model: 'conformance-model',
        author: userId,
        mcpServerNames: [SERVER_NAME],
      }),
      models.AclEntry.create({
        principalType: PrincipalType.USER,
        principalId: userId,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.MCPSERVER,
        resourceId: serverId,
        permBits: PermissionBits.VIEW,
        grantedBy: userId,
      }),
      models.PluginAuth.create({
        userId: userId.toHexString(),
        pluginKey: PLUGIN_KEY,
        authField: 'API_KEY',
        value: 'conformance-secret',
      }),
      models.Token.insertMany(
        [
          ['mcp_oauth', `mcp:${SERVER_NAME}`],
          ['mcp_oauth_refresh', `mcp:${SERVER_NAME}:refresh`],
          ['mcp_oauth_client', `mcp:${SERVER_NAME}:client`],
        ].map(([type, identifier]) => ({
          userId,
          type,
          identifier,
          token: `${type}-secret`,
          metadata: { credential_set_id: 'mongo-wire-generation-1' },
          expiresAt,
        })),
      ),
    ]);
  });
}

async function cleanupFixture(): Promise<void> {
  if (!mongoose.connection.db || !userId) {
    return;
  }
  await Promise.all([
    mongoose.connection.db.collection('aclentries').deleteMany({ resourceId: serverId }),
    mongoose.connection.db.collection('mcpservers').deleteMany({ _id: serverId }),
    mongoose.connection.db.collection('mcpservers').deleteMany({ _id: legacyServerId }),
    mongoose.connection.db.collection('agents').deleteMany({ _id: agentId }),
    mongoose.connection.db.collection('configs').deleteMany({ principalId: userId.toHexString() }),
    mongoose.connection.db.collection('pluginauths').deleteMany({ userId: userId.toHexString() }),
    mongoose.connection.db.collection('tokens').deleteMany({ userId }),
    mongoose.connection.db.collection('groups').deleteMany({ _id: groupId }),
    mongoose.connection.db.collection('roles').deleteMany({ name: ROLE_NAME }),
    mongoose.connection.db.collection('users').deleteMany({ _id: userId }),
  ]);
}

describe(`MCP authority Mongo-wire conformance (${PROVIDER})`, () => {
  beforeAll(async () => {
    if (
      PROVIDER === 'azure-cosmos-mongodb' &&
      process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED !== 'true'
    ) {
      throw new Error(
        'Azure Cosmos DB MCP authority conformance requires account-level Strong consistency',
      );
    }
    let uri = EXTERNAL_URI;
    if (!uri) {
      memoryServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
      uri = memoryServer.getUri();
    }
    const options: ConnectOptions = { autoCreate: false, autoIndex: false };
    if (process.env.MCP_AUTHORITY_MONGO_WIRE_TLS_CA_FILE) {
      options.tlsCAFile = process.env.MCP_AUTHORITY_MONGO_WIRE_TLS_CA_FILE;
    }
    if (process.env.MCP_AUTHORITY_MONGO_WIRE_TLS_ALLOW_INVALID_HOSTNAMES === 'true') {
      options.tlsAllowInvalidHostnames = true;
    }
    await mongoose.connect(uri, options);
    models = createModels(mongoose);
    Object.assign(mongoose.models, models);
    methods = createMCPAuthorityMethods(mongoose);
  });

  afterAll(async () => {
    await cleanupFixture();
    await mongoose.disconnect();
    await memoryServer?.stop();
  });

  test('migrates and verifies the common authority schema', async () => {
    await createMCPAuthorityProofCollections(mongoose.connection);
    await mongoose.connection.db!.collection('mcpservers').insertOne({
      _id: legacyServerId,
      serverName: LEGACY_SERVER_NAME,
    });
    await backfillMCPServerNormalizedNames(mongoose.connection);
    await createMCPAuthorityLookupIndexes(mongoose.connection);

    await expect(
      mongoose.connection.db!.collection('mcpservers').findOne({ _id: legacyServerId }),
    ).resolves.toEqual(
      expect.objectContaining({ normalizedServerName: `legacy_authority_${RUN_ID}` }),
    );

    await expect(
      assertMCPAuthorityReadiness(mongoose.connection, {
        cosmosStrongConsistencyConfirmed:
          process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED === 'true',
      }),
    ).resolves.toEqual({
      scannedServers: expect.any(Number),
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

  test('resolves all nine sources and invalidates the proof after a fenced write', async () => {
    await seedAuthorityFixture();
    const target = await createTarget();
    const expectedUserSourceRevision = await currentUserSourceRevision();
    const proof = await inTenant(() =>
      methods.resolveMCPAuthorityProof({
        userId: userId.toHexString(),
        tenantId: TENANT_ID,
        expectedUserSourceRevision,
        boot,
        targets: [target],
      }),
    );

    expect(proof.shared.groups).toHaveLength(1);
    expect(proof.shared.configs).toHaveLength(4);
    expect(proof.servers[0]).toEqual(
      expect.objectContaining({
        serverName: SERVER_NAME,
        linkedAgentIds: [agentId.toHexString()],
        directAccess: true,
        credentialFields: ['API_KEY'],
        oauthGrantGeneration: 'mongo-wire-generation-1',
      }),
    );
    await expect(
      inTenant(() => methods.assertMCPAuthorityProofsCurrent({ proofs: proof, boot })),
    ).resolves.toBeUndefined();

    await methods.mutateMCPAuthority(async () => {
      await models.Config.updateOne(
        { principalType: PrincipalType.USER, principalId: userId.toHexString() },
        { $set: { 'overrides.mcpSettings.allowedDomains': ['restricted.example'] } },
      );
    });

    await expect(
      inTenant(() => methods.assertMCPAuthorityProofsCurrent({ proofs: proof, boot })),
    ).rejects.toEqual(
      expect.objectContaining<Pick<MCPAuthorityProofError, 'name' | 'reason'>>({
        name: 'MCPAuthorityProofError',
        reason: 'config_changed',
      }),
    );
  });

  test('rejects reads while an authority writer owns the fence', async () => {
    const expectedUserSourceRevision = await currentUserSourceRevision();
    let releaseWriter: (() => void) | undefined;
    let writerEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      writerEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const writer = methods.mutateMCPAuthority(async () => {
      writerEntered?.();
      await release;
    });
    await entered;

    const target = await createTarget();
    await expect(
      inTenant(() =>
        methods.resolveMCPAuthorityProof({
          userId: userId.toHexString(),
          tenantId: TENANT_ID,
          expectedUserSourceRevision,
          boot,
          targets: [target],
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Pick<MCPAuthorityProofError, 'name' | 'reason'>>({
        name: 'MCPAuthorityProofError',
        reason: 'proof_unavailable',
      }),
    );

    releaseWriter?.();
    await writer;
  });
});
