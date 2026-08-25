import type { UserStorageUsageParams } from '@librechat/data-schemas';
import type { StorageScope } from './quota';
import {
  FILE_STORAGE_LIMIT_ERROR_CODE,
  isFileStorageLimitError,
  persistFileWithQuota,
  persistSkillFileWithQuota,
  resolveStorageScope,
} from './quota';

const megabyte = 1024 * 1024;
const userId = '64f000000000000000000001';

type TestRequest = {
  tenantId?: string;
  user?: { id?: string; tenantId?: string };
  config?: { fileConfig?: { storageLimit?: number } };
};

/** `storageLimit` is authored in MB and merged to bytes, matching librechat.yaml. */
function makeReq({
  storageLimitMb,
  userTenantId,
  requestTenantId,
}: {
  storageLimitMb?: number;
  userTenantId?: string;
  requestTenantId?: string;
} = {}): TestRequest {
  return {
    tenantId: requestTenantId,
    user: { id: userId, tenantId: userTenantId },
    config: { fileConfig: storageLimitMb === undefined ? {} : { storageLimit: storageLimitMb } },
  };
}

function usageOf(bytes: number) {
  return jest.fn<Promise<number>, [UserStorageUsageParams]>(async () => bytes);
}

const noRollbackErrors = () => {
  throw new Error('rollback should not have failed');
};

describe('resolveStorageScope', () => {
  it('prefers the request tenant over the user tenant', () => {
    const scope = resolveStorageScope(
      makeReq({ userTenantId: 'user-tenant', requestTenantId: 'request-tenant' }),
    );

    expect(scope.tenantId).toBe('request-tenant');
  });

  it('falls back to the user tenant when the request carries none', () => {
    expect(resolveStorageScope(makeReq({ userTenantId: 'user-tenant' })).tenantId).toBe(
      'user-tenant',
    );
  });

  /* Remote-agent auth authenticates users that hold no tenant of their own and
   * supplies it per request; the row must still be charged to that tenant. */
  it('resolves the request tenant for a user that carries none', () => {
    expect(resolveStorageScope(makeReq({ requestTenantId: 'request-tenant' })).tenantId).toBe(
      'request-tenant',
    );
  });

  it('memoizes per request so one request reads the ledger at most once per scope', () => {
    const req = makeReq({ storageLimitMb: 1 });

    expect(resolveStorageScope(req)).toBe(resolveStorageScope(req));
  });

  it('refuses to resolve without an authenticated user', () => {
    expect(() => resolveStorageScope({ user: {} })).toThrow(/authenticated user/i);
  });
});

