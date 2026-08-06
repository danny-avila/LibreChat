import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IArtifactApp, IArtifactVersion, CreateArtifactAppInput } from '~/types';
import { tenantStorage } from '~/config/tenantContext';
import { createArtifactAppMethods, computeSourceHash, type ArtifactAppMethods } from './artifactApp';
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
  methods = createArtifactAppMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
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

describe('CRUD', () => {
  test('get / list / update / delete', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());

    const fetched = await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId });
    expect(fetched?.title).toBe('My Chart');

    const listed = await methods.listArtifactApps({ createdBy: 'user-1' });
    expect(listed).toHaveLength(1);

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

  test('resolveArtifactAppId returns _id and artifactAppId for ACL checks', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const resolved = await methods.resolveArtifactAppId({ artifactAppId: app.artifactAppId });
    expect(resolved?.artifactAppId).toBe(app.artifactAppId);
    expect(resolved?._id).toBeDefined();
  });
});

describe('version lifecycle', () => {
  test('createArtifactVersion increments latestVersionNumber and starts as draft', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const v2 = await methods.createArtifactVersion(
      { artifactAppId: app.artifactAppId },
      { artifactType: 'react', sourceSnapshot: 'v2', createdBy: 'user-1' },
    );
    expect(v2.versionNumber).toBe(2);
    expect(v2.publication.state).toBe('draft');

    const reread = await methods.getArtifactAppByAppId({ artifactAppId: app.artifactAppId });
    expect(reread?.latestVersionNumber).toBe(2);
  });

  test('release then activate; activate rejects unreleased versions', async () => {
    const { app } = await methods.createArtifactAppWithVersion(baseInput());
    const v2 = await methods.createArtifactVersion(
      { artifactAppId: app.artifactAppId },
      { artifactType: 'react', sourceSnapshot: 'v2', createdBy: 'user-1' },
    );

    await expect(
      methods.activateArtifactVersion({
        artifactAppId: app.artifactAppId,
        versionNumber: 2,
      }),
    ).rejects.toThrow(/released/);

    const released = await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 2 },
      'user-1',
    );
    expect(released?.publication.state).toBe('released');
    expect(released?.publication.releasedBy).toBe('user-1');

    const activated = await methods.activateArtifactVersion({
      artifactAppId: app.artifactAppId,
      versionNumber: 2,
    });
    expect(activated?.app.activeVersionId).toBe(v2.artifactVersionId);
  });

  test('rollback: activate an older released version', async () => {
    const { app, version: v1 } = await methods.createArtifactAppWithVersion(baseInput());
    await methods.releaseArtifactVersion(
      { artifactAppId: app.artifactAppId, versionNumber: 1 },
      'user-1',
    );
    const v2 = await methods.createArtifactVersion(
      { artifactAppId: app.artifactAppId },
      { artifactType: 'react', sourceSnapshot: 'v2', createdBy: 'user-1' },
    );
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
      methods.listArtifactApps({}),
    );
    expect(listB).toHaveLength(1);
    expect(listB[0].tenantId).toBe('tenant-b');
  });
});
