import type { UserStorageUsageParams } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import {
  FILE_STORAGE_LIMIT_ERROR_CODE,
  assertFileStorageLimit,
  isFileStorageLimitError,
  recordFileStorageUsage,
} from './limits';

const megabyte = 1024 * 1024;

function createReq(
  storageLimit?: number,
  tenantId?: string,
  requestTenantId?: string,
): ServerRequest {
  return {
    tenantId: requestTenantId,
    config: {
      fileConfig: storageLimit === undefined ? {} : { storageLimit },
    },
    user: {
      id: '64f000000000000000000001',
      tenantId,
    },
  } as unknown as ServerRequest;
}

function createUsageMock(currentUsage: number) {
  return jest.fn<Promise<number>, [UserStorageUsageParams]>(async () => currentUsage);
}

describe('assertFileStorageLimit', () => {
  it('no-ops when storageLimit is undefined', async () => {
    const getUserStorageUsage = createUsageMock(10 * megabyte);

    await expect(
      assertFileStorageLimit({
        req: createReq(),
        incomingBytes: 1,
        getUserStorageUsage,
      }),
    ).resolves.toBeUndefined();

    expect(getUserStorageUsage).not.toHaveBeenCalled();
  });

  it('allows usage equal to the limit', async () => {
    const getUserStorageUsage = createUsageMock(megabyte - 10);

    await expect(
      assertFileStorageLimit({
        req: createReq(1),
        incomingBytes: 10,
        getUserStorageUsage,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects usage above the limit with a user-facing storage limit error', async () => {
    const getUserStorageUsage = createUsageMock(megabyte);

    await expect(
      assertFileStorageLimit({
        req: createReq(1),
        incomingBytes: 1,
        getUserStorageUsage,
      }),
    ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE, status: 413 });
  });

  it('treats 0 as no new positive-byte storage', async () => {
    const getUserStorageUsage = createUsageMock(0);

    await expect(
      assertFileStorageLimit({
        req: createReq(0),
        incomingBytes: 1,
        getUserStorageUsage,
      }),
    ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE });
  });

  it('passes tenant and replacement exclusions to the usage lookup', async () => {
    const getUserStorageUsage = createUsageMock(1);
    const excludeSkillFile = {
      skillId: '64f000000000000000000002',
      relativePath: 'scripts/run.sh',
    };

    await assertFileStorageLimit({
      req: createReq(1, 'tenant-a'),
      incomingBytes: 1,
      getUserStorageUsage,
      excludeFileId: 'file-1',
      excludeSkillFile,
    });

    expect(getUserStorageUsage).toHaveBeenCalledWith({
      userId: '64f000000000000000000001',
      tenantId: 'tenant-a',
      excludeFileId: 'file-1',
      excludeSkillFile,
    });
  });

  it('uses the resolved request tenant for the usage lookup', async () => {
    const getUserStorageUsage = createUsageMock(1);

    await assertFileStorageLimit({
      req: createReq(1, 'tenant-user', 'tenant-request'),
      incomingBytes: 1,
      getUserStorageUsage,
    });

    expect(getUserStorageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-request' }),
    );
  });

  it('reuses request-scoped usage and includes bytes recorded after persistence', async () => {
    const getUserStorageUsage = createUsageMock(0);
    const req = createReq(1);

    await assertFileStorageLimit({
      req,
      incomingBytes: 100,
      getUserStorageUsage,
    });
    recordFileStorageUsage(req, 200);
    await assertFileStorageLimit({
      req,
      incomingBytes: megabyte - 200,
      getUserStorageUsage,
    });

    await expect(
      assertFileStorageLimit({
        req,
        incomingBytes: megabyte - 199,
        getUserStorageUsage,
      }),
    ).rejects.toMatchObject({ code: FILE_STORAGE_LIMIT_ERROR_CODE });
    expect(getUserStorageUsage).toHaveBeenCalledTimes(1);
  });

  it('does not double-count recorded bytes when a fresh exclusion scope reads persisted usage', async () => {
    const getUserStorageUsage = jest
      .fn<Promise<number>, [UserStorageUsageParams]>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(200);
    const req = createReq(1);

    await assertFileStorageLimit({
      req,
      incomingBytes: 100,
      getUserStorageUsage,
    });
    recordFileStorageUsage(req, 200, { fileId: 'image-file-id' });

    await expect(
      assertFileStorageLimit({
        req,
        incomingBytes: megabyte - 200,
        getUserStorageUsage,
        excludeFileId: 'assistant-file-id',
      }),
    ).resolves.toBeUndefined();
    expect(getUserStorageUsage).toHaveBeenCalledTimes(2);
  });

  it('does not add recorded bytes to cache scopes that exclude that file', async () => {
    const getUserStorageUsage = createUsageMock(0);
    const req = createReq(1);

    await assertFileStorageLimit({
      req,
      incomingBytes: 1,
      getUserStorageUsage,
      excludeFileId: 'file-1',
    });
    recordFileStorageUsage(req, 200, { fileId: 'file-1' });

    await expect(
      assertFileStorageLimit({
        req,
        incomingBytes: megabyte,
        getUserStorageUsage,
        excludeFileId: 'file-1',
      }),
    ).resolves.toBeUndefined();
    expect(getUserStorageUsage).toHaveBeenCalledTimes(1);
  });

  it('does not add recorded bytes to cache scopes that exclude that skill file', async () => {
    const getUserStorageUsage = createUsageMock(0);
    const req = createReq(1);
    const excludeSkillFile = {
      skillId: '64f0000000000000000000aa',
      relativePath: 'actions/run.ts',
    };

    await assertFileStorageLimit({
      req,
      incomingBytes: 1,
      getUserStorageUsage,
      excludeSkillFile,
    });
    recordFileStorageUsage(req, 200, { skillFile: excludeSkillFile });

    await expect(
      assertFileStorageLimit({
        req,
        incomingBytes: megabyte,
        getUserStorageUsage,
        excludeSkillFile,
      }),
    ).resolves.toBeUndefined();
    expect(getUserStorageUsage).toHaveBeenCalledTimes(1);
  });

  it('treats NaN incoming bytes as zero bytes', async () => {
    const getUserStorageUsage = createUsageMock(megabyte);

    await expect(
      assertFileStorageLimit({
        req: createReq(1),
        incomingBytes: Number.NaN,
        getUserStorageUsage,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('isFileStorageLimitError', () => {
  it('matches storage limit errors by code', async () => {
    const getUserStorageUsage = createUsageMock(megabyte);

    const error = await assertFileStorageLimit({
      req: createReq(1),
      incomingBytes: 1,
      getUserStorageUsage,
    }).catch((caught) => caught);

    expect(isFileStorageLimitError(error)).toBe(true);
  });

  it('rejects non-storage-limit errors', () => {
    expect(isFileStorageLimitError(new Error('plain'))).toBe(false);
    expect(isFileStorageLimitError(null)).toBe(false);
    expect(isFileStorageLimitError(undefined)).toBe(false);
    expect(isFileStorageLimitError({ code: 'SOMETHING_ELSE' })).toBe(false);
    expect(isFileStorageLimitError(Object.assign(new Error('coded'), { code: 'OTHER' }))).toBe(
      false,
    );
  });
});
