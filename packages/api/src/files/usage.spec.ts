import { handleFilesUsageRequest, FILES_USAGE_MAX_IDS } from './usage';

describe('handleFilesUsageRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  const createDeps = (marked: unknown[] = []) => ({
    updateFilesUsage: jest.fn().mockResolvedValue(marked),
  });

  it('rejects unauthenticated requests without touching the DB', async () => {
    const deps = createDeps();
    const result = await handleFilesUsageRequest({}, { file_ids: ['f1'] }, deps);
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(deps.updateFilesUsage).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', {}],
    ['not an array', { file_ids: 'f1' }],
    ['empty', { file_ids: [] }],
    ['non-string entry', { file_ids: ['f1', 42] }],
    ['empty-string entry', { file_ids: [''] }],
  ])('rejects %s file_ids with 400', async (_label, body) => {
    const deps = createDeps();
    const result = await handleFilesUsageRequest(user, body, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'INVALID_FILE_IDS' });
    expect(deps.updateFilesUsage).not.toHaveBeenCalled();
  });

  it('caps the list at FILES_USAGE_MAX_IDS', async () => {
    const deps = createDeps();
    const file_ids = Array.from({ length: FILES_USAGE_MAX_IDS + 1 }, (_, i) => `f${i}`);
    const result = await handleFilesUsageRequest(user, { file_ids }, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'TOO_MANY_FILES', max: FILES_USAGE_MAX_IDS });
    expect(deps.updateFilesUsage).not.toHaveBeenCalled();
  });

  it('marks usage owner-scoped and returns best-effort 200', async () => {
    const deps = createDeps([{ file_id: 'f1' }]);
    const result = await handleFilesUsageRequest(user, { file_ids: ['f1', 'f2'] }, deps);
    expect(deps.updateFilesUsage).toHaveBeenCalledTimes(1);
    expect(deps.updateFilesUsage).toHaveBeenCalledWith(
      [{ file_id: 'f1' }, { file_id: 'f2' }],
      undefined,
      { user: 'user-1', tenantId: 'tenant-1' },
    );
    expect(result).toEqual({ status: 200, body: { marked: 1 } });
  });

  it('returns 200 with zero marked when no id resolves to an owned file', async () => {
    const deps = createDeps([]);
    const result = await handleFilesUsageRequest(user, { file_ids: ['not-owned'] }, deps);
    expect(result).toEqual({ status: 200, body: { marked: 0 } });
  });
});
