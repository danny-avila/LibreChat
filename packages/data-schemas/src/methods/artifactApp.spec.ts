import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalModel, PrincipalType, ResourceType } from 'librechat-data-provider';
import type { IAclEntry, IArtifactApp, IArtifactVersion, CreateArtifactAppInput } from '~/types';
import {
  ArtifactAppDeletedError,
  createArtifactAppMethods,
  computeSourceHash,
  type ArtifactAppMethods,
} from './artifactApp';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let ArtifactApp: mongoose.Model<IArtifactApp>;
let ArtifactVersion: mongoose.Model<IArtifactVersion>;
let AclEntry: mongoose.Model<IAclEntry>;
let modelsToCleanup: string[] = [];
let methods: ArtifactAppMethods;

function baseInput(overrides: Partial<CreateArtifactAppInput> = {}): CreateArtifactAppInput {
  return {
    createdBy: 'user-1',
    title: 'My Chart',
    visibility: 'private',
    version: {
      artifactType: 'react',
      sourceSnapshot: 'export default () => <div>hi</div>;',
      createdBy: 'user-1',
    },
    ...overrides,
  };
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  ArtifactApp = mongoose.models.ArtifactApp as mongoose.Model<IArtifactApp>;
  ArtifactVersion = mongoose.models.ArtifactVersion as mongoose.Model<IArtifactVersion>;
  AclEntry = mongoose.models.AclEntry as mongoose.Model<IAclEntry>;
  methods = createArtifactAppMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
  await Promise.all([ArtifactApp.syncIndexes(), ArtifactVersion.syncIndexes()]);
}, 30000);

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete (mongoose.models as Record<string, unknown>)[modelName];
    }
  }
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await ArtifactApp.deleteMany({});
  await ArtifactVersion.deleteMany({});
  await AclEntry.deleteMany({});
});

describe('createArtifactAppWithVersion', () => {
  test('atomically creates app and version 1 with activeVersionId set', async () => {
    const { app, version } = await methods.createArtifactAppWithVersion(baseInput());

    expect(app.artifactAppId).toMatch(/^app_/);
    expect(app.status).toBe('draft');
    expect(app.latestVersionNumber).toBe(1);
    expect(version.versionNumber).toBe(1);
    expect(version.artifactVersionId).toMatch(/^ver_/);
    expect(app.activeVersionId).toBe(version.artifactVersionId);

    const persistedVersions = await ArtifactVersion.find({ artifactAppId: app.artifactAppId });
    expect(persistedVersions).toHaveLength(1);
  });

  test('computes a deterministic SHA-256 integrity hash over the snapshot', async () => {
    const input = baseInput();
    const { version } = await methods.createArtifactAppWithVersion(input);
    const expected = computeSourceHash(
      input.version.artifactType,
      input.version.sourceSnapshot,
      input.version.runtimeConfig ?? {},
    );
    expect(version.integrity.sourceHash).toBe(expected);
    expect(version.integrity.schemaVersion).toBe(1);
  });

  test('snapshot is independent — later app edits do not mutate the version source', async () => {
    const { app, version } = await methods.createArtifactAppWithVersion(baseInput());
    const originalSource = version.sourceSnapshot;

    await methods.updateArtifactApp(
      { artifactAppId: app.artifactAppId },
      { title: 'Renamed', description: 'new' },
    );

    const reread = await methods.getArtifactVersion({
      artifactAppId: app.artifactAppId,
      versionNumber: 1,
    });
    expect(reread?.sourceSnapshot).toBe(originalSource);
  });
});

