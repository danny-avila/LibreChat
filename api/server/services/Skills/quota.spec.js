const mockPersistSkillFile = jest.fn();
const mockRunWithSharedScope = jest.fn();
let capturedDependencies;
const mockCreateSkillFileQuotaPersistence = jest.fn((dependencies) => {
  capturedDependencies = dependencies;
  return {
    persistSkillFile: mockPersistSkillFile,
    runWithSharedScope: mockRunWithSharedScope,
  };
});
const mockResolveStorageScope = jest.fn();
const mockUpsertSkillFile = jest.fn();
const mockGetUserStorageUsage = jest.fn();

jest.mock('@librechat/api', () => ({
  createSkillFileQuotaPersistence: (...args) => mockCreateSkillFileQuotaPersistence(...args),
  resolveStorageScope: mockResolveStorageScope,
}));

jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn() } }));

jest.mock('~/models', () => ({
  upsertSkillFile: mockUpsertSkillFile,
  getUserStorageUsage: mockGetUserStorageUsage,
}));

const { upsertSkillFileWithQuota, runWithSharedScope } = require('./quota');

describe('upsertSkillFileWithQuota', () => {
  it('keeps the CJS service as dependency wiring for the package boundary', async () => {
    const req = { user: { id: 'user-1' } };
    const row = { skillId: 'skill-1', relativePath: 'references/a.txt', bytes: 120 };
    const replacing = { author: 'user-1', bytes: 40 };

    await upsertSkillFileWithQuota(req, row, replacing);

    expect(capturedDependencies).toEqual(
      expect.objectContaining({
        resolveScope: mockResolveStorageScope,
        upsertSkillFile: mockUpsertSkillFile,
        getUserStorageUsage: mockGetUserStorageUsage,
      }),
    );
    expect(mockPersistSkillFile).toHaveBeenCalledWith(req, row, replacing);
    expect(runWithSharedScope).toBe(mockRunWithSharedScope);
  });
});
