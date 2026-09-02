import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { IConfig } from '~/types';
import {
  createConfigMethods,
  ensureConfigIndexes,
  fieldPathPolicyError,
  isValidFieldPath,
} from './config';
import configSchema from '~/schema/config';

async function dropNonDefaultIndexes(configModel: typeof mongoose.models.Config): Promise<void> {
  await configModel.createCollection();
  const indexes = await configModel.collection.indexes();
  for (const index of indexes) {
    if (index.name && index.name !== '_id_') {
      await configModel.collection.dropIndex(index.name);
    }
  }
}

async function openIsolatedConfigContext(): Promise<{
  server: MongoMemoryServer;
  conn: mongoose.Connection;
  Config: mongoose.Model<IConfig>;
  methods: ReturnType<typeof createConfigMethods>;
  mongooseLike: typeof mongoose;
}> {
  const server = await MongoMemoryServer.create();
  const conn = mongoose.createConnection(server.getUri(), { autoIndex: false });
  await conn.asPromise();
  const Config = conn.model<IConfig>('Config', configSchema);
  await Config.createCollection();
  await dropNonDefaultIndexes(Config);
  return {
    server,
    conn,
    Config,
    methods: createConfigMethods(conn as unknown as typeof mongoose),
    mongooseLike: conn as unknown as typeof mongoose,
  };
}

async function closeIsolatedConfigContext(ctx: {
  conn: mongoose.Connection;
  server: MongoMemoryServer;
}): Promise<void> {
  await ctx.conn.close();
  await ctx.server.stop();
}

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createConfigMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const Config = mongoose.models.Config ?? mongoose.model<IConfig>('Config', configSchema);
  await Config.init();
  methods = createConfigMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Config.deleteMany({});
});

describe('field path policy', () => {
  it('accepts simple dot paths', () => {
    expect(isValidFieldPath('interface.modelSelect')).toBe(true);
    expect(isValidFieldPath('registration.socialLogins')).toBe(true);
  });

  it('rejects empty, non-string, and unsafe segments', () => {
    expect(isValidFieldPath('')).toBe(false);
    expect(isValidFieldPath(undefined)).toBe(false);
    expect(isValidFieldPath('cache.\0value')).toBe(false);
    expect(isValidFieldPath('__proto__.polluted')).toBe(false);
    expect(isValidFieldPath('cache.__internal-key.value')).toBe(false);
    expect(isValidFieldPath('cache.__på.value')).toBe(false);
    expect(fieldPathPolicyError('cache.\0value')).toMatch(/NUL byte/);
    expect(fieldPathPolicyError('__proto__.polluted')).toMatch(/forbidden segment/);
  });
});

describe('upsertConfig tombstone preservation', () => {
  it('creates a new config document', async () => {
    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    expect(result).toBeTruthy();
    expect(result!.principalType).toBe(PrincipalType.ROLE);
    expect(result!.principalId).toBe('admin');
    expect(result!.priority).toBe(10);
    expect(result!.isActive).toBe(true);
    expect(result!.configVersion).toBe(1);
  });

  it('is idempotent — second upsert updates the same doc', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: true },
      10,
    );

    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: true } },
      10,
    );

    const count = await mongoose.models.Config.countDocuments({});
    expect(count).toBe(1);
  });

  it('increments configVersion on each upsert', async () => {
    const first = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: true } },
      10,
    );

    const second = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    expect(first!.configVersion).toBe(1);
    expect(second!.configVersion).toBe(2);
  });

  it('normalizes ObjectId principalId to string', async () => {
    const oid = new Types.ObjectId();
    await methods.upsertConfig(PrincipalType.USER, oid, PrincipalModel.USER, { cache: true }, 100);

    const found = await methods.findConfigByPrincipal(PrincipalType.USER, oid.toString());
    expect(found).toBeTruthy();
    expect(found!.principalId).toBe(oid.toString());
  });
});

describe('findConfigByPrincipal', () => {
  it('finds an active config', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: true },
      10,
    );

    const result = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(result).toBeTruthy();
    expect(result!.principalType).toBe(PrincipalType.ROLE);
  });

  it('returns null when no config exists', async () => {
    const result = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'nonexistent');
    expect(result).toBeNull();
  });

  it('does not find inactive configs', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: true },
      10,
    );
    await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);

    const result = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(result).toBeNull();
  });
});