describe('syncArtifactAppWithVersion', () => {
  const sourceMetadata = {
    conversationId: 'conversation-1',
    messageId: 'message-1',
    originalArtifactId: 'render-id-1',
    sourceKey: 'artifact:v1:identifier:revenue-chart',
  };

  test('is idempotent when the source snapshot has not changed', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    const second = await methods.syncArtifactAppWithVersion({
      ...input,
      sourceMetadata: {
        ...sourceMetadata,
        messageId: 'message-2',
        originalArtifactId: 'render-id-2',
      },
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.versionCreated).toBe(false);
    expect(second.app.artifactAppId).toBe(first.app.artifactAppId);
    expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(
      1,
    );
  });

  test('adopts typed identifier source keys created by the previous implementation', async () => {
    const legacy = await methods.createArtifactAppWithVersion(
      baseInput({
        sourceMetadata: {
          ...sourceMetadata,
          sourceKey: 'identifier:revenue-chart:application/vnd.react',
        },
      }),
    );

    const synced = await methods.syncArtifactAppWithVersion(baseInput({ sourceMetadata }));
    const persisted = await ArtifactApp.findOne({ artifactAppId: legacy.app.artifactAppId }).lean();

    expect(synced.app.artifactAppId).toBe(legacy.app.artifactAppId);
    expect(synced.created).toBe(false);
    expect(await ArtifactApp.countDocuments({})).toBe(1);
    expect(persisted?.sourceMetadata?.sourceKey).toBe('artifact:v1:identifier:revenue-chart');
  });

  test('consolidates every legacy MIME identity around one deterministic survivor', async () => {
    const legacyKeys = [
      'identifier:revenue-chart',
      'identifier:revenue-chart:text/html',
      'identifier:revenue-chart:application/vnd.react',
    ];
    const legacyApps = [];
    for (const [index, sourceKey] of legacyKeys.entries()) {
      const created = await methods.createArtifactAppWithVersion(
        baseInput({
          title: `Legacy ${index}`,
          sourceMetadata: { ...sourceMetadata, sourceKey },
        }),
      );
      legacyApps.push(created.app);
    }
    const sharedUserId = new mongoose.Types.ObjectId();
    await AclEntry.create([
      {
        principalType: PrincipalType.USER,
        principalId: sharedUserId,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.ARTIFACT_APP,
        resourceId: legacyApps[0].id,
        permBits: 1,
      },
      {
        principalType: PrincipalType.USER,
        principalId: sharedUserId,
        principalModel: PrincipalModel.USER,
        resourceType: ResourceType.ARTIFACT_APP,
        resourceId: legacyApps[1].id,
        permBits: 2,
      },
    ]);
    await ArtifactApp.updateOne(
      { artifactAppId: legacyApps[0].artifactAppId },
      { $set: { status: 'archived', 'marketplace.listed': false } },
    );

    const synced = await methods.syncArtifactAppWithVersion(baseInput({ sourceMetadata }));
    const active = await ArtifactApp.find({ status: { $ne: 'archived' } }).lean();
    const archived = await ArtifactApp.find({ status: 'archived' }).lean();

    expect(synced.app.artifactAppId).toBe(legacyApps[2].artifactAppId);
    expect(active).toHaveLength(1);
    expect(active[0]?.sourceMetadata?.sourceKey).toBe(sourceMetadata.sourceKey);
    expect(archived).toHaveLength(2);
    expect(await ArtifactVersion.countDocuments({})).toBe(3);
    expect(await ArtifactVersion.countDocuments({ artifactAppId: synced.app.artifactAppId })).toBe(
      3,
    );
    expect(
      await ArtifactVersion.countDocuments({
        artifactAppId: { $in: legacyApps.slice(0, 2).map(({ artifactAppId }) => artifactAppId) },
      }),
    ).toBe(0);
    expect(synced.app.latestVersionNumber).toBe(3);
    expect(
      await AclEntry.findOne({
        resourceId: synced.app.id,
        principalId: sharedUserId,
      }).lean(),
    ).toMatchObject({ permBits: 3 });
    expect(
      await AclEntry.countDocuments({
        resourceId: { $in: legacyApps.slice(0, 2).map(({ id }) => id) },
      }),
    ).toBe(0);
  });

  test('maps an older client key onto an existing versioned identity', async () => {
    const first = await methods.syncArtifactAppWithVersion(baseInput({ sourceMetadata }));
    const legacy = await methods.syncArtifactAppWithVersion(
      baseInput({
        sourceMetadata: {
          ...sourceMetadata,
          sourceKey: 'identifier:revenue-chart:application/vnd.react',
        },
      }),
    );
    const consolidated = await methods.syncArtifactAppWithVersion(baseInput({ sourceMetadata }));

    expect(legacy.app.artifactAppId).toBe(first.app.artifactAppId);
    expect(consolidated.app.artifactAppId).toBe(first.app.artifactAppId);
    expect(await ArtifactApp.countDocuments({ status: { $ne: 'archived' } })).toBe(1);
    expect(await ArtifactApp.countDocuments({})).toBe(1);
    expect(legacy.app.sourceMetadata?.sourceKey).toBe(sourceMetadata.sourceKey);
    expect(
      await methods.getArtifactAppBySource({
        createdBy: 'user-1',
        conversationId: sourceMetadata.conversationId,
        sourceKey: 'identifier:revenue-chart:application/vnd.react',
      }),
    ).toMatchObject({ artifactAppId: first.app.artifactAppId });
  });

  test('keeps versioned identifiers with MIME-looking suffixes distinct', async () => {
    const report = await methods.syncArtifactAppWithVersion(
      baseInput({
        sourceMetadata: { ...sourceMetadata, sourceKey: 'artifact:v1:identifier:report' },
      }),
    );
    const htmlReport = await methods.syncArtifactAppWithVersion(
      baseInput({
        sourceMetadata: {
          ...sourceMetadata,
          sourceKey: 'artifact:v1:identifier:report:text/html',
        },
      }),
    );

    expect(htmlReport.app.artifactAppId).not.toBe(report.app.artifactAppId);
    expect(await ArtifactApp.countDocuments({ status: { $ne: 'archived' } })).toBe(2);
  });

  test('creates and activates the next version when content changes', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    const second = await methods.syncArtifactAppWithVersion({
      ...input,
      version: { ...input.version, sourceSnapshot: 'export default () => <div>v2</div>;' },
    });

    expect(second.versionCreated).toBe(true);
    expect(second.version.versionNumber).toBe(2);
    expect(second.app.latestVersionNumber).toBe(2);
    expect(second.app.activeVersionId).toBe(second.version.artifactVersionId);
    expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(
      2,
    );
  });

  test('concurrent first syncs resolve to one fully initialized app and version', async () => {
    const input = baseInput({ sourceMetadata });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => methods.syncArtifactAppWithVersion(input)),
    );

    expect(new Set(results.map(({ app }) => app.artifactAppId)).size).toBe(1);
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    expect(await ArtifactApp.countDocuments({})).toBe(1);
    expect(await ArtifactVersion.countDocuments({})).toBe(1);
    expect(
      results.every(({ app, version }) => app.activeVersionId === version.artifactVersionId),
    ).toBe(true);
  });

  test('serializes concurrent standalone updates without duplicate versions', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    const updates = Array.from({ length: 4 }, (_, index) =>
      methods.syncArtifactAppWithVersion({
        ...input,
        version: {
          ...input.version,
          sourceSnapshot: `export default () => <div>update-${index}</div>;`,
        },
      }),
    );
    const results = await Promise.all(updates);
    const versions = await ArtifactVersion.find({ artifactAppId: first.app.artifactAppId })
      .sort({ versionNumber: 1 })
      .lean();
    const app = await ArtifactApp.findOne({ artifactAppId: first.app.artifactAppId }).lean();

    expect(results.every(({ versionCreated }) => versionCreated)).toBe(true);
    expect(versions.map(({ versionNumber }) => versionNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(app?.latestVersionNumber).toBe(5);
    expect(
      versions.some(({ artifactVersionId }) => artifactVersionId === app?.activeVersionId),
    ).toBe(true);
  });

  test('deduplicates concurrent updates with identical content', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    const update = {
      ...input,
      version: { ...input.version, sourceSnapshot: 'export default () => <div>shared-v2</div>;' },
    };
    const results = await Promise.all(
      Array.from({ length: 6 }, () => methods.syncArtifactAppWithVersion(update)),
    );

    expect(results.filter(({ versionCreated }) => versionCreated)).toHaveLength(1);
    expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(
      2,
    );
  });

  test('does not advance the current version when version creation fails', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);

    await expect(
      methods.syncArtifactAppWithVersion({
        ...input,
        version: {
          ...input.version,
          artifactType: 'invalid-runtime' as CreateArtifactAppInput['version']['artifactType'],
          sourceSnapshot: 'invalid update',
        },
      }),
    ).rejects.toThrow();

    const unchangedApp = await ArtifactApp.findOne({
      artifactAppId: first.app.artifactAppId,
    }).lean();
    expect(unchangedApp?.latestVersionNumber).toBe(1);
    expect(unchangedApp?.activeVersionId).toBe(first.version.artifactVersionId);
    expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(
      1,
    );

    const retry = await methods.syncArtifactAppWithVersion({
      ...input,
      version: { ...input.version, sourceSnapshot: 'valid update' },
    });
    expect(retry.version.versionNumber).toBe(2);
  });

  test('recovers a version written before its app pointer was committed', async () => {
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    const orphanSnapshot = 'export default () => <div>recover me</div>;';
    await ArtifactVersion.create({
      artifactVersionId: 'ver_recoverable',
      artifactAppId: first.app.artifactAppId,
      versionNumber: 2,
      artifactType: 'react',
      sourceSnapshot: orphanSnapshot,
      runtimeConfig: {},
      integrity: {
        sourceHash: computeSourceHash('react', orphanSnapshot),
        schemaVersion: 1,
      },
      createdBy: 'user-1',
      publication: { state: 'draft' },
    });

    const recovered = await methods.syncArtifactAppWithVersion({
      ...input,
      version: { ...input.version, sourceSnapshot: orphanSnapshot },
    });
    const persistedApp = await ArtifactApp.findOne({
      artifactAppId: first.app.artifactAppId,
    }).lean();

    expect(recovered.versionCreated).toBe(true);
    expect(recovered.version.artifactVersionId).toBe('ver_recoverable');
    expect(persistedApp?.latestVersionNumber).toBe(2);
    expect(persistedApp?.activeVersionId).toBe('ver_recoverable');
    expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(
      2,
    );
  });
});

