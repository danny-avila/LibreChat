import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { IArtifactApp, IArtifactVersion, CreateArtifactAppInput } from '~/types';
import type { ArtifactAppMethods } from './artifactApp';
import { supportsTransactions } from '~/utils/transactions';
import { createArtifactAppMethods } from './artifactApp';
import { createModels } from '~/models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let replica: MongoMemoryReplSet;
let ArtifactApp: mongoose.Model<IArtifactApp>;
let ArtifactVersion: mongoose.Model<IArtifactVersion>;
let methods: ArtifactAppMethods;

function input(
  content = 'initial',
  preview?: CreateArtifactAppInput['version']['preview'],
): CreateArtifactAppInput {
  return {
    createdBy: 'user-1',
    title: 'Chart',
    visibility: 'private',
    sourceMetadata: {
      conversationId: 'conversation-1',
      messageId: `message-${content}`,
      sourceKey: 'artifact:v1:identifier:chart',
    },
    version: { artifactType: 'html', sourceSnapshot: content, createdBy: 'user-1', preview },
  };
}

beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  createModels(mongoose);
  ArtifactApp = mongoose.models.ArtifactApp as mongoose.Model<IArtifactApp>;
  ArtifactVersion = mongoose.models.ArtifactVersion as mongoose.Model<IArtifactVersion>;
  methods = createArtifactAppMethods(mongoose);
  await mongoose.connect(replica.getUri());
  await Promise.all([ArtifactApp.syncIndexes(), ArtifactVersion.syncIndexes()]);
  if (!(await supportsTransactions(mongoose))) {
    throw new Error('Replica-set tests require MongoDB transactions');
  }
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await replica?.stop();
});

beforeEach(async () => {
  await Promise.all([ArtifactApp.deleteMany({}), ArtifactVersion.deleteMany({})]);
});

async function expectConsistentHistory(count: number): Promise<void> {
  const app = await ArtifactApp.findOne().orFail().lean();
  const versions = await ArtifactVersion.find({ artifactAppId: app.artifactAppId })
    .sort({ versionNumber: 1 })
    .lean();
  expect(await ArtifactApp.countDocuments()).toBe(1);
  expect(versions.map(({ versionNumber }) => versionNumber)).toEqual(
    Array.from({ length: count }, (_, index) => index + 1),
  );
  expect(app.latestVersionNumber).toBe(count);
  expect(app.activeVersionId).toBe(versions[count - 1].artifactVersionId);
}

test('concurrent first registrations converge on one complete app and version', async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => methods.syncArtifactAppWithVersion(input())),
  );
  expect(results.filter(({ created }) => created)).toHaveLength(1);
  await expectConsistentHistory(1);
});

test('concurrent changed snapshots have a unique contiguous version sequence', async () => {
  await methods.syncArtifactAppWithVersion(input());
  const contents = Array.from({ length: 8 }, (_, index) => `changed-${index}`);
  const results = await Promise.all(
    contents.map((content) => methods.syncArtifactAppWithVersion(input(content))),
  );
  expect(results.every(({ versionCreated }) => versionCreated)).toBe(true);
  await expectConsistentHistory(contents.length + 1);
  expect(await ArtifactVersion.distinct('sourceSnapshot')).toEqual(
    expect.arrayContaining(contents),
  );
});

test('concurrent identical updates deduplicate against the committed winner', async () => {
  await methods.syncArtifactAppWithVersion(input());
  const results = await Promise.all(
    Array.from({ length: 8 }, () => methods.syncArtifactAppWithVersion(input('changed'))),
  );
  expect(results.filter(({ versionCreated }) => versionCreated)).toHaveLength(1);
  await expectConsistentHistory(2);
});

test('same-content sync keeps the app preview aligned with its active version', async () => {
  const originalPreview = {
    type: 'image' as const,
    imageUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    alt: 'Original preview',
  };
  const replacementPreview = {
    type: 'image' as const,
    imageUrl: 'data:image/webp;base64,UklGRgQAAABXRUJQ',
    alt: 'Replacement preview',
  };
  const first = await methods.syncArtifactAppWithVersion(input('initial', originalPreview));
  const second = await methods.syncArtifactAppWithVersion(input('initial', replacementPreview));
  const persistedApp = await ArtifactApp.findOne({ artifactAppId: first.app.artifactAppId })
    .lean()
    .orFail();

  expect(second.versionCreated).toBe(false);
  expect(second.app.preview).toEqual(originalPreview);
  expect(second.version.preview).toEqual(originalPreview);
  expect(persistedApp.preview).toEqual(originalPreview);
});

test('same-content sync transaction backfills a missing preview', async () => {
  const preview = {
    type: 'image' as const,
    imageUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    alt: 'Captured preview',
  };
  const first = await methods.syncArtifactAppWithVersion(input());
  const second = await methods.syncArtifactAppWithVersion(input('initial', preview));
  const [persistedApp, persistedVersion] = await Promise.all([
    ArtifactApp.findOne({ artifactAppId: first.app.artifactAppId }).lean().orFail(),
    ArtifactVersion.findOne({ artifactAppId: first.app.artifactAppId }).lean().orFail(),
  ]);

  expect(second.versionCreated).toBe(false);
  expect(second.app.preview).toEqual(preview);
  expect(second.version.preview).toEqual(preview);
  expect(persistedApp.preview).toEqual(preview);
  expect(persistedVersion.preview).toEqual(preview);
  expect(await ArtifactVersion.countDocuments({ artifactAppId: first.app.artifactAppId })).toBe(1);
});

test.each([11000, 112])(
  'retries the whole transaction after an unlabeled %i write failure',
  async (code) => {
    await methods.syncArtifactAppWithVersion(input());
    const create = jest.spyOn(ArtifactVersion, 'create');
    create.mockRejectedValueOnce(Object.assign(new Error('injected write failure'), { code }));

    await methods.syncArtifactAppWithVersion(input('changed'));

    expect(create).toHaveBeenCalledTimes(2);
    await expectConsistentHistory(2);
    expect(await ArtifactVersion.countDocuments({ sourceSnapshot: 'changed' })).toBe(1);
  },
);

test('rolls back the counter and active pointer when version insertion fails', async () => {
  await methods.syncArtifactAppWithVersion(input());
  const create = jest.spyOn(ArtifactVersion, 'create');
  create.mockRejectedValueOnce(new Error('injected non-retryable failure'));
  await expect(methods.syncArtifactAppWithVersion(input('changed'))).rejects.toThrow(
    'non-retryable',
  );
  await expectConsistentHistory(1);
  await methods.syncArtifactAppWithVersion(input('changed'));
  await expectConsistentHistory(2);
});