describe('listAllConfigs', () => {
  it('returns all configs when no filter', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'a', PrincipalModel.ROLE, {}, 10);
    await methods.upsertConfig(PrincipalType.ROLE, 'b', PrincipalModel.ROLE, {}, 20);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'b', false);

    const all = await methods.listAllConfigs();
    expect(all).toHaveLength(2);
  });

  it('filters by isActive when specified', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'a', PrincipalModel.ROLE, {}, 10);
    await methods.upsertConfig(PrincipalType.ROLE, 'b', PrincipalModel.ROLE, {}, 20);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'b', false);

    const active = await methods.listAllConfigs({ isActive: true });
    expect(active).toHaveLength(1);
    expect(active[0].principalId).toBe('a');

    const inactive = await methods.listAllConfigs({ isActive: false });
    expect(inactive).toHaveLength(1);
    expect(inactive[0].principalId).toBe('b');
  });

  it('returns configs sorted by priority ascending', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'high', PrincipalModel.ROLE, {}, 100);
    await methods.upsertConfig(PrincipalType.ROLE, 'low', PrincipalModel.ROLE, {}, 0);
    await methods.upsertConfig(PrincipalType.ROLE, 'mid', PrincipalModel.ROLE, {}, 50);

    const configs = await methods.listAllConfigs();
    expect(configs.map((c) => c.principalId)).toEqual(['low', 'mid', 'high']);
  });
});

describe('getApplicableConfigs', () => {
  it('always includes the __base__ config', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      '__base__',
      PrincipalModel.ROLE,
      { cache: true },
      0,
    );

    const configs = await methods.getApplicableConfigs([]);
    expect(configs).toHaveLength(1);
    expect(configs[0].principalId).toBe('__base__');
  });

  it('returns base + matching principals', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      '__base__',
      PrincipalModel.ROLE,
      { cache: true },
      0,
    );
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { version: '2' },
      10,
    );
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'user',
      PrincipalModel.ROLE,
      { version: '3' },
      10,
    );

    const configs = await methods.getApplicableConfigs([
      { principalType: PrincipalType.ROLE, principalId: 'admin' },
    ]);

    expect(configs).toHaveLength(2);
    expect(configs.map((c) => c.principalId).sort()).toEqual(['__base__', 'admin']);
  });

  it('returns sorted by priority', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, '__base__', PrincipalModel.ROLE, {}, 0);
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);

    const configs = await methods.getApplicableConfigs([
      { principalType: PrincipalType.ROLE, principalId: 'admin' },
    ]);

    expect(configs[0].principalId).toBe('__base__');
    expect(configs[1].principalId).toBe('admin');
  });

  it('skips principals with undefined principalId', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, '__base__', PrincipalModel.ROLE, {}, 0);

    const configs = await methods.getApplicableConfigs([
      { principalType: PrincipalType.GROUP, principalId: undefined },
    ]);

    expect(configs).toHaveLength(1);
  });
});

