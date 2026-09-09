const mockPersistSkillFileWithQuota = jest.fn();
const mockResolveStorageScope = jest.fn();
const mockGetSkillFileByPath = jest.fn();
const mockUpsertSkillFile = jest.fn();
const mockGetUserStorageUsage = jest.fn();

jest.mock('@librechat/api', () => ({
  persistSkillFileWithQuota: (...args) => mockPersistSkillFileWithQuota(...args),
  resolveStorageScope: (...args) => mockResolveStorageScope(...args),
}));

jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn() } }));

jest.mock('~/models', () => ({
  getSkillFileByPath: (...args) => mockGetSkillFileByPath(...args),
  upsertSkillFile: (...args) => mockUpsertSkillFile(...args),
  getUserStorageUsage: (...args) => mockGetUserStorageUsage(...args),
}));

const { upsertSkillFileWithQuota } = require('./quota');

describe('upsertSkillFileWithQuota', () => {
  it('charges only the replacement delta on the requester scope', async () => {
    const req = { user: { id: 'user-1' } };
    const row = { skillId: 'skill-1', relativePath: 'references/a.txt', bytes: 120 };
    const replacing = { author: 'user-1', bytes: 40 };
    const scope = { userId: 'user-1' };
    mockGetSkillFileByPath.mockResolvedValueOnce(replacing);
    mockResolveStorageScope.mockReturnValueOnce(scope);
    mockPersistSkillFileWithQuota.mockResolvedValueOnce({ ...row, author: 'user-1' });

    await upsertSkillFileWithQuota(req, row);

    expect(mockPersistSkillFileWithQuota).toHaveBeenCalledWith(
      expect.objectContaining({
        scope,
        row,
        write: expect.any(Function),
        rollback: null,
        replacing,
        replacedBytes: 40,
      }),
      expect.any(Function),
    );
  });
});