describe('CRUD', () => {
  test('get / list / update / delete', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());

    const fetched = await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId });
    expect(fetched?.title).toBe('My Chart');

    const listed = await methods.listArtifactApps({ createdBy: 'user-1', limit: 20 });
    expect(listed.entries).toHaveLength(1);

    const updated = await methods.updateArtifactApp(
      { artifactAppId: app.artifactAppId },
      { title: 'Updated' },
    );
    expect(updated?.title).toBe('Updated');

    const del = await methods.deleteArtifactApp({ artifactAppId: app.artifactAppId });
    expect(del.deletedApp).toBe(true);
    expect(del.deletedVersions).toBe(1);
    expect(await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId })).toBeNull();
  });

  test('resolveArtifactAppId returns a plain string id for ACL checks', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const resolved = await methods.resolveArtifactAppId({ artifactAppId: app.artifactAppId });
    expect(resolved).toMatch(/^[a-f0-9]{24}$/);
  });

  test('paginates app records with opaque storage-owned cursors', async () => {
    await Promise.all(
      ['First', 'Second', 'Third'].map((title) =>
        methods.createArtifactAppWithVersion(baseInput({ title })),
      ),
    );

    const firstPage = await methods.listArtifactApps({ createdBy: 'user-1', limit: 2 });
    const secondPage = await methods.listArtifactApps({
      createdBy: 'user-1',
      limit: 2,
      cursor: firstPage.after ?? undefined,
    });

    expect(firstPage.entries).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.after).toEqual(expect.any(String));
    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
    const appIds = new Set(
      [...firstPage.entries, ...secondPage.entries].map(({ app }) => app.artifactAppId),
    );
    expect(appIds.size).toBe(3);
    await expect(
      methods.listArtifactApps({ createdBy: 'user-1', limit: 2, cursor: 'not-json' }),
    ).rejects.toThrow('Invalid artifact app cursor');
  });

  test('applies metadata search before pagination', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        methods.createArtifactAppWithVersion(
          baseInput({
            title: index === 24 ? 'Needle Artifact' : `Ordinary Artifact ${index}`,
            tags: index === 23 ? ['needle-tag'] : undefined,
          }),
        ),
      ),
    );

    const titleResult = await methods.listArtifactApps({
      createdBy: 'user-1',
      search: 'needle artifact',
      limit: 10,
    });
    const tagResult = await methods.listArtifactApps({
      createdBy: 'user-1',
      search: 'needle-tag',
      limit: 10,
    });

    expect(titleResult.entries.map(({ app }) => app.title)).toEqual(['Needle Artifact']);
    expect(tagResult.entries).toHaveLength(1);
  });

  test('resumes a standalone deletion after a version cleanup failure', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const deleteVersions = jest
      .spyOn(ArtifactVersion, 'deleteMany')
      .mockRejectedValueOnce(new Error('temporary cleanup failure'));

    await expect(
      methods.prepareArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1'),
    ).rejects.toThrow('temporary cleanup failure');
    deleteVersions.mockRestore();
    expect(await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId })).toMatchObject(
      {
        deletion: { requestedBy: 'user-1' },
      },
    );

    const retry = await methods.prepareArtifactAppDeletion(
      { artifactAppId: app.artifactAppId },
      'admin-1',
    );
    expect(retry.deletedVersions).toBe(1);
    expect(
      await methods.finalizeArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'admin-1'),
    ).toBe(true);
    expect(await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId })).toMatchObject(
      {
        status: 'archived',
        deletion: { requestedBy: 'user-1', finalizedAt: expect.any(Date) },
      },
    );
  });

  test('allows another authorized actor to join an in-progress deletion', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());

    const prepared = await Promise.all([
      methods.prepareArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1'),
      methods.prepareArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'admin-1'),
    ]);

    expect(prepared.every(({ found }) => found)).toBe(true);
    expect(prepared.reduce((count, result) => count + result.deletedVersions, 0)).toBe(1);
    await expect(
      Promise.all([
        methods.finalizeArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1'),
        methods.finalizeArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'admin-1'),
      ]),
    ).resolves.toEqual([true, true]);
  });

  test('keeps a durable source fence before and after deletion finalization', async () => {
    const sourceMetadata = {
      conversationId: 'conversation-deleted',
      sourceKey: 'artifact:v1:identifier:deleted-report',
    };
    const input = baseInput({ sourceMetadata });
    const { app } = await methods.syncArtifactAppWithVersion(input);

    await methods.prepareArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1');
    await expect(methods.syncArtifactAppWithVersion(input)).rejects.toBeInstanceOf(
      ArtifactAppDeletedError,
    );
    await expect(
      Promise.all([
        methods.finalizeArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1'),
        methods.finalizeArtifactAppDeletion({ artifactAppId: app.artifactAppId }, 'user-1'),
      ]),
    ).resolves.toEqual([true, true]);
    await expect(methods.syncArtifactAppWithVersion(input)).rejects.toBeInstanceOf(
      ArtifactAppDeletedError,
    );
    expect(await methods.listArtifactApps({ createdBy: 'user-1', limit: 20 })).toMatchObject({
      entries: [],
    });
    expect(await ArtifactVersion.countDocuments({ artifactAppId: app.artifactAppId })).toBe(0);
  });
});

