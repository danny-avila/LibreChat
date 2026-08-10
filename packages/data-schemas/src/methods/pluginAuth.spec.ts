import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { MCPAuthorityConsistencyModule } from './mcpAuthority/consistency';
import type { IPluginAuth } from '~/types';
import {
  createMCPAuthorityConsistencyModule,
  type MCPAuthorityConsistencyFence,
} from './mcpAuthority/consistency';
import { createPluginAuthMethods } from './pluginAuth';
import pluginAuthSchema from '~/schema/pluginAuth';

describe('plugin auth methods', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createPluginAuthMethods>;
  let consistency: MCPAuthorityConsistencyModule;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
    await mongoose.connect(mongoServer.getUri());
    if (!mongoose.models.PluginAuth) {
      mongoose.model<IPluginAuth>('PluginAuth', pluginAuthSchema);
    }
    consistency = createMCPAuthorityConsistencyModule({
      collection:
        mongoose.connection.collection<MCPAuthorityConsistencyFence>('mcpAuthorityConsistency'),
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createOwnerId: () => new mongoose.Types.ObjectId().toHexString(),
    });
    methods = createPluginAuthMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await mongoose.models.PluginAuth.deleteMany({});
    await mongoose.connection.collection('mcpAuthorityConsistency').deleteMany({});
  });

  test('deletes only the requested plugin credential', async () => {
    await mongoose.models.PluginAuth.create([
      {
        userId: 'user-1',
        pluginKey: 'mcp_database',
        authField: 'API_KEY',
        value: 'mcp-secret',
      },
      {
        userId: 'user-1',
        pluginKey: 'weather',
        authField: 'API_KEY',
        value: 'weather-secret',
      },
    ]);

    await methods.deletePluginAuth({
      userId: 'user-1',
      pluginKey: 'weather',
      authField: 'API_KEY',
    });

    await expect(
      mongoose.models.PluginAuth.find({ userId: 'user-1' }).sort({ pluginKey: 1 }).lean(),
    ).resolves.toEqual([
      expect.objectContaining({ pluginKey: 'mcp_database', value: 'mcp-secret' }),
    ]);
  });

  test('rejects a single-field delete without an exact plugin identity', async () => {
    await mongoose.models.PluginAuth.create([
      {
        userId: 'user-1',
        pluginKey: 'mcp_database',
        authField: 'API_KEY',
        value: 'mcp-secret',
      },
      {
        userId: 'user-1',
        pluginKey: 'weather',
        authField: 'API_KEY',
        value: 'weather-secret',
      },
    ]);

    await expect(
      methods.deletePluginAuth({ userId: 'user-1', authField: 'API_KEY' }),
    ).rejects.toThrow('pluginKey is required when all is false');
    await expect(mongoose.models.PluginAuth.countDocuments({ userId: 'user-1' })).resolves.toBe(2);
  });

  test('publishes generations only for MCP credential mutations', async () => {
    await consistency.initializeMCPAuthorityConsistency();

    await methods.updatePluginAuth({
      userId: 'user-1',
      pluginKey: 'weather',
      authField: 'API_KEY',
      value: 'weather-secret',
    });
    await expect(consistency.assertGeneration(0)).resolves.toBeUndefined();

    await methods.updatePluginAuth({
      userId: 'user-1',
      pluginKey: 'mcp_database',
      authField: 'API_KEY',
      value: 'mcp-secret',
    });
    await expect(consistency.assertGeneration(1)).resolves.toBeUndefined();

    await methods.deletePluginAuth({
      userId: 'user-1',
      pluginKey: 'weather',
      authField: 'API_KEY',
    });
    await expect(consistency.assertGeneration(1)).resolves.toBeUndefined();

    await methods.deleteAllUserPluginAuths('user-1');
    await expect(consistency.assertGeneration(2)).resolves.toBeUndefined();
  });
});
