import { handleFilesUsageRequest, FILES_USAGE_MAX_IDS, FILES_USAGE_HOLD_MS } from './usage';

describe('handleFilesUsageRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };

  const createDeps = (held = 0) => ({
    extendFilesTTL: jest.fn().mockResolvedValue(held),
  });

  it('rejects unauthenticated requests without touching the DB', async () => {
    const deps = createDeps();
    const result = await handleFilesUsageRequest({}, { file_ids: ['f1'] }, deps);
    expect(result).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
    expect(deps.extendFilesTTL).not.toHaveBeenCalled();
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
    expect(deps.extendFilesTTL).not.toHaveBeenCalled();
  });

  it('caps the list at FILES_USAGE_MAX_IDS', async () => {
    const deps = createDeps();
    const file_ids = Array.from({ length: FILES_USAGE_MAX_IDS + 1 }, (_, i) => `f${i}`);
    const result = await handleFilesUsageRequest(user, { file_ids }, deps);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({ code: 'TOO_MANY_FILES', max: FILES_USAGE_MAX_IDS });
    expect(deps.extendFilesTTL).not.toHaveBeenCalled();
  });

  it('requests an owner-scoped hold of the fixed lifetime', async () => {
    const deps = createDeps(1);
    const result = await handleFilesUsageRequest(user, { file_ids: ['f1', 'f2'] }, deps);
    expect(deps.extendFilesTTL).toHaveBeenCalledTimes(1);
    expect(deps.extendFilesTTL).toHaveBeenCalledWith(['f1', 'f2'], FILES_USAGE_HOLD_MS, {
      user: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(result).toEqual({ status: 200, body: { held: 1 } });
  });

  /** The hold must be a lifetime the data layer anchors to the upload, not a
   *  deadline derived here: a request-clock deadline would let a caller walk
   *  the file's lifetime forward one window per call. */
  it('passes a constant lifetime, never a request-derived deadline', async () => {
    const deps = createDeps(1);
    await handleFilesUsageRequest(user, { file_ids: ['f1'] }, deps);
    await handleFilesUsageRequest(user, { file_ids: ['f1'] }, deps);

    const [, firstHold] = deps.extendFilesTTL.mock.calls[0];
    const [, secondHold] = deps.extendFilesTTL.mock.calls[1];
    expect(firstHold).toBe(FILES_USAGE_HOLD_MS);
    expect(secondHold).toBe(firstHold);
    expect(typeof firstHold).toBe('number');
  });

  it('returns 200 with zero held when no id resolves to an owned file', async () => {
    const deps = createDeps(0);
    const result = await handleFilesUsageRequest(user, { file_ids: ['not-owned'] }, deps);
    expect(result).toEqual({ status: 200, body: { held: 0 } });
  });
});
