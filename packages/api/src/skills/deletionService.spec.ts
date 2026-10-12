import type { AppConfig, SkillUploadIntentRecord } from '@librechat/data-schemas';
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
    releaseSkillDeletionClaim: jest.fn(async (): Promise<void> => {
      order.push('release');
      released();
    }),
    beginSkillDeletion: jest
      .fn()
      .mockResolvedValueOnce(journal)
      .mockRejectedValueOnce(new Error('storage unavailable')),
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
    listAbandonedSkillUploadIntents: jest.fn(async (): Promise<SkillUploadIntentRecord[]> => []),
    claimAbandonedSkillUploadIntent: jest.fn(async () => true),
    refreshAbandonedSkillUploadIntentClaim: jest.fn(async () => true),
    noteAbandonedSkillUploadIntentAttempt: jest.fn(async () => undefined),
    releaseAbandonedSkillUploadIntentClaim: jest.fn(async () => undefined),
    scheduleSkillDeletionRecheck: jest.fn(async () => true),
    scheduleAbandonedSkillUploadIntentRecheck: jest.fn(async () => true),
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
      scheduleSkillDeletionRecheck: jest.fn(async () => true),
      scheduleAbandonedSkillUploadIntentRecheck: jest.fn(async () => true),
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

function claimedServiceHarness() {
  const skillId = '507f1f77bcf86cd799439011';
  const journal = { skillId, completedAt: undefined as Date | undefined };
  const files = [
    {
      file_id: 'file-1',
      filepath: '/uploads/file-1',
      source: 'local',
      author: '507f1f77bcf86cd799439012',
    },
  ];
  let held = false;
  const persistence = {
    discoverUnjournaledDeletions: jest.fn(async () => 0),
    listSkillDeletionTombstones: jest.fn(async () => [journal]),
    claimSkillDeletion: jest.fn(async () => {
      if (held) return false;
      held = true;
      return true;
    }),
    refreshSkillDeletionClaim: jest.fn(async () => held),
    noteSkillDeletionAttempt: jest.fn(async () => undefined),
    releaseSkillDeletionClaim: jest.fn(async (): Promise<void> => {
      held = false;
    }),
    scheduleSkillDeletionRecheck: jest.fn(async () => true),
    beginSkillDeletion: jest.fn(async () => journal),
    getSkillDeletion: jest.fn(async () => journal),
    listSkillFiles: jest.fn(async () => files),
    listSkillUploadIntents: jest.fn(async () => []),
    deleteSkillFileAfterBlob: jest.fn(async () => {
      files.length = 0;
      return true;
    }),
    finalizeSkillDeletion: jest.fn(async () => ({
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    })),
    completeSkillDeletion: jest.fn(async () => {
      journal.completedAt = new Date();
    }),
    reopenSkillDeletion: jest.fn(async () => undefined),
    markSkillUploadIntentCleaned: jest.fn(async () => undefined),
    listAbandonedSkillUploadIntents: jest.fn(async (): Promise<SkillUploadIntentRecord[]> => []),
    claimAbandonedSkillUploadIntent: jest.fn(async () => true),
    refreshAbandonedSkillUploadIntentClaim: jest.fn(async () => true),
    noteAbandonedSkillUploadIntentAttempt: jest.fn(async () => undefined),
    releaseAbandonedSkillUploadIntentClaim: jest.fn(async () => undefined),
    scheduleAbandonedSkillUploadIntentRecheck: jest.fn(async () => true),
    skillFileExistsForIntent: jest.fn(async () => false),
  };
  const deleteFile = jest.fn(async (): Promise<void> => undefined);
  const loadConfig = jest.fn(async (): Promise<AppConfig | undefined> => undefined);
  const service = createSkillDeletionService({
    persistence,
    loadConfig,
    getStrategyFunctions: jest.fn(() => ({ deleteFile })),
    runAsSystem: async (callback) => callback(),
    logger: { error: jest.fn(), warn: jest.fn() },
  });
  return { skillId, persistence, deleteFile, loadConfig, service };
}