describe('patchConfigFields', () => {
  it('atomically sets specific fields via $set', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: true, parameters: true } },
      10,
    );

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'interface.modelSelect': false },
      10,
    );

    const overrides = result!.overrides as Record<string, unknown>;
    const iface = overrides.interface as Record<string, unknown>;
    expect(iface.modelSelect).toBe(false);
    expect(iface.parameters).toBe(true);
  });

  it('creates a config if none exists (upsert)', async () => {
    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'newrole',
      PrincipalModel.ROLE,
      { 'interface.modelSelect': false },
      10,
    );

    expect(result).toBeTruthy();
    expect(result!.principalId).toBe('newrole');
  });

  it('rejects unsafe field paths before writing or polluting prototypes', async () => {
    await expect(
      methods.patchConfigFields(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { '__proto__.polluted': true },
        10,
      ),
    ).rejects.toThrow(/forbidden segment/);

    expect(await mongoose.models.Config.countDocuments({ principalId: 'admin' })).toBe(0);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('clears tombstones for patched paths and their ancestors', async () => {
    await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'mcpServers.github.url': 'https://scoped.example.com' },
      10,
    );

    expect(result!.tombstones).not.toContain('mcpServers.github');
  });

  it('does not clear a whole-section tombstone when patching a nested path', async () => {
    await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers',
      10,
    );

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'mcpServers.github.url': 'https://scoped.example.com' },
      10,
    );

    expect(result!.tombstones).toContain('mcpServers');
  });

  it('sanitizes legacy protected tombstones during field patches', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: 'admin',
      principalModel: PrincipalModel.ROLE,
      overrides: {},
      tombstones: ['interface', 'interfaceConfig.prompts', 'cache'],
      priority: 10,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'registration.enabled': false },
      10,
    );

    expect(result!.tombstones).toEqual(['cache']);
  });

  it('retries patch updates after a CAS miss', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: false },
      10,
    );

    const findOneAndUpdateSpy = jest.spyOn(mongoose.models.Config, 'findOneAndUpdate');
    findOneAndUpdateSpy.mockImplementationOnce((async () => null) as never);

    try {
      const result = await methods.patchConfigFields(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { cache: true },
        10,
      );

      expect(result).toBeTruthy();
      expect(result!.overrides).toEqual({ cache: true });
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    } finally {
      findOneAndUpdateSpy.mockRestore();
    }
  });

  it('preserves concurrent priority changes during field patch retries', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: false },
      10,
    );

    const findOneAndUpdateSpy = jest.spyOn(mongoose.models.Config, 'findOneAndUpdate');
    findOneAndUpdateSpy.mockImplementationOnce((async () => {
      await mongoose.models.Config.updateOne(
        { principalId: 'admin' },
        { $set: { priority: 20 }, $inc: { configVersion: 1 } },
      );
      return null;
    }) as never);

    try {
      const result = await methods.patchConfigFields(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { cache: true },
      );

      expect(result!.priority).toBe(20);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    } finally {
      findOneAndUpdateSpy.mockRestore();
    }
  });

  it('prevents duplicate config documents on concurrent patch creates', async () => {
    const [first, second] = await Promise.all([
      methods.patchConfigFields(
        PrincipalType.ROLE,
        'race-admin',
        PrincipalModel.ROLE,
        { cache: true },
        10,
      ),
      methods.patchConfigFields(
        PrincipalType.ROLE,
        'race-admin',
        PrincipalModel.ROLE,
        { 'registration.enabled': false },
        10,
      ),
    ]);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(await mongoose.models.Config.countDocuments({ principalId: 'race-admin' })).toBe(1);
  });

  it('sanitizes legacy unsafe overrides during field patches', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: 'admin',
      principalModel: PrincipalModel.ROLE,
      overrides: {
        cache: false,
        interfaceConfig: { prompts: false },
        interface: null,
      },
      tombstones: [],
      priority: 10,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'registration.enabled': false },
      10,
    );
    const overrides = result!.overrides as Record<string, unknown>;
    expect(overrides.cache).toBe(false);
    expect(overrides.interfaceConfig).toBeUndefined();
    expect(overrides.interface).toBeUndefined();
    expect(overrides.registration).toEqual({ enabled: false });
  });
});

