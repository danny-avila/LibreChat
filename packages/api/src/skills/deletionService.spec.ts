import { createSkillDeletionService } from './deletionService';

it('records failed cleanup attempts before releasing the claim', async () => {
  const skillId = '507f1f77bcf86cd799439011';
  const journal = { skillId };
  const order: string[] = [];
  let released: () => void = () => undefined;
  const releaseObserved = new Promise<void>((resolve) => {
    released = resolve;
  });
  const persistence = {
    discoverUnjournaledDeletions: jest.fn(async () => 0),
    listSkillDeletionTombstones: jest.fn(async () => [journal]),
    claimSkillDeletion: jest.fn(async () => true),
    refreshSkillDeletionClaim: jest.fn(async () => true),
    noteSkillDeletionAttempt: jest.fn(async () => {
      order.push('attempt');
    }),
    releaseSkillDeletionClaim: jest.fn(async () => {
      order.push('release');
      released();
    }),
    beginSkillDeletion: jest.fn(async () => {
      throw new Error('storage unavailable');
    }),
    getSkillDeletion: jest.fn(async () => journal),
    listSkillFiles: jest.fn(async () => []),
    listSkillUploadIntents: jest.fn(async () => []),
    deleteSkillFileAfterBlob: jest.fn(async () => true),
    finalizeSkillDeletion: jest.fn(async () => ({
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    })),
    completeSkillDeletion: jest.fn(async () => undefined),
    reopenSkillDeletion: jest.fn(async () => undefined),
    markSkillUploadIntentCleaned: jest.fn(async () => undefined),
    listAbandonedSkillUploadIntents: jest.fn(async () => []),
    claimAbandonedSkillUploadIntent: jest.fn(async () => true),
    refreshAbandonedSkillUploadIntentClaim: jest.fn(async () => true),
    noteAbandonedSkillUploadIntentAttempt: jest.fn(async () => undefined),
    releaseAbandonedSkillUploadIntentClaim: jest.fn(async () => undefined),
    skillFileExistsForIntent: jest.fn(async () => false),
  };
  const service = createSkillDeletionService({
    persistence,
    loadConfig: jest.fn(async () => undefined),
    getStrategyFunctions: jest.fn(() => ({})),
    runAsSystem: async (callback) => callback(),
    logger: { error: jest.fn(), warn: jest.fn() },
  });

  const sweep = service.startSkillDeletionSweep({ sweepIntervalMs: 60_000, claimLeaseMs: 120_000 });
  await releaseObserved;
  sweep.stop();
  expect(order).toEqual(['attempt', 'release']);
  expect(persistence.noteSkillDeletionAttempt).toHaveBeenCalledWith(skillId);
});

it.each([false, true])(
  'reconciles an abandoned intent on an active Skill while preserving a live file row: row=%s',
  async (rowExists) => {
    const skillId = '507f1f77bcf86cd799439011';
    const author = '507f1f77bcf86cd799439012';
    const intent = {
      skillId,
      fileId: 'abandoned-file',
      source: 'local',
      storageKey: '/uploads/abandoned-file',
      author,
      state: 'abandoned' as const,
    };
    let released: () => void = () => undefined;
    const releaseObserved = new Promise<void>((resolve) => {
      released = resolve;
    });
    const deleteFile = jest.fn(async () => undefined);
    const persistence = {
      discoverUnjournaledDeletions: jest.fn(async () => 0),
      listSkillDeletionTombstones: jest.fn(async () => []),
      claimSkillDeletion: jest.fn(async () => true),
      refreshSkillDeletionClaim: jest.fn(async () => true),
      noteSkillDeletionAttempt: jest.fn(async () => undefined),
      releaseSkillDeletionClaim: jest.fn(async () => undefined),
      beginSkillDeletion: jest.fn(async () => null),
      getSkillDeletion: jest.fn(async () => null),
      listSkillFiles: jest.fn(async () => []),
      listSkillUploadIntents: jest.fn(async () => []),
      deleteSkillFileAfterBlob: jest.fn(async () => true),
      finalizeSkillDeletion: jest.fn(async () => ({
        deleted: false,
        skillAbsent: true,
        cleanupComplete: true,
        failedCleanupSteps: [],
      })),
      completeSkillDeletion: jest.fn(async () => undefined),
      reopenSkillDeletion: jest.fn(async () => undefined),
      markSkillUploadIntentCleaned: jest.fn(async () => undefined),
      listAbandonedSkillUploadIntents: jest.fn(async () => [intent]),
      claimAbandonedSkillUploadIntent: jest.fn(async () => true),
      refreshAbandonedSkillUploadIntentClaim: jest.fn(async () => true),
      noteAbandonedSkillUploadIntentAttempt: jest.fn(async () => undefined),
      releaseAbandonedSkillUploadIntentClaim: jest.fn(async () => released()),
      skillFileExistsForIntent: jest.fn(async () => rowExists),
    };
    const service = createSkillDeletionService({
      persistence,
      loadConfig: jest.fn(async () => undefined),
      getStrategyFunctions: jest.fn(() => ({ deleteFile })),
      runAsSystem: async (callback) => callback(),
      logger: { error: jest.fn(), warn: jest.fn() },
    });

    const sweep = service.startSkillDeletionSweep();
    await releaseObserved;
    sweep.stop();
    expect(deleteFile).toHaveBeenCalledTimes(rowExists ? 0 : 1);
    expect(persistence.markSkillUploadIntentCleaned).toHaveBeenCalledTimes(rowExists ? 0 : 1);
    expect(persistence.noteAbandonedSkillUploadIntentAttempt).toHaveBeenCalledWith(intent.fileId);
  },
);
