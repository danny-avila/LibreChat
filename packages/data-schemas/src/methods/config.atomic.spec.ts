import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { ConfigMutationResult, ConfigRevisionSnapshot } from './config';
import type { IConfig } from '~/types';
import {
  ADMIN_CONFIG_REVISIONS_COLLECTION,
  ADMIN_CONFIG_VERSION_EPOCHS_COLLECTION,
  ConfigVersionConflictError,
  ConfigRevisionNotFoundError,
  canonicalizeResetPaths,
  createConfigMethods,
} from './config';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import configSchema from '~/schema/config';

function expectChanged(result: ConfigMutationResult): asserts result is {
  changed: true;
  config: NonNullable<ConfigMutationResult['config']> | null;
  revision: ConfigRevisionSnapshot;
} {
  expect(result.changed).toBe(true);
  expect(result.revision).not.toBeNull();
}

describe('canonicalizeResetPaths', () => {
  it('deduplicates and keeps the highest ancestor', () => {
    expect(
      canonicalizeResetPaths(['registration', 'registration.enabled', 'registration.enabled']),
    ).toEqual(['registration']);
  });

  it('rejects a single deeply nested path before ancestor checks', () => {
    const deep = Array.from({ length: 33 }, (_, index) => `seg${index}`).join('.');
    expect(() => canonicalizeResetPaths([deep])).toThrow(/maximum depth of 32 segments/);
  });

  it('rejects unsafe reset paths', () => {
    expect(() => canonicalizeResetPaths(['__proto__.polluted'])).toThrow(/forbidden segment/);
  });
});

