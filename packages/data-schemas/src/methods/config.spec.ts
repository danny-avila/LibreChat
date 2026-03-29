import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { createConfigMethods } from './config';
import configSchema from '~/schema/config';
import type { IConfig } from '~/types';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createConfigMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  if (!mongoose.models.Config) {
    mongoose.model<IConfig>('Config', configSchema);
  }
  methods = createConfigMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Config.deleteMany({});
});

describe('upsertConfig', () => {
  it('creates a new config document', async () => {
    const result = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { endpointsMenu: false } },
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
      { interface: { endpointsMenu: false } },
      10,
    );

    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { endpointsMenu: true } },
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
      { interface: { endpointsMenu: true } },
      10,
    );

    const second = await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { endpointsMenu: false } },
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
      { interface: { endpointsMenu: true, sidePanel: true } },
      10,
    );

    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { 'interface.endpointsMenu': false },
      10,
    );

    const overrides = result!.overrides as Record<string, unknown>;
    const iface = overrides.interface as Record<string, unknown>;
    expect(iface.endpointsMenu).toBe(false);
    expect(iface.sidePanel).toBe(true);
  });

  it('creates a config if none exists (upsert)', async () => {
    const result = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'newrole',
      PrincipalModel.ROLE,
      { 'interface.endpointsMenu': false },
      10,
    );

    expect(result).toBeTruthy();
    expect(result!.principalId).toBe('newrole');
  });
});

describe('unsetConfigField', () => {
  it('removes a field from overrides via $unset', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { endpointsMenu: false, sidePanel: false } },
      10,
    );

    const result = await methods.unsetConfigField(
      PrincipalType.ROLE,
      'admin',
      'interface.endpointsMenu',
    );
    const overrides = result!.overrides as Record<string, unknown>;
    const iface = overrides.interface as Record<string, unknown>;
    expect(iface.endpointsMenu).toBeUndefined();
    expect(iface.sidePanel).toBe(false);
  });

  it('returns null for non-existent config', async () => {
    const result = await methods.unsetConfigField(PrincipalType.ROLE, 'ghost', 'a.b');
    expect(result).toBeNull();
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

  it('reactivates an inactive config', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);

    const result = await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', true);
    expect(result!.isActive).toBe(true);
  });
});