describe('persistFileWithQuota', () => {
  it('writes without a ledger read when no limit is configured', async () => {
    const getUserStorageUsage = usageOf(500 * megabyte);
    const write = jest.fn(async (row: { bytes: number }) => row);

    await persistFileWithQuota(
      {
        scope: resolveStorageScope(makeReq()),
        row: { bytes: 10 },
        write,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalled();
    expect(getUserStorageUsage).not.toHaveBeenCalled();
  });

  /* The charge is derived from the row that gets written, so a caller cannot charge a
   * raw upload size while persisting a converted or extracted one — there is no second
   * byte count to pass. Two writes sharing an exclusion scope accumulate against one
   * ledger read. */
  it('charges the byte count on the row it persists and accumulates within a request', async () => {
    const scope = resolveStorageScope(makeReq({ storageLimitMb: 1 }));
    const getUserStorageUsage = usageOf(megabyte - 10);

    await persistFileWithQuota(
      { scope, row: { bytes: 6 }, write: async (row) => row, rollback: null, getUserStorageUsage },
      noRollbackErrors,
    );

    await expect(
      persistFileWithQuota(
        {
          scope,
          row: { bytes: 6 },
          write: async (row) => row,
          rollback: null,
          getUserStorageUsage,
        },
        noRollbackErrors,
      ),
    ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE });

    expect(getUserStorageUsage).toHaveBeenCalledTimes(1);
  });

  /* Query scope and write scope are the same value by construction — the defect
   * class where rows landed in a tenant the usage query never counted. */
  it('stamps the resolved tenant onto the row and queries that same tenant', async () => {
    const getUserStorageUsage = usageOf(0);
    const write = jest.fn(async (row: { bytes: number; tenantId?: string }) => row);

    await persistFileWithQuota(
      {
        scope: resolveStorageScope(
          makeReq({ storageLimitMb: 1, requestTenantId: 'request-tenant' }),
        ),
        row: { bytes: 10, tenantId: 'stale-tenant' },
        write,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'request-tenant' }));
    expect(getUserStorageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'request-tenant' }),
    );
  });

  it('runs the rollback and skips the write when the row would exceed the limit', async () => {
    const rollback = jest.fn();
    const write = jest.fn();

    await expect(
      persistFileWithQuota(
        {
          scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
          row: { bytes: 2 * megabyte },
          write,
          rollback,
          getUserStorageUsage: usageOf(0),
        },
        noRollbackErrors,
      ),
    ).rejects.toMatchObject({ status: 413 });

    expect(rollback).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  it('reports a failing rollback without masking the quota error', async () => {
    const onRollbackError = jest.fn();

    await expect(
      persistFileWithQuota(
        {
          scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
          row: { bytes: 2 * megabyte },
          write: jest.fn(),
          rollback: () => {
            throw new Error('blob delete failed');
          },
          getUserStorageUsage: usageOf(0),
        },
        onRollbackError,
      ),
    ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE });

    expect(onRollbackError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('does not roll back for failures that are not quota rejections', async () => {
    const rollback = jest.fn();

    await expect(
      persistFileWithQuota(
        {
          scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
          row: { bytes: 10 },
          write: async () => {
            throw new Error('mongo down');
          },
          rollback,
          getUserStorageUsage: usageOf(0),
        },
        noRollbackErrors,
      ),
    ).rejects.toThrow('mongo down');

    expect(rollback).not.toHaveBeenCalled();
  });

  /* A scope that excludes the row just written already omits it, so charging that
   * scope would double-count the replacement against itself. */
  it('does not charge a replacement against the scope that excludes it', async () => {
    const scope = resolveStorageScope(makeReq({ storageLimitMb: 1 }));
    const getUserStorageUsage = usageOf(megabyte - 10);
    const params = {
      scope,
      row: { bytes: 6, file_id: 'file-1' },
      rollback: null,
      getUserStorageUsage,
    };

    await persistFileWithQuota({ ...params, write: async (row) => row }, noRollbackErrors);
    const write = jest.fn(async (row: { bytes: number }) => row);
    await persistFileWithQuota({ ...params, write }, noRollbackErrors);

    expect(write).toHaveBeenCalled();
    expect(getUserStorageUsage).toHaveBeenCalledTimes(1);
  });

  /* Replacing a file is charged the difference, not the full size a second time. */
  it('excludes the row being replaced from its own usage total', async () => {
    const getUserStorageUsage = usageOf(0);

    await persistFileWithQuota(
      {
        scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
        row: { bytes: 10, file_id: 'file-being-replaced' },
        write: async (row) => row,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    expect(getUserStorageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ excludeFileId: 'file-being-replaced' }),
    );
  });

  /* A cached total that does not exclude the replaced row already contains its old
   * bytes. The replacement's own check scope excludes it and so uses the full size,
   * but other cached scopes may only grow by the difference — charging them the full
   * size counts both versions and rejects later writes that actually fit. */
  it('charges other cached scopes only the difference when replacing a row', async () => {
    const scope = resolveStorageScope(makeReq({ storageLimitMb: 1 }));
    const getUserStorageUsage = usageOf(megabyte - 10);

    await persistFileWithQuota(
      { scope, row: { bytes: 6 }, write: async (row) => row, rollback: null, getUserStorageUsage },
      noRollbackErrors,
    );

    await persistFileWithQuota(
      {
        scope,
        row: { bytes: 8, file_id: 'file-1' },
        replacedBytes: 6,
        write: async (row) => row,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    /* The shared scope grew by 2, not 8, so this last write still fits exactly. */
    const write = jest.fn(async (row: { bytes: number }) => row);
    await persistFileWithQuota(
      { scope, row: { bytes: 2 }, write, rollback: null, getUserStorageUsage },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalled();
  });

  /* Charging one ledger while writing to another leaves the written owner unenforced. */
  it('writes the row to the owner it charged', async () => {
    const write = jest.fn(async (row: { bytes: number; user?: string }) => row);

    await persistFileWithQuota(
      {
        scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
        row: { bytes: 10, user: 'someone-else' },
        write,
        rollback: null,
        getUserStorageUsage: usageOf(0),
      },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ user: userId }));
  });

  describe('when the user is already over the limit', () => {
    /* Quotas get switched on, or lowered, for accounts already holding more than the
     * new cap. Everything stops until they free space, and the error has to say by
     * how much — otherwise "delete files" is unactionable. */
    it('reports observed usage against the cap', async () => {
      const error = await persistFileWithQuota(
        {
          scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
          row: { bytes: 1 },
          write: jest.fn(),
          rollback: null,
          getUserStorageUsage: usageOf(5 * megabyte),
        },
        noRollbackErrors,
      ).catch((caught: unknown) => caught);

      if (!isFileStorageLimitError(error)) {
        throw new Error('expected a storage limit rejection');
      }
      expect(error).toMatchObject({ storageLimit: megabyte, currentUsage: 5 * megabyte });
      expect(error.message).toContain('5MB');
      expect(error.message).toContain('1MB');
    });

    it('accepts writes again once deletions bring usage back under the cap', async () => {
      await expect(
        persistFileWithQuota(
          {
            scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
            row: { bytes: 1 },
            write: jest.fn(),
            rollback: null,
            getUserStorageUsage: usageOf(5 * megabyte),
          },
          noRollbackErrors,
        ),
      ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE });

      const write = jest.fn(async (row: { bytes: number }) => row);
      await persistFileWithQuota(
        {
          scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
          row: { bytes: 1 },
          write,
          rollback: null,
          getUserStorageUsage: usageOf(megabyte / 2),
        },
        noRollbackErrors,
      );

      expect(write).toHaveBeenCalled();
    });
  });
});

describe('persistSkillFileWithQuota', () => {
  const skillRow = { bytes: 10, skillId: '64f000000000000000000002', relativePath: 'scripts/a.sh' };

  it('discounts a skill file the requester is replacing', async () => {
    const getUserStorageUsage = usageOf(0);

    await persistSkillFileWithQuota(
      {
        scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
        row: skillRow,
        replacing: { author: userId },
        write: async (row) => row,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    expect(getUserStorageUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeSkillFile: { skillId: skillRow.skillId, relativePath: skillRow.relativePath },
      }),
    );
  });

  /* A file authored by someone else stays on that author's ledger, so the requester
   * gets no discount for overwriting it. */
  it('does not discount a skill file authored by somebody else', async () => {
    const getUserStorageUsage = usageOf(0);

    await persistSkillFileWithQuota(
      {
        scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
        row: skillRow,
        replacing: { author: '64f0000000000000000000ff' },
        write: async (row) => row,
        rollback: null,
        getUserStorageUsage,
      },
      noRollbackErrors,
    );

    expect(getUserStorageUsage).toHaveBeenCalledWith(
      expect.not.objectContaining({ excludeSkillFile: expect.anything() }),
    );
  });

  it('writes the skill row to the author it charged', async () => {
    const write = jest.fn(async (row: typeof skillRow & { author?: string }) => row);

    await persistSkillFileWithQuota(
      {
        scope: resolveStorageScope(makeReq({ storageLimitMb: 1 })),
        row: { ...skillRow, author: 'someone-else' },
        replacing: null,
        write,
        rollback: null,
        getUserStorageUsage: usageOf(0),
      },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ author: userId }));
  });

  it('stamps the resolved tenant onto skill rows too', async () => {
    const write = jest.fn(async (row: typeof skillRow & { tenantId?: string }) => row);

    await persistSkillFileWithQuota(
      {
        scope: resolveStorageScope(
          makeReq({ storageLimitMb: 1, requestTenantId: 'request-tenant' }),
        ),
        row: skillRow,
        replacing: null,
        write,
        rollback: null,
        getUserStorageUsage: usageOf(0),
      },
      noRollbackErrors,
    );

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'request-tenant' }));
  });
});

describe('isFileStorageLimitError', () => {
  it('rejects errors that are not quota rejections', () => {
    expect(isFileStorageLimitError(new Error('plain'))).toBe(false);
    expect(isFileStorageLimitError(null)).toBe(false);
    expect(isFileStorageLimitError({ code: FILE_STORAGE_LIMIT_ERROR_CODE })).toBe(false);
  });
});

describe('StorageScope typing', () => {
  it('cannot be assembled from a reduced request', () => {
    /* The brand is the compile-time half of the fix: a stripped request that kept only
     * `user` cannot fabricate a scope, so it must carry the real one and the tenant
     * travels with it. This asserts the type, which is why it is a `@ts-expect-error`. */
    // @ts-expect-error a StorageScope may only be produced by resolveStorageScope
    const forged: StorageScope = {
      userId,
      tenantId: undefined,
      storageLimit: undefined,
      usageByScope: new Map(),
    };

    expect(forged.userId).toBe(userId);
  });
});