describe('tombstoneConfigField', () => {
  it('adds a tombstone and removes the overridden subtree', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {
        mcpServers: {
          github: {
            type: 'streamable-http',
            url: 'https://github.example.com',
          },
          slack: {
            type: 'streamable-http',
            url: 'https://slack.example.com',
          },
        },
      },
      10,
    );

    const result = await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );
    const overrides = result!.overrides as Record<string, unknown>;
    const mcpServers = overrides.mcpServers as Record<string, unknown>;

    expect(result!.tombstones).toContain('mcpServers.github');
    expect(mcpServers.github).toBeUndefined();
    expect(mcpServers.slack).toEqual({
      type: 'streamable-http',
      url: 'https://slack.example.com',
    });
  });

  it('creates a config if none exists', async () => {
    const result = await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    expect(result).toBeTruthy();
    expect(result!.tombstones).toContain('mcpServers.github');
  });

  it('preserves inactive configs when adding a tombstone', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);

    const result = await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    expect(result!.isActive).toBe(false);
    expect(result!.tombstones).toContain('mcpServers.github');
  });

  it('sanitizes legacy protected tombstones when adding a new tombstone', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: 'admin',
      principalModel: PrincipalModel.ROLE,
      overrides: {},
      tombstones: ['interface', 'interfaceConfig.prompts', 'cache'],
      priority: 10,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    expect(result!.tombstones).toEqual(['cache', 'mcpServers.github']);
  });

  it('retries tombstone updates after a CAS miss', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: false },
      10,
    );

    const findOneAndUpdateSpy = jest.spyOn(mongoose.models.Config, 'findOneAndUpdate');
    findOneAndUpdateSpy.mockImplementationOnce((async () => null) as never);

    try {
      const result = await methods.tombstoneConfigField(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        'cache',
        10,
      );

      expect(result).toBeTruthy();
      expect(result!.tombstones).toContain('cache');
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    } finally {
      findOneAndUpdateSpy.mockRestore();
    }
  });

  it('preserves concurrent priority changes during tombstone retries', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { cache: false },
      10,
    );

    const findOneAndUpdateSpy = jest.spyOn(mongoose.models.Config, 'findOneAndUpdate');
    findOneAndUpdateSpy.mockImplementationOnce((async () => {
      await mongoose.models.Config.updateOne(
        { principalId: 'admin' },
        { $set: { priority: 20 }, $inc: { configVersion: 1 } },
      );
      return null;
    }) as never);

    try {
      const result = await methods.tombstoneConfigField(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        'cache',
      );

      expect(result!.priority).toBe(20);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    } finally {
      findOneAndUpdateSpy.mockRestore();
    }
  });
});

describe('upsertConfig', () => {
  it('retries base upserts after a CAS miss', async () => {
    const Config = mongoose.models.Config;
    await Config.collection.insertOne({
      principalType: PrincipalType.ROLE,
      principalId: '__base__',
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: [],
      priority: 10,
      isActive: true,
      configVersion: 1,
      tenantId: null,
    });

    const findOneAndUpdateSpy = jest.spyOn(Config, 'findOneAndUpdate');
    const startSessionSpy = jest.spyOn(Config.db, 'startSession');
    startSessionSpy.mockImplementation(
      (async () =>
        ({
          withTransaction: async () => {
            throw new Error('Transaction numbers are only allowed on a replica set member');
          },
          endSession: async () => undefined,
        }) as never) as never,
    );
    findOneAndUpdateSpy.mockImplementationOnce((async () => {
      await Config.updateOne(
        { principalId: '__base__' },
        { $set: { priority: 20 }, $inc: { configVersion: 1 } },
      );
      return null;
    }) as never);

    try {
      const result = await methods.upsertConfig(
        PrincipalType.ROLE,
        '__base__',
        PrincipalModel.ROLE,
        { cache: true },
        10,
        undefined,
        { preservePriority: true },
      );

      expect(result!.overrides).toEqual({ cache: true });
      expect(result!.priority).toBe(20);
      expect(result!.configVersion).toBe(3);
      expect(findOneAndUpdateSpy).toHaveBeenCalledTimes(2);
    } finally {
      findOneAndUpdateSpy.mockRestore();
      startSessionSpy.mockRestore();
    }
  });

  it('retries base upserts after a concurrent create', async () => {
    const Config = mongoose.models.Config;
    const createSpy = jest.spyOn(Config, 'create');
    const startSessionSpy = jest.spyOn(Config.db, 'startSession');
    startSessionSpy.mockImplementation(
      (async () =>
        ({
          withTransaction: async () => {
            throw new Error('Transaction numbers are only allowed on a replica set member');
          },
          endSession: async () => undefined,
        }) as never) as never,
    );
    createSpy.mockImplementationOnce((async () => {
      await Config.collection.insertOne({
        principalType: PrincipalType.ROLE,
        principalId: '__base__',
        principalModel: PrincipalModel.ROLE,
        overrides: { cache: false },
        tombstones: [],
        priority: 10,
        isActive: true,
        configVersion: 1,
        tenantId: null,
      });
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }) as never);

    try {
      const result = await methods.upsertConfig(
        PrincipalType.ROLE,
        '__base__',
        PrincipalModel.ROLE,
        { cache: true },
        10,
      );

      expect(result!.overrides).toEqual({ cache: true });
      expect(result!.configVersion).toBe(2);
      expect(await Config.countDocuments({ principalId: '__base__' })).toBe(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
      startSessionSpy.mockRestore();
    }
  });

  it('preserves tombstones when replacing overrides', async () => {
    await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    expect(result!.tombstones).toContain('mcpServers.github');
  });
});

describe('unsetConfigField', () => {
  it('removes a field from overrides via $unset', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false, parameters: false } },
      10,
    );

    const result = await methods.unsetConfigField(
      PrincipalType.ROLE,
      'admin',
      'interface.modelSelect',
    );
    const overrides = result!.overrides as Record<string, unknown>;
    const iface = overrides.interface as Record<string, unknown>;
    expect(iface.modelSelect).toBeUndefined();
    expect(iface.parameters).toBe(false);
  });

  it('returns null for non-existent config', async () => {
    const result = await methods.unsetConfigField(PrincipalType.ROLE, 'ghost', 'a.b');
    expect(result).toBeNull();
  });

  it('clears tombstones for the reset path and descendants', async () => {
    await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    const result = await methods.unsetConfigField(PrincipalType.ROLE, 'admin', 'mcpServers.github');

    expect(result!.tombstones).not.toContain('mcpServers.github');
  });
});

