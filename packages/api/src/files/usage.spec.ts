import { handleFilesUsageRequest, FILES_USAGE_MAX_IDS, FILES_USAGE_HOLD_MS } from './usage';

describe('handleFilesUsageRequest', () => {
  const user = { id: 'user-1', tenantId: 'tenant-1' };
  const NOW = 1_700_000_000_000;

  const createDeps = (held = 0) => ({
    extendFilesTTL: jest.fn().mockResolvedValue(held),
    now: () => NOW,
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

  it('extends the hold owner-scoped by a bounded window', async () => {
    const deps = createDeps(1);
    const result = await handleFilesUsageRequest(user, { file_ids: ['f1', 'f2'] }, deps);
    expect(deps.extendFilesTTL).toHaveBeenCalledTimes(1);
    expect(deps.extendFilesTTL).toHaveBeenCalledWith(
      ['f1', 'f2'],
      new Date(NOW + FILES_USAGE_HOLD_MS),
      { user: 'user-1', tenantId: 'tenant-1' },
    );
    expect(result).toEqual({ status: 200, body: { held: 1 } });
  });

  it('never requests an unbounded hold', async () => {
    const deps = createDeps(1);
    await handleFilesUsageRequest(user, { file_ids: ['f1'] }, deps);
    const [, expiresAt] = deps.extendFilesTTL.mock.calls[0];
    expect(expiresAt).toBeInstanceOf(Date);
    expect(Number.isFinite((expiresAt as Date).getTime())).toBe(true);
    expect((expiresAt as Date).getTime()).toBeGreaterThan(NOW);
  });

  it('returns 200 with zero held when no id resolves to an owned file', async () => {
    const deps = createDeps(0);
    const result = await handleFilesUsageRequest(user, { file_ids: ['not-owned'] }, deps);
    expect(result).toEqual({ status: 200, body: { held: 0 } });
  });
});