describe('mutateConfigWithRevision', () => {
  let replSet: MongoMemoryReplSet;
  let methods: ReturnType<typeof createConfigMethods>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    const Config = mongoose.models.Config ?? mongoose.model<IConfig>('Config', configSchema);
    await Config.syncIndexes();
    methods = createConfigMethods(mongoose);
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
  });

  beforeEach(async () => {
    await mongoose.models.Config.deleteMany({});
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).deleteMany({});
    await mongoose.connection.collection(ADMIN_CONFIG_VERSION_EPOCHS_COLLECTION).deleteMany({});
  });

  const actor = { actorId: 'admin-1', actorEmail: 'admin@test', tenantId: '' };

  it('rejects unsafe field paths without writing a revision', async () => {
    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: null,
        op: {
          kind: 'fields',
          resetPaths: [],
          fields: { '__proto__.polluted': true },
          priority: 0,
        },
        cause: 'save',
        actor,
      }),
    ).rejects.toThrow(/forbidden segment/);

    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments(),
    ).toBe(0);
    expect(
      await mongoose.models.Config.countDocuments({ principalId: BASE_CONFIG_PRINCIPAL_ID }),
    ).toBe(0);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('rejects a stale expectedVersion without writing a revision', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: true },
      0,
    );

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 0,
        op: { kind: 'fields', resetPaths: ['cache'], fields: {}, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError);

    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments(),
    ).toBe(0);
    const doc = await mongoose.models.Config.findOne({ principalId: BASE_CONFIG_PRINCIPAL_ID });
    expect(doc?.configVersion).toBe(1);
    expect(doc?.overrides).toEqual({ cache: true });
  });

  it('applies reset and set in one transaction and inserts a finalized revision', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false, registration: { socialLogins: ['local'] } },
      0,
    );

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: {
        kind: 'fields',
        resetPaths: ['registration'],
        fields: { cache: true },
        priority: 0,
      },
      cause: 'save',
      actor,
    });

    expectChanged(result);
    expect(result.revision.status).toBe('final');
    expect(result.revision.committed).toBe(true);
    expect(result.revision.configVersion).toBe(1);
    expect(result.revision.overrides).toEqual({
      cache: false,
      registration: { socialLogins: ['local'] },
    });
    expect(result.config?.configVersion).toBe(2);
    expect(result.config?.overrides).toEqual({ cache: true });

    const stored = await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).findOne({
      id: result.revision.id,
    });
    expect(stored?.status).toBe('final');
    expect(stored?.expiresAt).toBeUndefined();
    expect(stored?.principalType).toBe(PrincipalType.ROLE);
    expect(stored?.principalId).toBe(BASE_CONFIG_PRINCIPAL_ID);
    expect(stored?.tombstones).toEqual([]);
    expect(stored?.priority).toBe(0);
    expect(stored?.isActive).toBe(true);
  });

  it('rejects non-base principals without writing', async () => {
    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.GROUP,
        principalId: 'group-1',
        principalModel: PrincipalModel.GROUP,
        expectedVersion: null,
        op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toThrow(/base configuration/);
    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments(),
    ).toBe(0);
  });

  it('mutates a legacy document whose configVersion field is missing', async () => {
    await mongoose.models.Config.collection.insertOne({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: ['registration.enabled'],
      priority: 0,
      isActive: true,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 0,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    expect(result.config?.configVersion).toBe(1);
    expect(result.config?.overrides).toEqual({ cache: true });
    expectChanged(result);
    expect(result.revision.configVersion).toBe(0);
    expect(result.revision.tombstones).toEqual(['registration.enabled']);
  });

  it('returns the committed outcome when retention pruning fails', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );
    const coll = mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    const originalFind = coll.find.bind(coll);
    coll.find = (() => {
      throw new Error('prune failed');
    }) as typeof coll.find;

    try {
      const result = await methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
        cause: 'save',
        actor,
      });
      expect(result.config?.overrides).toEqual({ cache: true });
      expectChanged(result);
      expect(result.revision.status).toBe('final');
    } finally {
      coll.find = originalFind;
    }
  });

  it('restores tombstones, priority, and isActive from a snapshot', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false, registration: { socialLogins: ['local'] } },
      3,
    );
    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      { $set: { tombstones: ['mcpServers.github'], isActive: true } },
    );

    const first = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: {
        kind: 'fields',
        resetPaths: ['registration'],
        fields: { cache: true },
        priority: 0,
      },
      cause: 'save',
      actor,
    });
    expectChanged(first);
    expect(first.revision.tombstones).toEqual(['mcpServers.github']);
    expect(first.revision.priority).toBe(3);

    const restored = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'restore', revisionId: first.revision.id },
      cause: 'restore',
      actor,
    });

    expect(restored.config?.overrides).toEqual({
      cache: false,
      registration: { socialLogins: ['local'] },
    });
    expect(restored.config?.tombstones).toEqual(['mcpServers.github']);
    expect(restored.config?.priority).toBe(3);
  });

  it('preserves isActive on field saves for an inactive document', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );
    await methods.toggleConfigActive(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID, false);
    const inactive = await mongoose.models.Config.findOne({
      principalId: BASE_CONFIG_PRINCIPAL_ID,
    });
    expect(inactive?.isActive).toBe(false);
    expect(inactive?.configVersion).toBe(2);

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    expect(result.config?.isActive).toBe(false);
    expect(result.config?.overrides).toEqual({ cache: true });
  });

  it('strips forbidden interface permission overrides when restoring a snapshot', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false, interface: { modelSelect: true } },
      0,
    );

    const revisionId = '11111111-1111-4111-8111-111111111111';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'import',
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: {
        cache: true,
        interface: { prompts: false, modelSelect: false },
        interfaceConfig: { prompts: false },
      },
      tombstones: ['interface', 'interfaceConfig.prompts', 'cache'],
      priority: 0,
      isActive: true,
      absent: false,
      configVersion: 1,
      status: 'final',
      committed: true,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'restore', revisionId },
      cause: 'restore',
      actor,
    });

    expect(result.config?.overrides).toEqual({
      cache: true,
      interface: { modelSelect: false },
    });
    expect(result.config?.tombstones).toEqual(['cache']);
  });

  it('strips forbidden tombstones preserved by replace mutations', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: ['interface.prompts', 'cache'],
      priority: 0,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'replace', overrides: { cache: true }, priority: 0 },
      cause: 'import',
      actor,
    });

    expect(result.config?.overrides).toEqual({ cache: true });
    expect(result.config?.tombstones).toEqual(['cache']);
  });

  it('sanitizes legacy protected tombstones during field mutations', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: ['interface', 'interfaceConfig.prompts', 'cache'],
      priority: 0,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    expect(result.config?.overrides).toEqual({ cache: true });
    expect(result.config?.tombstones).toEqual([]);
  });

  it('sanitizes legacy unsafe overrides during field mutations', async () => {
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: {
        cache: false,
        interfaceConfig: { prompts: false },
        interface: null,
      },
      tombstones: [],
      priority: 0,
      isActive: true,
      configVersion: 1,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    expect(result.config?.overrides).toEqual({ cache: true });
  });

  it('does not create a config document for reset-only mutation against an absent base', async () => {
    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: ['cache'], fields: {}, priority: 0 },
      cause: 'reset',
      actor,
    });

    expect(result).toEqual({ changed: false, config: null, revision: null });
    expect(
      await mongoose.models.Config.countDocuments({ principalId: BASE_CONFIG_PRINCIPAL_ID }),
    ).toBe(0);
    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments(),
    ).toBe(0);
  });

  it('rejects stale expectedVersion after delete/recreate (ABA)', async () => {
    const created = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(created.changed).toBe(true);
    expect(created.config?.configVersion).toBe(1);

    await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'delete' },
      cause: 'reset',
      actor,
    });

    const recreated = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(recreated.changed).toBe(true);
    expect(recreated.config?.configVersion).toBe(2);
    expect(recreated.config?.overrides).toEqual({ cache: false });

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError);

    const doc = await mongoose.models.Config.findOne({ principalId: BASE_CONFIG_PRINCIPAL_ID });
    expect(doc?.configVersion).toBe(2);
    expect(doc?.overrides).toEqual({ cache: false });
  });

  it('keeps the epoch monotonic when legacy writers update and delete the base config', async () => {
    await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    const legacyUpdated = await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );
    expect(legacyUpdated?.configVersion).toBe(2);

    await methods.deleteConfig(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID);

    const legacyRecreated = await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: true },
      0,
    );
    expect(legacyRecreated?.configVersion).toBe(3);

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError);

    const recreated = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 3,
      op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(recreated.changed).toBe(true);
    expect(recreated.config?.configVersion).toBe(4);

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 2,
        op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError);
  });

  it('treats delete of an already absent base config as a no-op', async () => {
    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'delete' },
      cause: 'reset',
      actor,
    });

    expect(result).toEqual({ changed: false, config: null, revision: null });
    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments(),
    ).toBe(0);
  });

  it('preserves dedicated base-principal sections when resetting to defaults', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: true, langfuse: { publicKey: 'pk-current' } },
      0,
    );

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'delete' },
      cause: 'reset',
      actor,
    });

    expectChanged(result);
    expect(result.config?.overrides).toEqual({ langfuse: { publicKey: 'pk-current' } });
    expect(result.revision.overrides).toEqual({
      cache: true,
      langfuse: { publicKey: 'pk-current' },
    });
  });

  it('preserves dedicated base-principal sections when restoring an absent snapshot', async () => {
    const initial = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });
    expectChanged(initial);
    expect(initial.revision.absent).toBe(true);

    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      { $set: { 'overrides.langfuse': { publicKey: 'pk-current' } }, $inc: { configVersion: 1 } },
    );

    const restored = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'restore', revisionId: initial.revision.id },
      cause: 'restore',
      actor,
    });

    expectChanged(restored);
    expect(restored.config?.overrides).toEqual({ langfuse: { publicKey: 'pk-current' } });
  });

  it('sanitizes unauthorized descendants on container field assignments', async () => {
    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: {
          'interface.mcpServers.trustCheckbox': {
            label: 'Allowed',
            use: true,
            arbitrary: 'kept',
          },
        },
        priority: 0,
      },
      cause: 'save',
      actor,
    });

    expect(result.config?.overrides).toEqual({
      interface: {
        mcpServers: {
          trustCheckbox: {
            label: 'Allowed',
          },
        },
      },
    });

    const existing = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: {
          'interface.mcpServers.trustCheckbox': {
            label: 'Updated',
            use: false,
            arbitrary: 'again',
          },
        },
        priority: 0,
      },
      cause: 'save',
      actor,
    });

    expect(existing.config?.overrides).toEqual({
      interface: {
        mcpServers: {
          trustCheckbox: {
            label: 'Updated',
          },
        },
      },
    });
  });

  it('strips non-object interface and internal aliases during replace/import', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false, langfuse: { publicKey: 'pk-current' } },
      0,
    );

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: {
        kind: 'replace',
        overrides: {
          cache: true,
          interface: null,
          interfaceConfig: { prompts: false },
        },
        priority: 0,
      },
      cause: 'import',
      actor,
    });

    expect(result.config?.overrides).toEqual({
      cache: true,
      langfuse: { publicKey: 'pk-current' },
    });
  });

  it('rejects restore of provisional revisions', async () => {
    const revisionId = '22222222-2222-4222-8222-222222222222';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'save',
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: { cache: true },
      tombstones: [],
      priority: 0,
      isActive: true,
      absent: false,
      configVersion: 1,
      status: 'provisional',
      committed: false,
    });
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'restore', revisionId },
        cause: 'restore',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigRevisionNotFoundError);
  });

  it('treats cross-tenant revisions as not found', async () => {
    const revisionId = '33333333-3333-4333-8333-333333333333';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'save',
      actorId: actor.actorId,
      tenantId: 'other-tenant',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: { cache: true },
      tombstones: [],
      priority: 0,
      isActive: true,
      absent: false,
      configVersion: 1,
      status: 'final',
      committed: true,
    });
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'restore', revisionId },
        cause: 'restore',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigRevisionNotFoundError);
  });

  it('returns 409 when restore races a concurrent toggle', async () => {
    const Config = mongoose.models.Config;
    await Config.deleteMany({});
    await Config.create({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: [],
      priority: 0,
      isActive: true,
      configVersion: 7,
    });

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: 1,
        op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toMatchObject({
      name: 'ConfigVersionConflictError',
      currentVersion: 7,
    });
  });

  it('replace import preserves inactive base config', async () => {
    await methods.upsertConfig(
      PrincipalType.ROLE,
      BASE_CONFIG_PRINCIPAL_ID,
      PrincipalModel.ROLE,
      { cache: false },
      0,
    );
    await methods.toggleConfigActive(PrincipalType.ROLE, BASE_CONFIG_PRINCIPAL_ID, false);

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: {
        kind: 'replace',
        overrides: { cache: true },
        priority: 0,
      },
      cause: 'import',
      actor,
    });

    expect(result.config?.isActive).toBe(false);
  });
});
