import { Types } from 'mongoose';
import type { ISkillDeletion, ISkillUploadIntent } from '@librechat/data-schemas';
import type { SkillDeletionDeps } from './deletion';
import { runSkillDeletion } from './deletion';

const skillId = new Types.ObjectId();
const author = new Types.ObjectId();
const journal = {
  skillId,
  author,
  startedAt: new Date(),
} as ISkillDeletion;

function harness() {
  const files = [
    {
      _id: new Types.ObjectId(),
      skillId,
      file_id: 'file-1',
      filepath: '/uploads/owner/file-1',
      source: 'local',
      author,
    },
  ] as Awaited<ReturnType<SkillDeletionDeps['listSkillFiles']>>;
  const intents: ISkillUploadIntent[] = [];
  const deps: SkillDeletionDeps = {
    beginSkillDeletion: jest.fn(async () => journal),
    getSkillDeletion: jest.fn(async () => journal),
    listSkillFiles: jest.fn(async () => files),
    listSkillUploadIntents: jest.fn(async () => intents),
    deleteBlob: jest.fn(async () => undefined),
    deleteReservedBlob: jest.fn(async () => undefined),
    deleteSkillFileAfterBlob: jest.fn(async (_id, fileId) => {
      const index = files.findIndex((file) => file.file_id === fileId);
      if (index < 0) return false;
      files.splice(index, 1);
      return true;
    }),
    finalizeSkillDeletion: jest.fn(async () => ({
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    })),
    completeSkillDeletion: jest.fn(async () => undefined),
    reopenSkillDeletion: jest.fn(async () => undefined),
    markSkillUploadIntentCleaned: jest.fn(async (fileId) => {
      const intent = intents.find((row) => row.fileId === fileId);
      if (intent) intent.cleanedAt = new Date();
    }),
  };
  return { files, intents, deps };
}

it('keeps the file row when provider deletion fails and succeeds on retry', async () => {
  const h = harness();
  const deleteBlob = h.deps.deleteBlob as jest.Mock;
  deleteBlob.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
    cleanupComplete: false,
    failedSteps: ['skill_files'],
  });
  expect(h.files).toHaveLength(1);
  expect(h.deps.finalizeSkillDeletion).not.toHaveBeenCalled();
  await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
    cleanupComplete: true,
  });
  expect(h.files).toHaveLength(0);
  expect(h.deps.completeSkillDeletion).toHaveBeenCalledTimes(1);
});

it('preserves idempotent absence and per-call deletion semantics', async () => {
  const h = harness();
  (h.deps.beginSkillDeletion as jest.Mock).mockResolvedValueOnce(null);
  (h.deps.getSkillDeletion as jest.Mock).mockResolvedValueOnce(null);
  await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
    found: false,
    deleted: false,
    skillAbsent: true,
    cleanupComplete: true,
  });

  h.files.length = 0;
  (h.deps.finalizeSkillDeletion as jest.Mock).mockResolvedValueOnce({
    deleted: false,
    skillAbsent: true,
    cleanupComplete: true,
    failedCleanupSteps: [],
  });
  await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
    found: true,
    deleted: false,
    skillAbsent: true,
    cleanupComplete: true,
  });
});

it.each(['uploading', 'committing'] as const)(
  'leaves an in-flight %s writer pending without deleting its blob',
  async (state) => {
    const h = harness();
    h.intents.push({
      skillId,
      author,
      fileId: 'file-1',
      source: 'local',
      storageKey: '/uploads/owner/file-1',
      writerId: 'writer',
      state,
    });
    await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
      cleanupComplete: false,
      failedSteps: ['upload_intents'],
    });
    expect(h.deps.deleteBlob).not.toHaveBeenCalled();
    expect(h.deps.finalizeSkillDeletion).not.toHaveBeenCalled();
  },
);

it('cleans a committed historical blob after its SkillFile row was replaced', async () => {
  const h = harness();
  h.files.length = 0;
  h.intents.push({
    skillId,
    author,
    fileId: 'old-file',
    source: 'local',
    storageKey: '/uploads/owner/old-file',
    writerId: 'writer',
    state: 'committed',
  });
  const first = await runSkillDeletion(skillId.toString(), h.deps);
  expect(first.cleanupComplete).toBe(true);
  expect(h.deps.deleteReservedBlob).toHaveBeenCalledTimes(1);
  expect(h.intents[0].cleanedAt).toBeDefined();
  await runSkillDeletion(skillId.toString(), h.deps);
  expect(h.deps.deleteReservedBlob).toHaveBeenCalledTimes(1);
});

it('deletes a current file blob only once when its committed intent points at the same upload', async () => {
  const h = harness();
  h.intents.push({
    skillId,
    author,
    fileId: 'file-1',
    source: 'local',
    storageKey: '/uploads/owner/file-1',
    writerId: 'writer',
    state: 'committed',
  });
  await expect(runSkillDeletion(skillId.toString(), h.deps)).resolves.toMatchObject({
    cleanupComplete: true,
  });
  expect(h.deps.deleteBlob).toHaveBeenCalledTimes(1);
  expect(h.deps.deleteReservedBlob).not.toHaveBeenCalled();
  expect(h.intents[0].cleanedAt).toBeDefined();
});

it('resweeps abandoned intents even after an earlier clean pass', async () => {
  const h = harness();
  h.files.length = 0;
  h.intents.push({
    skillId,
    author,
    fileId: 'zombie',
    source: 'local',
    storageKey: '/uploads/owner/zombie',
    writerId: 'writer',
    state: 'abandoned',
  });
  await runSkillDeletion(skillId.toString(), h.deps);
  await runSkillDeletion(skillId.toString(), h.deps);
  expect(h.deps.deleteReservedBlob).toHaveBeenCalledTimes(2);
});