describe('version lifecycle', () => {
  test('paginates version metadata without returning stored snapshots', async () => {
    const sourceMetadata = {
      conversationId: 'conversation-pagination',
      messageId: 'message-1',
      sourceKey: 'identifier:pagination',
    };
    const input = baseInput({ sourceMetadata });
    const first = await methods.syncArtifactAppWithVersion(input);
    await methods.syncArtifactAppWithVersion({
      ...input,
      version: { ...input.version, sourceSnapshot: 'version two' },
    });
    await methods.syncArtifactAppWithVersion({
      ...input,
      version: { ...input.version, sourceSnapshot: 'version three' },
    });

    const firstPage = await methods.listArtifactVersions({
      artifactAppId: first.app.artifactAppId,
      limit: 2,
    });
    const secondPage = await methods.listArtifactVersions({
      artifactAppId: first.app.artifactAppId,
      limit: 2,
      cursor: firstPage.after ?? undefined,
    });

    expect(firstPage.versions.map(({ versionNumber }) => versionNumber)).toEqual([3, 2]);
    expect(firstPage.versions.every((version) => !('sourceSnapshot' in version))).toBe(true);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.versions.map(({ versionNumber }) => versionNumber)).toEqual([1]);
    expect(secondPage.hasMore).toBe(false);
    await expect(
      methods.listArtifactVersions({
        artifactAppId: first.app.artifactAppId,
        limit: 2,
        cursor: 'not-json',
      }),
    ).rejects.toThrow('Invalid artifact version cursor');
  });

  test('release then activate; activate rejects unreleased versions', async () => {
    const { app, version } = await methods.createArtifactAppWithVersion(baseInput());

    await expect(
      methods.activateArtifactVersion({
        artifactAppId: app.artifactAppId,
        versionNumber: 1,
      }),
    ).rejects.toThrow(/released/);

    const released = await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 1 },
      'user-1',
    );
    expect(released?.publication.state).toBe('released');
    expect(released?.publication.releasedBy).toBe('user-1');

    const activated = await methods.activateArtifactVersion({
      artifactAppId: app.artifactAppId,
      versionNumber: 1,
    });
    expect(activated?.app.activeVersionId).toBe(version.artifactVersionId);
  });

  test('rollback: activate an older released version', async () => {
    const sourceMetadata = {
      conversationId: 'conversation-rollback',
      messageId: 'message-1',
      originalArtifactId: 'artifact-rollback',
      sourceKey: 'identifier:rollback',
    };
    const first = await methods.syncArtifactAppWithVersion(baseInput({ sourceMetadata }));
    const { app, version: v1 } = first;
    await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 1 },
      'user-1',
    );
    const second = await methods.syncArtifactAppWithVersion(
      baseInput({
        sourceMetadata: { ...sourceMetadata, messageId: 'message-2' },
        version: { ...baseInput().version, sourceSnapshot: 'v2' },
      }),
    );
    const v2 = second.version;
    await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 2 },
      'user-1',
    );
    await methods.activateArtifactVersion({ artifactAppId: app.artifactAppId, versionNumber: 2 });

    const rolledBack = await methods.activateArtifactVersion({
      artifactAppId: app.artifactAppId,
      versionNumber: 1,
    });
    expect(rolledBack?.app.activeVersionId).toBe(v1.artifactVersionId);
    expect(v2.versionNumber).toBe(2);
  });

  test('released version snapshot/hash are immutable across lifecycle transitions', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const released = await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 1 },
      'user-1',
    );
    const hashAtRelease = released?.integrity.sourceHash;

    await methods.withdrawArtifactVersion({ artifactAppId: app.artifactAppId, versionNumber: 1 });

    const reread = await methods.getArtifactVersion({
      artifactAppId: app.artifactAppId,
      versionNumber: 1,
    });
    expect(reread?.integrity.sourceHash).toBe(hashAtRelease);
    expect(reread?.publication.state).toBe('withdrawn');
  });
});

describe('tenant isolation', () => {
  test('apps are scoped by tenant; cross-tenant reads return nothing', async () => {
    const appA = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.createArtifactAppWithVersion(baseInput({ tenantId: 'tenant-a' })),
    );
    await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      methods.createArtifactAppWithVersion(baseInput({ tenantId: 'tenant-b' })),
    );

    const fromB = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      methods.getArtifactAppByAppId({ artifactAppId: appA.app.artifactAppId }),
    );
    expect(fromB).toBeNull();

    const fromA = await tenantStorage.run({ tenantId: 'tenant-a' }, async () =>
      methods.getArtifactAppByAppId({ artifactAppId: appA.app.artifactAppId }),
    );
    expect(fromA?.artifactAppId).toBe(appA.app.artifactAppId);

    const listB = await tenantStorage.run({ tenantId: 'tenant-b' }, async () =>
      methods.listArtifactApps({ limit: 20 }),
    );
    expect(listB.entries).toHaveLength(1);
    expect(listB.entries[0]?.app.tenantId).toBe('tenant-b');
  });
});