describe('deleteConfig', () => {
  it('deletes and returns the config', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    const deleted = await methods.deleteConfig(PrincipalType.ROLE, 'admin');
    expect(deleted).toBeTruthy();

    const found = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(found).toBeNull();
  });

  it('returns null when deleting non-existent config', async () => {
    const result = await methods.deleteConfig(PrincipalType.ROLE, 'ghost');
    expect(result).toBeNull();
  });
});

describe('toggleConfigActive', () => {
  it('deactivates an active config', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);
    expect(result!.isActive).toBe(false);
  });

  it('increments configVersion when toggling active state', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    const before = await mongoose.models.Config.findOne({ principalId: 'admin' });
    expect(before?.configVersion).toBe(1);

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);
    expect(result!.configVersion).toBe(2);
  });

  it('reactivates an inactive config', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', true);
    expect(result!.isActive).toBe(true);
  });
});

describe('expectEmpty atomic guard', () => {
  it('deleteConfig with expectEmpty matches and deletes an empty doc', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);

    const result = await methods.deleteConfig(PrincipalType.ROLE, 'admin', undefined, {
      expectEmpty: true,
    });
    expect(result).toBeTruthy();

    const remaining = await mongoose.models.Config.countDocuments({});
    expect(remaining).toBe(0);
  });

  it('deleteConfig with expectEmpty returns null when overrides is non-empty (doc preserved)', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    const result = await methods.deleteConfig(PrincipalType.ROLE, 'admin', undefined, {
      expectEmpty: true,
    });
    expect(result).toBeNull();

    const remaining = await mongoose.models.Config.countDocuments({});
    expect(remaining).toBe(1);
  });

  it('deleteConfig with expectEmpty returns null when tombstones is non-empty (doc preserved)', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: 'admin',
      principalModel: PrincipalModel.ROLE,
      overrides: {},
      tombstones: ['endpoints.openai.apiKey'],
      priority: 10,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.deleteConfig(PrincipalType.ROLE, 'admin', undefined, {
      expectEmpty: true,
    });
    expect(result).toBeNull();

    const remaining = await mongoose.models.Config.countDocuments({});
    expect(remaining).toBe(1);
  });

  it('toggleConfigActive with expectEmpty matches and toggles an empty doc', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false, undefined, {
      expectEmpty: true,
    });
    expect(result).toBeTruthy();
    expect(result!.isActive).toBe(false);
  });

  it('toggleConfigActive with expectEmpty returns null on non-empty doc (isActive preserved)', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false, undefined, {
      expectEmpty: true,
    });
    expect(result).toBeNull();

    const doc = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(doc!.isActive).toBe(true);
  });

  it('upsertConfig with expectEmpty inserts when no doc exists', async () => {
    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {},
      10,
      undefined,
      { expectEmpty: true },
    );
    expect(result).toBeTruthy();
    expect(result!.principalId).toBe('admin');
  });

  it('upsertConfig with expectEmpty updates an empty existing doc', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 5);

    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {},
      99,
      undefined,
      { expectEmpty: true },
    );
    expect(result).toBeTruthy();
    expect(result!.priority).toBe(99);
  });

  it('upsertConfig with preservePriority inserts with the requested priority', async () => {
    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {},
      10,
      undefined,
      { expectEmpty: true, preservePriority: true },
    );

    expect(result).toBeTruthy();
    expect(result!.priority).toBe(10);
  });

  it('upsertConfig with preservePriority keeps an empty existing doc priority', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 5);

    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {},
      99,
      undefined,
      { expectEmpty: true, preservePriority: true },
    );

    expect(result).toBeTruthy();
    expect(result!.priority).toBe(5);
    expect(result!.configVersion).toBe(2);
  });

  it('upsertConfig with expectEmpty returns null when existing doc has non-empty overrides', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      10,
    );

    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      {},
      99,
      undefined,
      { expectEmpty: true },
    );
    expect(result).toBeNull();

    const doc = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(doc!.priority).toBe(10);
    expect(Object.keys(doc!.overrides ?? {}).length).toBeGreaterThan(0);
  });
});

