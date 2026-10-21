import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { IConfig } from '~/types';
import { createConfigMethods } from './config';
import configSchema from '~/schema/config';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createConfigMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  if (!mongoose.models.Config) {
    mongoose.model<IConfig>('Config', configSchema);
  }
  await mongoose.models.Config.init();
  methods = createConfigMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Config.deleteMany({});
});

describe('restoreConfig', () => {
  it('restores tombstones and the inactive flag, and never overwrites a newer document', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);
    await methods.tombstoneConfigField(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, 'a.b', 10);
    await methods.toggleConfigActive(PrincipalType.ROLE, 'admin', false);
    const deleted = await methods.deleteConfig(PrincipalType.ROLE, 'admin');
    const snapshot = { ...deleted! };

    expect(await methods.restoreConfig(snapshot)).toBe(true);
    const restored = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin', {
      includeInactive: true,
    });
    expect(restored!.isActive).toBe(false);
    expect(restored!.tombstones).toContain('a.b');

    await methods.upsertConfig(
      PrincipalType.ROLE,
      'admin',
      PrincipalModel.ROLE,
      { interface: { modelSelect: false } },
      99,
    );
    expect(await methods.restoreConfig(snapshot)).toBe(false);
    const kept = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin');
    expect(kept!.priority).toBe(99);
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
      { interface: { modelSelect: false } },
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
});

describe('upsertConfig', () => {
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

describe('toggleConfigActiveTracked', () => {
  it('reports a change once and returns the persisted document', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'admin', PrincipalModel.ROLE, {}, 10);

    const first = await methods.toggleConfigActiveTracked(PrincipalType.ROLE, 'admin', false);
    const second = await methods.toggleConfigActiveTracked(PrincipalType.ROLE, 'admin', false);
    const missing = await methods.toggleConfigActiveTracked(PrincipalType.ROLE, 'none', false);

    expect(first).toMatchObject({ changed: true, config: { isActive: false } });
    expect(second).toMatchObject({ changed: false, config: { isActive: false } });
    expect(missing).toBeNull();
  });
});

