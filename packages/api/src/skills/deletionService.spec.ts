import { Types } from 'mongoose';
import type { ISkillDeletion } from '@librechat/data-schemas';
import { createSkillDeletionService } from './deletionService';

it('records failed cleanup attempts before releasing the claim', async () => {
  const skillId = new Types.ObjectId();
  const journal = { skillId } as ISkillDeletion;
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
  expect(persistence.noteSkillDeletionAttempt).toHaveBeenCalledWith(skillId.toString());
});