describe('ensureConfigIndexes', () => {
  it('builds indexes independently for each Config model', async () => {
    const first = await openIsolatedConfigContext();
    const secondServer = await MongoMemoryServer.create();
    const secondConn = mongoose.createConnection(secondServer.getUri(), { autoIndex: false });
    await secondConn.asPromise();
    const secondConfig = secondConn.model<IConfig>('Config', configSchema);
    await secondConfig.createCollection();

    const firstSpy = jest.spyOn(first.Config, 'createIndexes');
    const secondSpy = jest.spyOn(secondConfig, 'createIndexes');

    try {
      await ensureConfigIndexes(first.mongooseLike);
      await ensureConfigIndexes(secondConn as unknown as typeof mongoose);

      expect(firstSpy).toHaveBeenCalledTimes(1);
      expect(secondSpy).toHaveBeenCalledTimes(1);
    } finally {
      firstSpy.mockRestore();
      secondSpy.mockRestore();
      await closeIsolatedConfigContext(first);
      await secondConn.close();
      await secondServer.stop();
    }
  });

  it('creates the unique index before concurrent patch creates when autoIndex is disabled', async () => {
    const ctx = await openIsolatedConfigContext();
    const createIndexesSpy = jest.spyOn(ctx.Config, 'createIndexes');

    try {
      const [first, second] = await Promise.all([
        ctx.methods.patchConfigFields(
          PrincipalType.ROLE,
          'race-admin',
          PrincipalModel.ROLE,
          { cache: true },
          10,
        ),
        ctx.methods.patchConfigFields(
          PrincipalType.ROLE,
          'race-admin',
          PrincipalModel.ROLE,
          { 'registration.enabled': false },
          10,
        ),
      ]);

      expect(createIndexesSpy).toHaveBeenCalled();
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(await ctx.Config.countDocuments({ principalId: 'race-admin' })).toBe(1);
    } finally {
      createIndexesSpy.mockRestore();
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('retries ensureConfigIndexes after a rejected build', async () => {
    const ctx = await openIsolatedConfigContext();
    const originalCreateIndexes = ctx.Config.createIndexes.bind(ctx.Config);
    let createIndexCalls = 0;
    const createIndexesSpy = jest.spyOn(ctx.Config, 'createIndexes').mockImplementation(function (
      this: typeof ctx.Config,
      ...args: Parameters<typeof ctx.Config.createIndexes>
    ) {
      createIndexCalls += 1;
      if (createIndexCalls === 1) {
        return Promise.reject(new Error('index build denied'));
      }
      return originalCreateIndexes(...args);
    });

    try {
      await expect(ensureConfigIndexes(ctx.mongooseLike)).rejects.toThrow('index build denied');

      await ensureConfigIndexes(ctx.mongooseLike);

      expect(createIndexCalls).toBe(2);

      const indexes = await ctx.Config.collection.indexes();
      const uniquePrincipalIndex = indexes.find(
        (index) =>
          index.unique === true &&
          index.key?.principalType === 1 &&
          index.key?.principalId === 1 &&
          index.key?.tenantId === 1,
      );
      expect(uniquePrincipalIndex).toBeDefined();
    } finally {
      createIndexesSpy.mockRestore();
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('does not build indexes when patchConfigFields rejects oversized paths', async () => {
    const ctx = await openIsolatedConfigContext();
    const createIndexesSpy = jest.spyOn(ctx.Config, 'createIndexes');
    const oversizedKey = Array.from({ length: 33 }, (_, i) => `s${i}`).join('.');

    try {
      await expect(
        ctx.methods.patchConfigFields(
          PrincipalType.ROLE,
          'admin',
          PrincipalModel.ROLE,
          { [oversizedKey]: true },
          10,
        ),
      ).rejects.toThrow(/maximum depth/);
      expect(createIndexesSpy).not.toHaveBeenCalled();
    } finally {
      createIndexesSpy.mockRestore();
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('does not build indexes when tombstoneConfigField rejects oversized paths', async () => {
    const ctx = await openIsolatedConfigContext();
    const createIndexesSpy = jest.spyOn(ctx.Config, 'createIndexes');
    const oversizedPath = Array.from({ length: 33 }, (_, i) => `s${i}`).join('.');

    try {
      await expect(
        ctx.methods.tombstoneConfigField(
          PrincipalType.ROLE,
          'admin',
          PrincipalModel.ROLE,
          oversizedPath,
          10,
        ),
      ).rejects.toThrow(/maximum depth/);
      expect(createIndexesSpy).not.toHaveBeenCalled();
    } finally {
      createIndexesSpy.mockRestore();
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('deduplicates principals with the same key and keeps the highest configVersion', async () => {
    const ctx = await openIsolatedConfigContext();
    try {
      await ctx.Config.collection.insertMany([
        {
          principalType: PrincipalType.ROLE,
          principalId: 'dup-role',
          principalModel: PrincipalModel.ROLE,
          priority: 10,
          overrides: { cache: false },
          tombstones: [],
          isActive: true,
          configVersion: 1,
          tenantId: '',
        },
        {
          principalType: PrincipalType.ROLE,
          principalId: 'dup-role',
          principalModel: PrincipalModel.ROLE,
          priority: 10,
          overrides: { cache: true },
          tombstones: [],
          isActive: true,
          configVersion: 2,
          tenantId: '',
        },
      ]);

      await ensureConfigIndexes(ctx.mongooseLike);

      expect(await ctx.Config.countDocuments({ principalId: 'dup-role' })).toBe(1);
      const survivor = await ctx.Config.findOne({ principalId: 'dup-role' });
      expect((survivor?.overrides as { cache?: boolean })?.cache).toBe(true);
    } finally {
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('normalizes missing tenantId to null before building the index', async () => {
    const ctx = await openIsolatedConfigContext();
    try {
      // Insert a doc without tenantId (simulates a write from an old pod without the default)
      await ctx.Config.collection.insertOne({
        principalType: PrincipalType.ROLE,
        principalId: 'missing-tenant',
        principalModel: PrincipalModel.ROLE,
        priority: 10,
        overrides: { cache: false },
        tombstones: [],
        isActive: true,
        configVersion: 1,
      } as never);

      await ensureConfigIndexes(ctx.mongooseLike);

      const doc = await ctx.Config.collection.findOne({ principalId: 'missing-tenant' });
      expect(doc?.tenantId).toBeNull();
    } finally {
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('deduplicates an alias pair (null and empty-string tenantId) even when the unique index already exists', async () => {
    const ctx = await openIsolatedConfigContext();
    try {
      // Pre-build the unique index directly (simulates a prior deployment)
      await ctx.Config.collection.createIndex(
        { principalType: 1, principalId: 1, tenantId: 1 },
        { unique: true },
      );

      // Two logical-duplicate docs — '' and null are different index keys so both inserts succeed
      await ctx.Config.collection.insertOne({
        principalType: PrincipalType.ROLE,
        principalId: 'alias-pair',
        principalModel: PrincipalModel.ROLE,
        priority: 10,
        overrides: { cache: false },
        tombstones: [],
        isActive: true,
        configVersion: 1,
        tenantId: '',
      });
      await ctx.Config.collection.insertOne({
        principalType: PrincipalType.ROLE,
        principalId: 'alias-pair',
        principalModel: PrincipalModel.ROLE,
        priority: 10,
        overrides: { cache: true },
        tombstones: [],
        isActive: true,
        configVersion: 2,
        tenantId: null,
      });

      // Must not throw E11000 — dedup runs before any canonicalization
      await ensureConfigIndexes(ctx.mongooseLike);

      expect(await ctx.Config.countDocuments({ principalId: 'alias-pair' })).toBe(1);
      const survivor = await ctx.Config.findOne({ principalId: 'alias-pair' });
      expect((survivor?.overrides as { cache?: boolean })?.cache).toBe(true);
      // Winner (null, v2) should stay null — no regression from canonicalization
      expect(survivor?.tenantId).toBeNull();
    } finally {
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('canonicalizes an empty-string winner to null and then rejects a missing-tenantId insert', async () => {
    const ctx = await openIsolatedConfigContext();
    try {
      // Empty-string doc has the higher version — it wins the dedup sort
      await ctx.Config.collection.insertMany([
        {
          principalType: PrincipalType.ROLE,
          principalId: 'empty-winner',
          principalModel: PrincipalModel.ROLE,
          priority: 10,
          overrides: { cache: true },
          tombstones: [],
          isActive: true,
          configVersion: 2,
          tenantId: '',
        },
        {
          principalType: PrincipalType.ROLE,
          principalId: 'empty-winner',
          principalModel: PrincipalModel.ROLE,
          priority: 10,
          overrides: { cache: false },
          tombstones: [],
          isActive: true,
          configVersion: 1,
          tenantId: null,
        },
      ]);

      await ensureConfigIndexes(ctx.mongooseLike);

      expect(await ctx.Config.countDocuments({ principalId: 'empty-winner' })).toBe(1);
      const survivor = await ctx.Config.collection.findOne({ principalId: 'empty-winner' });
      // '' winner must be canonicalized to null so it occupies the same index slot
      expect(survivor?.tenantId).toBeNull();

      // A subsequent missing-tenantId write for the same principal must be rejected
      await expect(
        ctx.Config.collection.insertOne({
          principalType: PrincipalType.ROLE,
          principalId: 'empty-winner',
          principalModel: PrincipalModel.ROLE,
          priority: 10,
          overrides: {},
          tombstones: [],
          isActive: true,
          configVersion: 3,
        } as never),
      ).rejects.toMatchObject({ code: 11000 });
    } finally {
      await closeIsolatedConfigContext(ctx);
    }
  });

  it('retries on E11000 thrown by the canonicalization step inside deduplicateConfigPrincipals', async () => {
    const ctx = await openIsolatedConfigContext();
    const originalUpdateMany = ctx.Config.collection.updateMany.bind(ctx.Config.collection);
    let updateManyCalls = 0;
    ctx.Config.collection.updateMany = ((...args: Parameters<typeof originalUpdateMany>) => {
      updateManyCalls += 1;
      if (updateManyCalls === 1) {
        return Promise.reject(
          Object.assign(new Error('E11000 simulated concurrent alias'), { code: 11000 }),
        );
      }
      return originalUpdateMany(...args);
    }) as typeof ctx.Config.collection.updateMany;

    try {
      await ctx.Config.collection.insertOne({
        principalType: PrincipalType.ROLE,
        principalId: 'retry-canon',
        principalModel: PrincipalModel.ROLE,
        priority: 10,
        overrides: {},
        tombstones: [],
        isActive: true,
        configVersion: 1,
        tenantId: null,
      });

      // With deduplicateConfigPrincipals inside the retry boundary, the E11000 from
      // the canonicalization step is caught and the next attempt succeeds.
      await expect(ensureConfigIndexes(ctx.mongooseLike)).resolves.not.toThrow();
      expect(updateManyCalls).toBeGreaterThanOrEqual(2);
    } finally {
      ctx.Config.collection.updateMany = originalUpdateMany;
      await closeIsolatedConfigContext(ctx);
    }
  });
});
