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
  RestoreValidationError,
  canonicalizeResetPaths,
  createConfigMethods,
  ensureConfigIndexes,
} from './config';
import { BASE_CONFIG_PRINCIPAL_ID } from '~/admin/capabilities';
import configSchema from '~/schema/config';

function seedBaseConfig(overrides: IConfig['overrides'] = {}, priority = 0) {
  return mongoose.models.Config.create({
    principalType: PrincipalType.ROLE,
    principalId: BASE_CONFIG_PRINCIPAL_ID,
    principalModel: PrincipalModel.ROLE,
    overrides,
    priority,
    isActive: true,
    configVersion: 1,
  });
}

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

  it('lists finalized revisions only for the requested tenant and includes legacy base entries', async () => {
    const revisions = mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    await revisions.insertMany([
      {
        id: 'tenant-a-new',
        tenantId: 'tenant-a',
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        configVersion: 4,
        createdAt: '2026-09-04T04:00:00.000Z',
        cause: 'save',
        actorId: 'admin-a',
        actorEmail: 'a@example.com',
        status: 'final',
        overrides: { cache: true },
      },
      {
        id: 'tenant-a-legacy',
        tenantId: 'tenant-a',
        configVersion: 3,
        createdAt: '2026-09-04T03:00:00.000Z',
        cause: 'reset',
        actorId: 'admin-a',
        status: 'final',
        overrides: {},
      },
      {
        id: 'tenant-a-provisional',
        tenantId: 'tenant-a',
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        configVersion: 5,
        createdAt: '2026-09-04T05:00:00.000Z',
        cause: 'save',
        actorId: 'admin-a',
        status: 'provisional',
      },
      {
        id: 'tenant-b',
        tenantId: 'tenant-b',
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        configVersion: 99,
        createdAt: '2026-09-04T06:00:00.000Z',
        cause: 'save',
        actorId: 'admin-b',
        status: 'final',
      },
    ]);

    const listed = await methods.listConfigRevisions({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      tenantId: 'tenant-a',
    });

    expect(listed).toEqual([
      {
        id: 'tenant-a-new',
        createdAt: '2026-09-04T04:00:00.000Z',
        cause: 'save',
        actorId: 'admin-a',
        actorEmail: 'a@example.com',
      },
      {
        id: 'tenant-a-legacy',
        createdAt: '2026-09-04T03:00:00.000Z',
        cause: 'reset',
        actorId: 'admin-a',
      },
    ]);
  });

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
    await seedBaseConfig({ cache: true }, 0);

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
    await seedBaseConfig({ cache: false, registration: { socialLogins: ['local'] } }, 0);

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

  it('mutates a legacy document whose configVersion field is explicitly null', async () => {
    // Distinct from the missing-field case above: MongoDB's $inc rejects a
    // field whose current value is null (not just absent), so a save must
    // use $set with the precomputed next version rather than blindly $inc.
    await mongoose.models.Config.collection.insertOne({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: [],
      priority: 0,
      isActive: true,
      configVersion: null,
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

    expectChanged(result);
    expect(result.config?.configVersion).toBe(1);
    expect(result.config?.overrides).toEqual({ cache: true });
    expect(result.revision.configVersion).toBe(0);
  });

  it('returns the committed outcome when retention pruning fails', async () => {
    await seedBaseConfig({ cache: false }, 0);
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

  it('prunes by configVersion rather than createdAt when timestamps are severely skewed', async () => {
    // 50 prior saves already happened; the live document is at configVersion
    // 50 and there are exactly 50 final revisions on record (one per prior
    // save, recording that save's PRE-mutation version 1..50).
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      overrides: { cache: false },
      tombstones: [],
      priority: 0,
      isActive: true,
      configVersion: 50,
      tenantId: '',
    });

    const revisionsCollection = mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    const baseRevision = {
      cause: 'save' as const,
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: { cache: false },
      tombstones: [],
      priority: 0,
      isActive: true,
      absent: false,
      status: 'final' as const,
      committed: true,
    };
    // configVersion 1 is genuinely the oldest and must be the one pruned.
    // Give it the NEWEST-looking timestamp, and give a genuinely-recent
    // revision (25) the OLDEST-looking one — a createdAt-only sort would keep
    // 1 (looks newest) and wrongly delete 25 (looks oldest) instead.
    const createdAtFor = (configVersion: number): string => {
      if (configVersion === 1) {
        return '2099-01-01T00:00:00.000Z';
      }
      if (configVersion === 25) {
        return '2000-01-01T00:00:00.000Z';
      }
      return new Date(2020, 0, configVersion).toISOString();
    };
    await revisionsCollection.insertMany(
      Array.from({ length: 50 }, (_, index) => {
        const configVersion = index + 1;
        const createdAt = createdAtFor(configVersion);
        return {
          ...baseRevision,
          id: `55555555-5555-4555-8${String(configVersion).padStart(3, '0')}-000000000000`,
          createdAt,
          configVersion,
        };
      }),
    );

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 50,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });
    expectChanged(result);
    expect(result.revision.configVersion).toBe(50);

    const remaining = await revisionsCollection
      .find({}, { projection: { configVersion: 1 } })
      .toArray();
    const remainingVersions = remaining.map((doc) => doc.configVersion).sort((a, b) => a - b);
    expect(remainingVersions).toHaveLength(50);
    // configVersion 1 (the real oldest) was pruned despite its deceptive
    // timestamp; configVersion 25 (a real survivor) was kept despite its.
    expect(remainingVersions).not.toContain(1);
    expect(remainingVersions).toContain(25);
    expect(remainingVersions).toContain(50);
  });

  it('migrates the revision retention index instead of crashing startup when an older deployment created it with a different key spec', async () => {
    const revisionsCollection = mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION);
    await revisionsCollection.dropIndexes().catch(() => undefined);
    // Simulates a pre-upgrade deployment's index: same name, old (createdAt-only) key spec.
    await revisionsCollection.createIndex(
      { tenantId: 1, principalType: 1, principalId: 1, status: 1, createdAt: -1 },
      { name: 'scope_status_created', background: true },
    );

    await expect(ensureConfigIndexes(mongoose)).resolves.not.toThrow();

    const indexes = await revisionsCollection.indexes();
    const migrated = indexes.find((idx) => idx.name === 'scope_status_created');
    expect(migrated?.key).toEqual({
      tenantId: 1,
      principalType: 1,
      principalId: 1,
      status: 1,
      configVersion: -1,
      createdAt: -1,
    });
  });

  it('restores tombstones, priority, and isActive from a snapshot', async () => {
    await seedBaseConfig({ cache: false, registration: { socialLogins: ['local'] } }, 3);
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
    await seedBaseConfig({ cache: false }, 0);
    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      { $set: { isActive: false }, $inc: { configVersion: 1 } },
    );
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

  it('reactivates an inactive base config with CAS and snapshots the inactive predecessor', async () => {
    await seedBaseConfig({ cache: false }, 0);
    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      { $set: { isActive: false }, $inc: { configVersion: 1 } },
    );

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'active', isActive: true },
      cause: 'save',
      actor,
    });

    expectChanged(result);
    expect(result.config?.isActive).toBe(true);
    expect(result.config?.configVersion).toBe(3);
    expect(result.config?.overrides).toEqual({ cache: false });
    expect(result.revision.isActive).toBe(false);
    expect(result.revision.configVersion).toBe(2);
  });

  it('strips forbidden interface permission overrides when restoring a snapshot', async () => {
    await seedBaseConfig({ cache: false, interface: { modelSelect: true } }, 0);

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

  it('aborts a restore when validateRestoredOverrides rejects the stored content, writing no revision', async () => {
    // A legacy revision recorded before a policy existed — e.g. a
    // process-backed MCP server, since forbidden — must not be
    // reintroducible via restore just because it predates the check.
    const revisionId = '33333333-3333-4333-8333-333333333333';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'import',
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: { mcpServers: { filesystem: { type: 'stdio' } } },
      tombstones: [],
      priority: 0,
      isActive: true,
      absent: false,
      configVersion: 1,
      status: 'final',
      committed: true,
    });

    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: null,
        op: { kind: 'restore', revisionId },
        cause: 'restore',
        actor,
        validateRestoredOverrides: (overrides) =>
          'mcpServers' in overrides ? 'Process-backed MCP servers are forbidden' : null,
      }),
    ).rejects.toThrow(RestoreValidationError);

    expect(
      await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).countDocuments({
        id: { $ne: revisionId },
      }),
    ).toBe(0);
    expect(
      await mongoose.models.Config.countDocuments({ principalId: BASE_CONFIG_PRINCIPAL_ID }),
    ).toBe(0);
  });

  it('restores normally when validateRestoredOverrides accepts the stored content', async () => {
    const revisionId = '44444444-4444-4444-8444-444444444444';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'import',
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
      status: 'final',
      committed: true,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'restore', revisionId },
      cause: 'restore',
      actor,
      validateRestoredOverrides: () => null,
    });

    expectChanged(result);
    expect(result.config?.overrides).toEqual({ cache: true });
  });

  it('preserves current tombstones, priority, and isActive when restoring a legacy overrides-only revision', async () => {
    await seedBaseConfig({ cache: false }, 7);
    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      {
        $set: { tombstones: ['registration.enabled'], isActive: false },
        $inc: { configVersion: 2 },
      },
    );
    const current = await mongoose.models.Config.findOne({
      principalId: BASE_CONFIG_PRINCIPAL_ID,
    });
    expect(current?.tombstones).toEqual(['registration.enabled']);
    expect(current?.priority).toBe(7);
    expect(current?.isActive).toBe(false);

    // A revision written by the pre-atomic-mutate panel: only `overrides` was
    // ever recorded. tombstones/priority/isActive/absent are genuinely absent
    // from the document, not present-but-falsy.
    const revisionId = '33333333-3333-4333-8333-333333333333';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'save',
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      overrides: { cache: true },
      status: 'final',
      committed: true,
    });

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: current?.configVersion ?? null,
      op: { kind: 'restore', revisionId },
      cause: 'restore',
      actor,
    });
    expectChanged(result);

    expect(result.config?.overrides).toEqual({ cache: true });
    // Unrecorded by the legacy revision — must carry over from the live
    // document rather than being wiped to a fixed default.
    expect(result.config?.tombstones).toEqual(['registration.enabled']);
    expect(result.config?.priority).toBe(7);
    expect(result.config?.isActive).toBe(false);
  });

  /** Deterministic stand-in for the API layer's real secret encryption — encrypts a
   * plaintext `<section>.<key>`, leaves an already-"encrypted" one untouched. */
  const encryptLegacySecret =
    (section: string, key: string) =>
    (overrides: Record<string, unknown>): Record<string, unknown> => {
      const container = overrides[section];
      if (container == null || typeof container !== 'object' || Array.isArray(container)) {
        return overrides;
      }
      const record = container as Record<string, unknown>;
      const value = record[key];
      if (typeof value !== 'string' || value.startsWith('enc:')) {
        return overrides;
      }
      return { ...overrides, [section]: { ...record, [key]: `enc:${value}` } };
    };

  it('encrypts a preserved legacy plaintext secret through mutation and revision restore', async () => {
    await seedBaseConfig({ langfuse: { secretKey: 'plaintext-legacy-secret' } }, 0);

    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
      normalizeSecrets: encryptLegacySecret('langfuse', 'secretKey'),
    });
    expectChanged(result);

    // The snapshot captures the PRE-mutation state (langfuse untouched by this
    // save) — it must still never carry the plaintext secret forward.
    expect(result.revision.overrides).toEqual(
      expect.objectContaining({ langfuse: { secretKey: 'enc:plaintext-legacy-secret' } }),
    );
    const storedRevision = await mongoose.connection
      .collection(ADMIN_CONFIG_REVISIONS_COLLECTION)
      .findOne({ id: result.revision.id });
    expect(storedRevision?.overrides.langfuse.secretKey).toBe('enc:plaintext-legacy-secret');

    expect(result.config?.overrides).toEqual(
      expect.objectContaining({ langfuse: { secretKey: 'enc:plaintext-legacy-secret' } }),
    );
    const restored = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: result.config?.configVersion ?? null,
      op: { kind: 'restore', revisionId: result.revision.id },
      cause: 'restore',
      actor,
      normalizeSecrets: encryptLegacySecret('langfuse', 'secretKey'),
    });
    expectChanged(restored);
    expect(restored.config?.overrides).toEqual({
      langfuse: { secretKey: 'enc:plaintext-legacy-secret' },
    });
    expect(JSON.stringify(restored)).not.toContain('"secretKey":"plaintext-legacy-secret"');
  });

  it('encrypts a legacy plaintext secret when restoring an older revision', async () => {
    // `ocr.apiKey` (unlike `langfuse`, a base-principal-only section pinned to
    // the live document) is an ordinary replace-mode field, so restore can
    // actually set it — isolating this assertion to secret normalization.
    await seedBaseConfig({ cache: false }, 0);

    const revisionId = '22222222-2222-4222-8222-222222222222';
    await mongoose.connection.collection(ADMIN_CONFIG_REVISIONS_COLLECTION).insertOne({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cause: 'save',
      actorId: actor.actorId,
      tenantId: '',
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      // Simulates a revision persisted before secret normalization existed.
      overrides: { ocr: { apiKey: 'plaintext-legacy-secret' } },
      tombstones: [],
      priority: 0,
      isActive: true,
      absent: false,
      configVersion: 1,
      status: 'final',
      committed: true,
    });

    const restored = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'restore', revisionId },
      cause: 'restore',
      actor,
      normalizeSecrets: encryptLegacySecret('ocr', 'apiKey'),
    });
    expectChanged(restored);

    expect(restored.config?.overrides).toEqual({
      ocr: { apiKey: 'enc:plaintext-legacy-secret' },
    });
    const stored = await mongoose.models.Config.findOne({ principalId: BASE_CONFIG_PRINCIPAL_ID });
    expect((stored?.overrides as Record<string, unknown>).ocr).toEqual({
      apiKey: 'enc:plaintext-legacy-secret',
    });
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

  it('rejects a stale expectedVersion:null across a full absent -> create -> delete -> stale-null cycle (ABA)', async () => {
    // Admin A reads absence here and holds onto expectedVersion: null while
    // Admin B creates and then deletes the config without Admin A observing
    // either change.
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

    // A delete never removes the document once one has ever existed — it's a
    // versioned, empty replace — specifically so this stale-null mutation
    // (Admin A, still believing the config is absent) is rejected instead of
    // silently succeeding against a document it never observed.
    await expect(
      methods.mutateConfigWithRevision({
        principalType: PrincipalType.ROLE,
        principalId: BASE_CONFIG_PRINCIPAL_ID,
        principalModel: PrincipalModel.ROLE,
        expectedVersion: null,
        op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
        cause: 'save',
        actor,
      }),
    ).rejects.toBeInstanceOf(ConfigVersionConflictError);

    const afterStaleAttempt = await mongoose.models.Config.findOne({
      principalId: BASE_CONFIG_PRINCIPAL_ID,
    });
    expect(afterStaleAttempt?.configVersion).toBe(2);
    expect(afterStaleAttempt?.overrides).toEqual({});
    expect(afterStaleAttempt?.isActive).toBe(true);

    // A caller that actually observed the deleted (v2) state can correctly
    // proceed with the real version.
    const recreated = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(recreated.changed).toBe(true);
    expect(recreated.config?.configVersion).toBe(3);
    expect(recreated.config?.overrides).toEqual({ cache: false });
    expect(recreated.config?.isActive).toBe(true);
    const applicable = await methods.getApplicableConfigs([]);
    expect(applicable).toHaveLength(1);
    expect(applicable[0].overrides).toEqual({ cache: false });

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
    expect(doc?.configVersion).toBe(3);
    expect(doc?.overrides).toEqual({ cache: false });
  });

  it('keeps the epoch monotonic after an out-of-band base document removal', async () => {
    await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });

    const updated = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'fields', resetPaths: [], fields: { cache: false }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(updated.config?.configVersion).toBe(2);

    await mongoose.models.Config.deleteOne({ principalId: BASE_CONFIG_PRINCIPAL_ID });

    const afterRemoval = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: { kind: 'fields', resetPaths: [], fields: { cache: true }, priority: 0 },
      cause: 'save',
      actor,
    });
    expect(afterRemoval.config?.configVersion).toBe(3);

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

  it('keeps a reset active so a later replacement remains applicable', async () => {
    await seedBaseConfig({ cache: true }, 0);

    const reset = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 1,
      op: { kind: 'delete' },
      cause: 'reset',
      actor,
    });
    expect(reset.config?.isActive).toBe(true);
    expect(reset.config?.overrides).toEqual({});

    const imported = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: 2,
      op: { kind: 'replace', overrides: { cache: false }, priority: 0 },
      cause: 'import',
      actor,
    });
    expect(imported.config?.isActive).toBe(true);

    const applicable = await methods.getApplicableConfigs([]);
    expect(applicable).toHaveLength(1);
    expect(applicable[0].overrides).toEqual({ cache: false });
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
    await seedBaseConfig({ cache: true, langfuse: { publicKey: 'pk-current' } }, 0);

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

  it('discards a fields-mode langfuse write by default, matching the reset/restore/replace protections', async () => {
    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: { 'langfuse.enabled': true, 'langfuse.publicKey': 'pk-new' },
        priority: 0,
      },
      cause: 'save',
      actor,
    });

    expectChanged(result);
    // A generic fields-mode write must never be able to smuggle a langfuse
    // change through — only a caller with an explicit trusted opt-in can
    // (see the next test).
    expect(result.config?.overrides).toEqual({});
  });

  it('persists a fields-mode langfuse write when the caller passes trustedBasePrincipalSections', async () => {
    const result = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: { 'langfuse.enabled': true, 'langfuse.publicKey': 'pk-new' },
        priority: 0,
      },
      cause: 'save',
      actor,
      trustedBasePrincipalSections: ['langfuse'],
    });

    expectChanged(result);
    expect(result.config?.overrides).toEqual({
      langfuse: { enabled: true, publicKey: 'pk-new' },
    });
  });

  it('reverts an untrusted update back to the existing langfuse value instead of persisting a smuggled one', async () => {
    const created = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: null,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: { 'langfuse.enabled': true, 'langfuse.publicKey': 'pk-old' },
        priority: 0,
      },
      cause: 'save',
      actor,
      trustedBasePrincipalSections: ['langfuse'],
    });
    expectChanged(created);

    const untrusted = await methods.mutateConfigWithRevision({
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      principalModel: PrincipalModel.ROLE,
      expectedVersion: created.config?.configVersion ?? null,
      op: {
        kind: 'fields',
        resetPaths: [],
        fields: { cache: true, 'langfuse.publicKey': 'pk-smuggled' },
        priority: 0,
      },
      cause: 'save',
      actor,
    });

    expectChanged(untrusted);
    // The ordinary field (cache) persists normally; the smuggled langfuse
    // change is silently reverted to what was already there.
    expect(untrusted.config?.overrides).toEqual({
      cache: true,
      langfuse: { enabled: true, publicKey: 'pk-old' },
    });
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
    await seedBaseConfig({ cache: false, langfuse: { publicKey: 'pk-current' } }, 0);

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
    await seedBaseConfig({ cache: false }, 0);

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
    await seedBaseConfig({ cache: false }, 0);

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
    await seedBaseConfig({ cache: false }, 0);
    await mongoose.models.Config.updateOne(
      { principalId: BASE_CONFIG_PRINCIPAL_ID },
      { $set: { isActive: false }, $inc: { configVersion: 1 } },
    );

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
