import mongoose from 'mongoose';
import skillSyncStatusSchema from './skillSyncStatus';

const SkillSyncStatus = mongoose.model('SkillSyncStatusSchemaTest', skillSyncStatusSchema);

describe('skillSyncStatusSchema', () => {
  it('accepts an empty path for a skipped repository-root skill', () => {
    const status = new SkillSyncStatus({
      provider: 'github',
      sourceId: 'root-skills',
      status: 'failed',
      skippedSkillCount: 1,
      skippedSkills: [{ path: '', errorCode: 'SKILL_PARSE_FAILED', errorMessage: 'Invalid YAML' }],
    });

    expect(status.validateSync()).toBeUndefined();
  });

  it('still rejects a skipped skill without a path', () => {
    const status = new SkillSyncStatus({
      provider: 'github',
      sourceId: 'root-skills',
      status: 'failed',
      skippedSkillCount: 1,
      skippedSkills: [{ errorCode: 'SKILL_PARSE_FAILED', errorMessage: 'Invalid YAML' }],
    });

    expect(status.validateSync()?.errors['skippedSkills.0.path']?.message).toBe('Path is required');
  });
});
