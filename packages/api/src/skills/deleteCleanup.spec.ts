import type { DeleteSkillResult } from '@librechat/data-schemas';
import { mergeDeleteSkillResults } from './deleteCleanup';

function incomplete(...failedCleanupSteps: DeleteSkillResult['failedCleanupSteps']) {
  return {
    deleted: true,
    skillAbsent: true,
    cleanupComplete: false,
    failedCleanupSteps,
  } satisfies DeleteSkillResult;
}

describe('mergeDeleteSkillResults', () => {
  it('keeps steps settled when alternating retries fail independently', () => {
    expect(mergeDeleteSkillResults(incomplete('permissions'), incomplete('skill_files'))).toEqual({
      deleted: true,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    });
  });

  it('retains a step that failed in every attempt', () => {
    expect(
      mergeDeleteSkillResults(incomplete('permissions', 'skill_files'), incomplete('permissions')),
    ).toEqual({
      deleted: true,
      skillAbsent: true,
      cleanupComplete: false,
      failedCleanupSteps: ['permissions'],
    });
  });
});
