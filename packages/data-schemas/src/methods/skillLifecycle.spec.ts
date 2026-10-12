import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createSkillLifecycleMethods } from './skillLifecycle';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('~/config/meiliLogger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

let mongoServer: MongoMemoryServer;
let lifecycle: ReturnType<typeof createSkillLifecycleMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  lifecycle = createSkillLifecycleMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Skill.deleteMany({});
  await mongoose.models.SkillDeletion.deleteMany({});
  await mongoose.models.SkillUploadIntent.deleteMany({});
  await mongoose.models.SkillFile.deleteMany({});
});

async function makeSkill() {
  const author = new mongoose.Types.ObjectId();
  const skill = await mongoose.models.Skill.create({
    name: 'example',
    description: 'Example skill for lifecycle tests',
    body: '',
    author,
    authorName: 'Example',
    tenantId: 'tenant-a',
  });
  return { skill, author };
}

describe('Skill deletion journal', () => {
  it('indexes only marked Skills for startup and periodic deletion discovery', () => {
    expect(mongoose.models.Skill.schema.indexes()).toContainEqual([
      { deletionNeedsJournal: 1 },
      expect.objectContaining({ sparse: true }),
    ]);
  });

  it('marks a skill before recording its retryable tombstone', async () => {
    const { skill } = await makeSkill();
    const result = await lifecycle.beginSkillDeletion(skill.id);
    expect(result).toMatchObject({ skillId: skill._id, tenantId: 'tenant-a' });
    const stored = (await mongoose.models.Skill.findById(skill.id).lean()) as {
      deletingAt?: Date;
    } | null;
    expect(stored?.deletingAt).toBeInstanceOf(Date);
    expect(await lifecycle.discoverUnjournaledDeletions()).toBe(0);
    await lifecycle.beginSkillDeletion(skill.id);
    expect(await mongoose.models.SkillDeletion.countDocuments({ skillId: skill._id })).toBe(1);
  });

  it('repairs a crash between the Skill mark and tombstone insert', async () => {
    const { skill } = await makeSkill();
    await mongoose.models.Skill.updateOne(
      { _id: skill._id },
      { $set: { deletingAt: new Date(), deletionNeedsJournal: true } },
    );
    expect(await mongoose.models.SkillDeletion.countDocuments({})).toBe(0);
    expect(await lifecycle.discoverUnjournaledDeletions()).toBe(1);
    expect(await lifecycle.discoverUnjournaledDeletions()).toBe(0);
    expect(await mongoose.models.SkillDeletion.countDocuments({ skillId: skill._id })).toBe(1);
  });

  it('retries a partially backfilled deletion without rescanning it after success', async () => {
    const { skill, author } = await makeSkill();
    await mongoose.models.SkillFile.create({
      skillId: skill._id,
      file_id: 'legacy-file',
      relativePath: 'references/legacy.md',
      filename: 'legacy.md',
      filepath: `/uploads/${author}/legacy-file`,
      source: 'local',
      mimeType: 'text/markdown',
      bytes: 4,
      author,
      tenantId: 'tenant-a',
    });
    const write = jest
      .spyOn(mongoose.models.SkillUploadIntent, 'updateOne')
      .mockRejectedValueOnce(new Error('database unavailable'));
    try {
      await expect(lifecycle.beginSkillDeletion(skill.id)).rejects.toThrow('database unavailable');
    } finally {
      write.mockRestore();
    }
    expect(await mongoose.models.SkillDeletion.countDocuments({ skillId: skill._id })).toBe(1);
    expect(await lifecycle.discoverUnjournaledDeletions()).toBe(1);
    expect(await lifecycle.listSkillUploadIntents(skill._id)).toMatchObject([
      { fileId: 'legacy-file', state: 'committed' },
    ]);
    expect(await lifecycle.discoverUnjournaledDeletions()).toBe(0);
  });

  it('retains completed tombstones for late file reconciliation', async () => {
    const { skill } = await makeSkill();
    await lifecycle.beginSkillDeletion(skill.id);
    await lifecycle.completeSkillDeletion(skill._id);
    expect(await lifecycle.listPendingSkillDeletions()).toHaveLength(0);
    expect(await lifecycle.listSkillDeletionTombstones()).toHaveLength(1);
    await lifecycle.reopenSkillDeletion(skill._id);
    expect(await lifecycle.listPendingSkillDeletions()).toHaveLength(1);
  });

  it('rediscovers a late upload intent after completion and method reconstruction', async () => {
    const { skill, author } = await makeSkill();
    await lifecycle.beginSkillDeletion(skill.id);
    await lifecycle.completeSkillDeletion(skill._id);
    // An upload that passed the initial Skill check before deletion may commit
    // its intent after an earlier clean sweep. The tombstone must survive it.
    await mongoose.models.SkillUploadIntent.create({
      skillId: skill._id,
      author,
      tenantId: 'tenant-a',
      fileId: 'late-file',
      source: 'local',
      storageKey: `/uploads/${author}/late-file`,
      writerId: 'stale-writer',
      state: 'abandoned',
    });
    const restarted = createSkillLifecycleMethods(mongoose);
    expect(await restarted.listSkillDeletionTombstones()).toHaveLength(1);
    expect(await restarted.listSkillUploadIntents(skill._id)).toMatchObject([
      { fileId: 'late-file', state: 'abandoned' },
    ]);
  });
});