const raw = () => mongoose.connection.db!.collection('configs');

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (value != null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe('key encoding at rest', () => {
  const dotted = {
    endpoints: {
      bedrock: { inferenceProfiles: { 'us.anthropic.claude-sonnet-4-5': 'arn:aws:x' } },
      azureOpenAI: { groups: [{ group: 'g', models: { 'gpt-4.1': { deploymentName: 'd' } } }] },
    },
    fileConfig: { endpoints: { custom: { supportedMimeTypes: ['image/.*'] } } },
    $top: { 'a.b': '$value.stays' },
  };

  it('stores no dotted or `$` keys and reads them back decoded', async () => {
    await methods.upsertConfig(PrincipalType.ROLE, 'enc', PrincipalModel.ROLE, dotted as never, 10);

    const stored = await raw().findOne({ principalId: 'enc' });
    const keys = collectKeys(stored!.overrides);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => key.includes('.') || key.startsWith('$'))).toEqual([]);
    expect(stored!.keyEncoding).toBe(1);
    expect(stored!.overrides.$top).toBeUndefined();
    expect(stored!.overrides['%24top']).toEqual({ 'a%2Eb': '$value.stays' });

    const read = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'enc');
    expect(read!.overrides).toEqual(dotted);
    expect(
      (await methods.getApplicableConfigs([{ principalType: 'role', principalId: 'enc' }]))[0]
        .overrides,
    ).toEqual(dotted);
  });

  it('keeps encoding when a field under a dotted record key is patched by segments of its parent', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'enc2',
      PrincipalModel.ROLE,
      dotted as never,
      10,
    );

    const patched = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'enc2',
      PrincipalModel.ROLE,
      { 'endpoints.bedrock.inferenceProfiles': { 'eu.meta.llama': 'arn:eu' } },
      10,
    );

    expect(patched.overrides).toEqual({
      ...dotted,
      endpoints: {
        ...dotted.endpoints,
        bedrock: { inferenceProfiles: { 'eu.meta.llama': 'arn:eu' } },
      },
    });
    const stored = await raw().findOne({ principalId: 'enc2' });
    expect(stored!.overrides.endpoints.bedrock.inferenceProfiles).toEqual({
      'eu%2Emeta%2Ellama': 'arn:eu',
    });
  });

  it('removes dotted record keys by their segments, pruning what they empty, in one write', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'enc3',
      PrincipalModel.ROLE,
      dotted as never,
      10,
    );
    const profile = ['endpoints', 'bedrock', 'inferenceProfiles', 'us.anthropic.claude-sonnet-4-5'];

    const removed = await methods.unsetConfigField(PrincipalType.ROLE, 'enc3', [
      { segments: profile },
      { segments: ['endpoints', 'azureOpenAI', 'groups', '0', 'models', 'gpt-4.1'] },
    ]);

    expect(removed!.overrides).toEqual({
      endpoints: { azureOpenAI: { groups: [{ group: 'g' }] } },
      fileConfig: dotted.fileConfig,
      $top: dotted.$top,
    });
    expect(removed!.configVersion).toBe(2);
    const stored = await raw().findOne({ principalId: 'enc3' });
    expect(stored!.overrides.endpoints).toEqual({ azureOpenAI: { groups: [{ group: 'g' }] } });
  });

  it('reads a legacy document without the marker verbatim, even keys that look encoded', async () => {
    await raw().insertOne({
      principalType: 'role',
      principalId: 'legacy',
      principalModel: 'Role',
      priority: 10,
      isActive: true,
      configVersion: 3,
      tombstones: [],
      overrides: { endpoints: { azureOpenAI: { 'gpt-4.1': true, 'literal%2Ekey': 1 } } },
    });

    const read = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'legacy');

    expect(read!.overrides).toEqual({
      endpoints: { azureOpenAI: { 'gpt-4.1': true, 'literal%2Ekey': 1 } },
    });
  });

  it('re-encodes a legacy document on its next write without changing its keys', async () => {
    const legacyOverrides = {
      endpoints: { azureOpenAI: { 'gpt-4.1': true, 'literal%2Ekey': 1 } },
      interface: { customWelcome: 'hi' },
    };
    await raw().insertOne({
      principalType: 'role',
      principalId: 'lazy',
      principalModel: 'Role',
      priority: 10,
      isActive: true,
      tombstones: [],
      overrides: legacyOverrides,
    });

    const written = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'lazy',
      PrincipalModel.ROLE,
      { 'interface.customWelcome': 'hello' },
    );

    expect(written.overrides).toEqual({
      ...legacyOverrides,
      interface: { customWelcome: 'hello' },
    });
    expect(written.configVersion).toBe(1);
    const stored = await raw().findOne({ principalId: 'lazy' });
    expect(stored!.keyEncoding).toBe(1);
    expect(stored!.overrides.endpoints.azureOpenAI).toEqual({
      'gpt-4%2E1': true,
      'literal%252Ekey': 1,
    });
    expect((await methods.findConfigByPrincipal(PrincipalType.ROLE, 'lazy'))!.overrides).toEqual(
      written.overrides,
    );
  });

  it('reads a plain key an outside writer added to an encoded document', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'outside',
      PrincipalModel.ROLE,
      dotted as never,
      10,
    );
    await raw().updateOne(
      { principalId: 'outside' },
      { $set: { 'overrides.interface.contextCost': true } },
    );

    const read = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'outside');

    expect(read!.overrides).toEqual({ ...dotted, interface: { contextCost: true } });
  });

  it('restores a deleted document with dotted keys, encoding them exactly once', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'snap',
      PrincipalModel.ROLE,
      dotted as never,
      10,
    );
    const deleted = await methods.deleteConfig(PrincipalType.ROLE, 'snap');

    expect(await methods.restoreConfig(deleted!)).toBe(true);

    expect((await methods.findConfigByPrincipal(PrincipalType.ROLE, 'snap'))!.overrides).toEqual(
      dotted,
    );
    const stored = await raw().findOne({ principalId: 'snap' });
    expect(stored!.keyEncoding).toBe(1);
    expect(stored!.overrides['%24top']).toEqual({ 'a%2Eb': '$value.stays' });
  });
});