it('uses the configured claim lease for direct deletion', async () => {
  const h = claimedServiceHarness();
  h.loadConfig.mockResolvedValue({ skillDeletion: { claimLeaseMs: 9_000 } } as AppConfig);
  await h.service.deleteSkillById(h.skillId);
  expect(h.persistence.claimSkillDeletion).toHaveBeenCalledWith(
    h.skillId,
    expect.any(String),
    9_000,
  );
  expect(h.loadConfig).toHaveBeenCalled();
});

it('defers tombstone-owned abandoned intents without deleting their blobs again', async () => {
  const h = claimedServiceHarness();
  const intent = {
    skillId: h.skillId,
    fileId: 'tombstone-owned',
    source: 'local',
    storageKey: '/uploads/tombstone-owned',
    author: '507f1f77bcf86cd799439012',
    state: 'abandoned' as const,
  };
  h.persistence.listSkillDeletionTombstones.mockResolvedValue([]);
  h.persistence.listAbandonedSkillUploadIntents.mockResolvedValue([intent]);
  let released: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    released = resolve;
  });
  h.persistence.releaseAbandonedSkillUploadIntentClaim.mockImplementation(async () => {
    released?.();
  });
  const sweep = h.service.startSkillDeletionSweep();
  await done;
  sweep.stop();
  expect(h.persistence.scheduleAbandonedSkillUploadIntentRecheck).toHaveBeenCalledWith(
    intent.fileId,
    expect.any(String),
    3_600_000,
  );
  expect(h.deleteFile).not.toHaveBeenCalled();
});

it('returns pending to a direct caller while the sweep owns the same Skill claim', async () => {
  const h = claimedServiceHarness();
  let releasedClaim: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    releasedClaim = resolve;
  });
  h.persistence.releaseSkillDeletionClaim.mockImplementation(async () => {
    releasedClaim?.();
  });
  let releaseBlob: (() => void) | undefined;
  let startedBlob: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    startedBlob = resolve;
  });
  h.deleteFile.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releaseBlob = resolve;
        startedBlob?.();
      }),
  );
  const sweep = h.service.startSkillDeletionSweep();
  await started;
  const pending = await h.service.deleteSkillById(h.skillId);
  expect(pending).toMatchObject({ found: true, cleanupComplete: false });
  expect(h.deleteFile).toHaveBeenCalledTimes(1);
  releaseBlob?.();
  await released;
  sweep.stop();
  expect(h.persistence.finalizeSkillDeletion).toHaveBeenCalledTimes(1);
});

it('treats a deferred completed tombstone as an idempotent direct deletion', async () => {
  const h = claimedServiceHarness();
  const completed = { skillId: h.skillId, completedAt: new Date() };
  h.persistence.beginSkillDeletion.mockResolvedValue(completed);
  h.persistence.getSkillDeletion.mockResolvedValue(completed);
  h.persistence.claimSkillDeletion.mockResolvedValue(false);
  await expect(h.service.deleteSkillById(h.skillId)).resolves.toMatchObject({
    found: true,
    skillAbsent: true,
    cleanupComplete: true,
  });
  expect(h.deleteFile).not.toHaveBeenCalled();
});

it('does not delete a file row after the heartbeat reports a lost claim', async () => {
  jest.useFakeTimers();
  try {
    const h = claimedServiceHarness();
    let releaseBlob: (() => void) | undefined;
    let startedBlob: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedBlob = resolve;
    });
    h.deleteFile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseBlob = resolve;
          startedBlob?.();
        }),
    );
    h.persistence.refreshSkillDeletionClaim
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const deletion = h.service.deleteSkillById(h.skillId);
    await started;
    await jest.advanceTimersByTimeAsync(30_000);
    releaseBlob?.();
    await expect(deletion).resolves.toMatchObject({ found: true, cleanupComplete: false });
    expect(h.persistence.deleteSkillFileAfterBlob).not.toHaveBeenCalled();
    expect(h.persistence.finalizeSkillDeletion).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