describe('Skill upload intents', () => {
  it('requires an active Skill and fences state changes by the writer id', async () => {
    const { skill, author } = await makeSkill();
    await lifecycle.reserveSkillUploadIntent({
      skillId: skill.id,
      fileId: 'file-1',
      source: 'local',
      storageKey: 'uploads/author/file-1',
      author: author.toString(),
      tenantId: 'tenant-a',
      writerId: 'worker-1',
    });
    expect(
      await lifecycle.transitionSkillUploadIntent('file-1', 'worker-2', 'uploading', 'committing'),
    ).toBe(false);
    expect(
      await lifecycle.transitionSkillUploadIntent('file-1', 'worker-1', 'uploading', 'committing'),
    ).toBe(true);
    expect(
      await lifecycle.transitionSkillUploadIntent('file-1', 'worker-1', 'uploading', 'committing'),
    ).toBe(true);
    expect(
      await lifecycle.transitionSkillUploadIntent('file-1', 'worker-1', 'committing', 'committed'),
    ).toBe(true);
    expect(
      await lifecycle.transitionSkillUploadIntent('file-1', 'worker-1', 'committing', 'committed'),
    ).toBe(true);
    await lifecycle.beginSkillDeletion(skill.id);
    await expect(
      lifecycle.reserveSkillUploadIntent({
        skillId: skill.id,
        fileId: 'file-2',
        source: 'local',
        storageKey: 'uploads/author/file-2',
        author: author.toString(),
        tenantId: 'tenant-a',
        writerId: 'worker-1',
      }),
    ).rejects.toMatchObject({ code: 'SKILL_DELETING' });
  });

  it('backfills a pre-existing blob before its Skill row can be finalized', async () => {
    const { skill, author } = await makeSkill();
    await mongoose.models.SkillFile.create({
      skillId: skill._id,
      file_id: 'legacy-file',
      relativePath: 'references/legacy.md',
      filename: 'legacy.md',
      filepath: `/uploads/${author}/legacy-file`,
      source: 'local',
      mimeType: 'text/markdown',
      bytes: 4,
      author,
      tenantId: 'tenant-a',
    });
    await lifecycle.beginSkillDeletion(skill.id);
    const [intent] = await lifecycle.listSkillUploadIntents(skill._id);
    expect(intent).toMatchObject({
      fileId: 'legacy-file',
      source: 'local',
      storageKey: `/uploads/${author}/legacy-file`,
      state: 'committed',
    });
    await mongoose.models.SkillFile.deleteMany({ skillId: skill._id });
    expect(await lifecycle.listSkillUploadIntents(skill._id)).toHaveLength(1);
    await lifecycle.markSkillUploadIntentCleaned('legacy-file');
    expect((await lifecycle.listSkillUploadIntents(skill._id))[0].cleanedAt).toBeInstanceOf(Date);
  });

  it('preserves a replaced blob after its visible file row disappears', async () => {
    const { skill, author } = await makeSkill();
    await lifecycle.preserveExistingSkillBlob({
      skillId: skill.id,
      fileId: 'replaced-file',
      source: 'local',
      storageKey: `/uploads/${author}/replaced-file`,
      author: author.toString(),
      tenantId: 'tenant-a',
    });
    await lifecycle.beginSkillDeletion(skill.id);
    expect((await lifecycle.listSkillUploadIntents(skill._id))[0].storageKey).toBe(
      `/uploads/${author}/replaced-file`,
    );
  });

  it('serializes sweep claims and permits retry after expiry', async () => {
    const { skill } = await makeSkill();
    await lifecycle.beginSkillDeletion(skill.id);
    expect(await lifecycle.claimSkillDeletion(skill._id, 'worker-a', 60_000)).toBe(true);
    expect(await lifecycle.listSkillDeletionTombstones()).toHaveLength(0);
    expect(await lifecycle.claimSkillDeletion(skill._id, 'worker-b', 60_000)).toBe(false);
    await lifecycle.releaseSkillDeletionClaim(skill._id, 'worker-a');
    expect(await lifecycle.claimSkillDeletion(skill._id, 'worker-b', 60_000)).toBe(true);
  });

  it('recovers a verified-stopped writer without deleting a persisted file', async () => {
    const { skill, author } = await makeSkill();
    await lifecycle.reserveSkillUploadIntent({
      skillId: skill.id,
      fileId: 'orphan-file',
      source: 'local',
      storageKey: `/uploads/${author}/orphan-file`,
      author: author.toString(),
      writerId: 'stopped-writer',
    });
    expect(await lifecycle.recoverStoppedSkillUploadIntent('orphan-file', 'wrong-writer')).toEqual({
      status: 'changed',
    });
    expect(
      await lifecycle.recoverStoppedSkillUploadIntent('orphan-file', 'stopped-writer'),
    ).toEqual({
      status: 'recovered',
      state: 'abandoned',
    });
    expect((await lifecycle.getSkillUploadIntent('orphan-file'))?.state).toBe('abandoned');

    await lifecycle.reserveSkillUploadIntent({
      skillId: skill.id,
      fileId: 'persisted-file',
      source: 'local',
      storageKey: `/uploads/${author}/persisted-file`,
      author: author.toString(),
      writerId: 'stopped-writer',
    });
    await lifecycle.transitionSkillUploadIntent(
      'persisted-file',
      'stopped-writer',
      'uploading',
      'committing',
    );
    await mongoose.models.SkillFile.create({
      skillId: skill._id,
      file_id: 'persisted-file',
      relativePath: 'references/persisted.md',
      filename: 'persisted.md',
      filepath: `/uploads/${author}/persisted-file`,
      source: 'local',
      mimeType: 'text/markdown',
      bytes: 4,
      author,
    });
    expect(
      await lifecycle.recoverStoppedSkillUploadIntent('persisted-file', 'stopped-writer'),
    ).toEqual({
      status: 'recovered',
      state: 'committed',
    });
    expect(await lifecycle.listAbandonedSkillUploadIntents()).toHaveLength(1);
    expect(await lifecycle.claimAbandonedSkillUploadIntent('orphan-file', 'worker-a', 60_000)).toBe(
      true,
    );
    expect(await lifecycle.listAbandonedSkillUploadIntents()).toHaveLength(0);
    expect(await lifecycle.claimAbandonedSkillUploadIntent('orphan-file', 'worker-b', 60_000)).toBe(
      false,
    );
    await lifecycle.noteAbandonedSkillUploadIntentAttempt('orphan-file');
    await lifecycle.releaseAbandonedSkillUploadIntentClaim('orphan-file', 'worker-a');
    expect(
      (await lifecycle.getSkillUploadIntent('orphan-file'))?.lastCleanupAttemptAt,
    ).toBeInstanceOf(Date);
  });
});