describe('revision preconditions', () => {
  const revisionOf = (config: { _id: string; configVersion: number }) =>
    `${config._id}:${config.configVersion}`;

  async function seed(principalId: string) {
    return methods.patchConfigFields(PrincipalType.ROLE, principalId, PrincipalModel.ROLE, {
      'interface.customWelcome': 'v1',
    });
  }

  it('writes at the matching revision and bumps the version by one', async () => {
    const first = await seed('rev');

    const next = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'rev',
      PrincipalModel.ROLE,
      { 'interface.customWelcome': 'v2' },
      undefined,
      undefined,
      { expectedRevision: revisionOf(first) },
    );

    expect(next.configVersion).toBe(first.configVersion + 1);
    expect(next._id).toBe(first._id);
  });

  it('refuses a stale revision with a typed conflict and changes nothing', async () => {
    const first = await seed('stale');
    const second = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'stale',
      PrincipalModel.ROLE,
      {
        'interface.customWelcome': 'v2',
      },
    );

    await expect(
      methods.unsetConfigField(PrincipalType.ROLE, 'stale', 'interface.customWelcome', undefined, {
        expectedRevision: revisionOf(first),
      }),
    ).rejects.toMatchObject({
      code: 'CONFIG_VERSION_CONFLICT',
      currentRevision: revisionOf(second),
    });
    expect((await methods.findConfigByPrincipal(PrincipalType.ROLE, 'stale'))!.configVersion).toBe(
      2,
    );
  });

  it('never creates a document for a revision of one that does not exist', async () => {
    await expect(
      methods.tombstoneConfigField(
        PrincipalType.ROLE,
        'ghost',
        PrincipalModel.ROLE,
        'memory',
        10,
        undefined,
        {
          expectedRevision: `${new Types.ObjectId().toString()}:4`,
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFIG_VERSION_CONFLICT', currentRevision: null });
    expect(await raw().countDocuments({ principalId: 'ghost' })).toBe(0);
  });

  it("creates with 'absent' and then conflicts on a second create", async () => {
    const created = await methods.upsertConfig(
      PrincipalType.ROLE,
      'once',
      PrincipalModel.ROLE,
      {},
      10,
      undefined,
      {
        expectedRevision: 'absent',
      },
    );
    expect(created!.configVersion).toBe(1);

    await expect(
      methods.upsertConfig(
        PrincipalType.ROLE,
        'once',
        PrincipalModel.ROLE,
        { a: 1 } as never,
        10,
        undefined,
        {
          expectedRevision: 'absent',
        },
      ),
    ).rejects.toMatchObject({
      code: 'CONFIG_VERSION_CONFLICT',
      currentRevision: revisionOf(created!),
    });
  });

  it('matches a legacy document without configVersion at version 0', async () => {
    const { insertedId } = await raw().insertOne({
      principalType: 'role',
      principalId: 'old',
      principalModel: 'Role',
      priority: 10,
      isActive: true,
      overrides: { a: { b: 1 } },
    });
    const read = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'old');
    expect(revisionOf(read!)).toBe(`${insertedId.toString()}:0`);

    const written = await methods.unsetConfigField(PrincipalType.ROLE, 'old', 'a.b', undefined, {
      expectedRevision: `${insertedId.toString()}:0`,
    });

    expect(written!.configVersion).toBe(1);
    expect(written!.overrides).toEqual({});
  });

  it('lets exactly one of two concurrent conditioned patches win', async () => {
    const first = await seed('race');

    const results = await Promise.allSettled(
      ['a', 'b'].map((value) =>
        methods.patchConfigFields(
          PrincipalType.ROLE,
          'race',
          PrincipalModel.ROLE,
          { 'interface.customWelcome': value },
          undefined,
          undefined,
          { expectedRevision: revisionOf(first) },
        ),
      ),
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await methods.findConfigByPrincipal(PrincipalType.ROLE, 'race'))!.configVersion).toBe(
      2,
    );
  });

  it('keeps every concurrent unconditioned patch by re-reading on conflict', async () => {
    await seed('merge');

    await Promise.all(
      ['a', 'b', 'c'].map((key) =>
        methods.patchConfigFields(PrincipalType.ROLE, 'merge', PrincipalModel.ROLE, {
          [`speech.${key}`]: key,
        }),
      ),
    );

    const stored = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'merge');
    expect((stored!.overrides as Record<string, unknown>).speech).toEqual({
      a: 'a',
      b: 'b',
      c: 'c',
    });
    expect(stored!.configVersion).toBe(4);
  });

  it('refuses a revision of a deleted and recreated document (ABA)', async () => {
    const original = await seed('aba');
    await methods.deleteConfig(PrincipalType.ROLE, 'aba');
    await seed('aba');

    await expect(
      methods.patchConfigFields(
        PrincipalType.ROLE,
        'aba',
        PrincipalModel.ROLE,
        { 'a.b': 1 },
        10,
        undefined,
        {
          expectedRevision: revisionOf(original),
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFIG_VERSION_CONFLICT' });
  });

  it('deletes and toggles only at the expected revision; toggling bumps the version', async () => {
    const first = await seed('life');

    const toggled = await methods.toggleConfigActiveTracked(PrincipalType.ROLE, 'life', false, {
      expectedRevision: revisionOf(first),
    });
    expect(toggled).toMatchObject({ changed: true, config: { isActive: false, configVersion: 2 } });

    await expect(
      methods.deleteConfig(PrincipalType.ROLE, 'life', undefined, {
        expectedRevision: revisionOf(first),
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_VERSION_CONFLICT' });
    const deleted = await methods.deleteConfig(PrincipalType.ROLE, 'life', undefined, {
      expectedRevision: revisionOf(toggled!.config),
    });
    expect(deleted!._id).toBe(first._id);
  });
});

describe('pruning emptied parents', () => {
  const read = (principalId: string) =>
    methods.findConfigByPrincipal(PrincipalType.ROLE, principalId, { includeInactive: true });

  it('removes the parents a field reset leaves empty, keeping siblings', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'prune',
      PrincipalModel.ROLE,
      { balance: { startBalance: 5 }, interface: { a: 1, b: 2 } } as never,
      10,
    );

    await methods.unsetConfigField(PrincipalType.ROLE, 'prune', 'balance.startBalance');
    await methods.unsetConfigField(PrincipalType.ROLE, 'prune', 'interface.a');

    expect((await read('prune'))!.overrides).toEqual({ interface: { b: 2 } });
  });

  it('prunes inside an array element without nulling it', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      'arr',
      PrincipalModel.ROLE,
      { endpoints: { custom: [{ name: 'a', headers: { A: '1' } }] } } as never,
      10,
    );

    await methods.unsetConfigField(PrincipalType.ROLE, 'arr', 'endpoints.custom.0.headers.A');

    expect((await read('arr'))!.overrides).toEqual({ endpoints: { custom: [{ name: 'a' }] } });
    await expect(
      methods.unsetConfigField(PrincipalType.ROLE, 'arr', 'endpoints.custom.0'),
    ).rejects.toMatchObject({ code: 'CONFIG_PATH_INVALID', reason: 'array_element' });
    expect((await read('arr'))!.overrides).toEqual({ endpoints: { custom: [{ name: 'a' }] } });
  });

  it('keeps a sibling tombstone when its parent is pruned', async () => {
    await methods.patchConfigFields(PrincipalType.ROLE, 'tomb', PrincipalModel.ROLE, {
      'mcpServers.foo.title': 'Foo',
    });
    await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'tomb',
      PrincipalModel.ROLE,
      'mcpServers.github',
      10,
    );

    const result = await methods.unsetConfigField(PrincipalType.ROLE, 'tomb', 'mcpServers.foo');

    expect(result!.overrides).toEqual({});
    expect(result!.tombstones).toEqual(['mcpServers.github']);
  });

  it('prunes on tombstone and removes a secret with its preview in one write', async () => {
    const seeded = await methods.patchConfigFields(
      PrincipalType.ROLE,
      'secret',
      PrincipalModel.ROLE,
      {
        'ocr.apiKey': 'v3:cipher',
        'ocr.apiKeyPreview': '...abcd',
      },
    );

    const result = await methods.tombstoneConfigField(
      PrincipalType.ROLE,
      'secret',
      PrincipalModel.ROLE,
      ['ocr.apiKey', 'ocr.apiKeyPreview'],
    );

    expect(result.overrides).toEqual({});
    expect(result.tombstones).toEqual(['ocr.apiKey', 'ocr.apiKeyPreview']);
    expect(result.configVersion).toBe(seeded.configVersion + 1);
    expect(result.priority).toBe(seeded.priority);
  });

  it('treats a document holding only shells as empty for assign-only lifecycle calls', async () => {
    await raw().insertOne({
      principalType: 'role',
      principalId: 'shells',
      principalModel: 'Role',
      priority: 10,
      isActive: true,
      configVersion: 2,
      tombstones: [],
      overrides: { balance: {}, interface: { theme: {} } },
    });

    expect(
      await methods.toggleConfigActive(PrincipalType.ROLE, 'shells', false, undefined, {
        expectEmpty: true,
      }),
    ).toMatchObject({ isActive: false });
    expect(
      await methods.upsertConfig(
        PrincipalType.ROLE,
        'shells',
        PrincipalModel.ROLE,
        {},
        10,
        undefined,
        {
          expectEmpty: true,
          preservePriority: true,
        },
      ),
    ).toMatchObject({ isActive: true, overrides: {} });
    expect(
      await methods.deleteConfig(PrincipalType.ROLE, 'shells', undefined, { expectEmpty: true }),
    ).not.toBeNull();
  });
});
