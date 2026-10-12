import { Types } from 'mongoose';
import type { DeleteSkillResult, ISkillFile } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { SkillsHandlersDeps } from './handlers';
import type { ServerRequest } from '~/types';
import {
  createOwnedBlobFileDeleter,
  extractAzureBlobPath,
  extractFirebaseBlobPath,
} from '~/storage/ownedBlobDelete';
import { createSkillsHandlers } from './handlers';

function mockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn(() => res) as Response['status'];
  res.json = jest.fn(() => res) as Response['json'];
  return res;
}

describe('skill delete handler', () => {
  it('retries dependent cleanup before the deleted skill becomes unreachable', async () => {
    const id = new Types.ObjectId().toString();
    const deleteBlob = jest.fn(async () => undefined);
    const incomplete: DeleteSkillResult = {
      deleted: true,
      skillAbsent: true,
      cleanupComplete: false,
      failedCleanupSteps: ['skill_files'],
    };
    const complete: DeleteSkillResult = {
      deleted: false,
      skillAbsent: true,
      cleanupComplete: true,
      failedCleanupSteps: [],
    };
    const deleteSkill = jest.fn().mockResolvedValueOnce(incomplete).mockResolvedValueOnce(complete);
    const file = {
      relativePath: 'references/query.sql',
      filepath: '/uploads/query.sql',
      source: 'local',
    } as ISkillFile & { _id: Types.ObjectId };
    const handlers = createSkillsHandlers({
      deleteSkill,
      listSkillFiles: jest.fn(async () => [file]),
      getStrategyFunctions: jest.fn(() => ({ deleteFile: deleteBlob })),
      isValidObjectIdString: jest.fn(() => true),
    } as unknown as SkillsHandlersDeps);
    const req = { params: { id } } as unknown as ServerRequest;
    const res = mockResponse();

    await handlers.delete(req, res);

    expect(deleteSkill).toHaveBeenCalledTimes(2);
    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id, deleted: true, cleanupComplete: true });
  });

  it('returns an evictable response when only non-file cleanup remains incomplete', async () => {
    const id = new Types.ObjectId().toString();
    const incomplete: DeleteSkillResult = {
      deleted: true,
      skillAbsent: true,
      cleanupComplete: false,
      failedCleanupSteps: ['permissions'],
    };
    const deleteSkill = jest.fn(async () => incomplete);
    const handlers = createSkillsHandlers({
      deleteSkill,
      listSkillFiles: jest.fn(async () => []),
      getStrategyFunctions: jest.fn(),
      isValidObjectIdString: jest.fn(() => true),
    } as unknown as SkillsHandlersDeps);
    const req = { params: { id } } as unknown as ServerRequest;
    const res = mockResponse();

    await handlers.delete(req, res);

    expect(deleteSkill).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id, deleted: true, cleanupComplete: false });
  });

  it('awaits blob cleanup and reports a partial deletion when storage rejects it', async () => {
    const id = new Types.ObjectId().toString();
    const deleteBlob = jest.fn(async () => {
      throw new Error('storage unavailable');
    });
    const handlers = createSkillsHandlers({
      deleteSkill: jest.fn(async () => ({
        deleted: true,
        skillAbsent: true,
        cleanupComplete: true,
        failedCleanupSteps: [],
      })),
      listSkillFiles: jest.fn(async () => [
        {
          relativePath: 'references/query.sql',
          filepath: '/uploads/query.sql',
          source: 'local',
        } as ISkillFile & { _id: Types.ObjectId },
      ]),
      getStrategyFunctions: jest.fn(() => ({ deleteFile: deleteBlob })),
      isValidObjectIdString: jest.fn(() => true),
    } as unknown as SkillsHandlersDeps);
    const req = { params: { id } } as unknown as ServerRequest;
    const res = mockResponse();

    await handlers.delete(req, res);

    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id, deleted: true, cleanupComplete: false });
  });
});

describe.each([
  {
    source: 'azure_blob',
    filepath: 'https://example.blob.core.windows.net/files/uploads/author-1/file.txt',
    extractPath: (url: string) => extractAzureBlobPath(url, 'files'),
  },
  {
    source: 'firebase',
    filepath: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/uploads%2Fauthor-1%2Ffile.txt',
    extractPath: extractFirebaseBlobPath,
  },
])(
  'cross-author Skill file deletion through $source storage',
  ({ source, filepath, extractPath }) => {
    it('deletes with the persisted author while the manager remains the requester', async () => {
      const skillId = new Types.ObjectId().toString();
      const file = {
        file_id: 'file-1',
        filepath,
        source,
        author: new Types.ObjectId(),
        relativePath: 'references/file.txt',
      } as ISkillFile & { _id: Types.ObjectId };
      const ownerId = file.author.toString();
      const ownedFilepath = filepath.replace('author-1', ownerId);
      file.filepath = ownedFilepath;
      const deleteBlob = jest.fn().mockResolvedValue(undefined);
      const deleteRagFile = jest.fn().mockResolvedValue(undefined);
      const storageDelete = createOwnedBlobFileDeleter({
        extractPath,
        deleteBlob,
        deleteRagFile,
        isMissing: () => false,
      });
      const deleteSkillFile = jest.fn().mockResolvedValue({ deleted: true });
      const handlers = createSkillsHandlers({
        getSkillFileByPath: jest.fn().mockResolvedValue(file),
        getStrategyFunctions: jest.fn(() => ({ deleteFile: storageDelete })),
        deleteSkillFile,
      } as unknown as SkillsHandlersDeps);
      const req = {
        params: { id: skillId, relativePath: 'references/file.txt' },
        user: { id: 'manager-1' },
      } as unknown as ServerRequest;
      const res = mockResponse();

      await handlers.deleteFile(req, res);

      expect(deleteBlob).toHaveBeenCalledWith(`uploads/${ownerId}/file.txt`);
      expect(deleteRagFile).toHaveBeenCalledWith({
        userId: ownerId,
        file: expect.objectContaining({ user: ownerId }),
      });
      expect(deleteSkillFile).toHaveBeenCalledWith(skillId, 'references/file.txt', 'file-1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  },
);

describe('skill create handler', () => {
  it('retries dependent cleanup after owner permission setup fails', async () => {
    const skillId = new Types.ObjectId();
    const deleteSkill = jest
      .fn()
      .mockResolvedValueOnce({
        deleted: true,
        skillAbsent: true,
        cleanupComplete: false,
        failedCleanupSteps: ['permissions'],
      })
      .mockResolvedValueOnce({
        deleted: false,
        skillAbsent: true,
        cleanupComplete: true,
        failedCleanupSteps: [],
      });
    const handlers = createSkillsHandlers({
      createSkill: jest.fn(async () => ({
        skill: { _id: skillId, name: 'permission-failure' },
        warnings: [],
      })),
      grantPermission: jest.fn(async () => {
        throw new Error('permission unavailable');
      }),
      deleteSkill,
    } as unknown as SkillsHandlersDeps);
    const req = {
      body: { name: 'permission-failure', description: 'Rollback test', body: '# Test' },
      user: { id: 'user-1', _id: new Types.ObjectId(), name: 'Test User' },
    } as unknown as ServerRequest;
    const res = mockResponse();

    await handlers.create(req, res);

    expect(deleteSkill).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('skill file delete handler', () => {
  const id = new Types.ObjectId().toString();
  const file = {
    _id: new Types.ObjectId(),
    file_id: 'file-revision',
    relativePath: 'references/guide.md',
    filepath: '/uploads/guide.md',
    source: 'local',
    author: new Types.ObjectId(),
    tenantId: 'tenant-1',
  } as ISkillFile & { _id: Types.ObjectId };
  const req = {
    params: { id, relativePath: 'references/guide.md' },
  } as unknown as ServerRequest;

  it('waits for blob cleanup before conditionally deleting the file record', async () => {
    let releaseBlob!: () => void;
    const deleteBlob = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseBlob = resolve;
        }),
    );
    const deleteSkillFile = jest.fn(async () => ({ deleted: true }));
    const handlers = createSkillsHandlers({
      getSkillFileByPath: jest.fn(async () => file),
      deleteSkillFile,
      getStrategyFunctions: jest.fn(() => ({ deleteFile: deleteBlob })),
    } as unknown as SkillsHandlersDeps);
    const res = mockResponse();

    const pending = handlers.deleteFile(req, res);
    await Promise.resolve();
    expect(deleteSkillFile).not.toHaveBeenCalled();
    releaseBlob();
    await pending;

    expect(deleteSkillFile).toHaveBeenCalledWith(id, 'references/guide.md', 'file-revision');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('keeps the file record retryable when blob cleanup fails', async () => {
    const deleteSkillFile = jest.fn();
    const handlers = createSkillsHandlers({
      getSkillFileByPath: jest.fn(async () => file),
      deleteSkillFile,
      getStrategyFunctions: jest.fn(() => ({
        deleteFile: jest.fn(async () => {
          throw new Error('storage unavailable');
        }),
      })),
    } as unknown as SkillsHandlersDeps);
    const res = mockResponse();

    await handlers.deleteFile(req, res);

    expect(deleteSkillFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('reports a conflict when a concurrent writer replaces the path', async () => {
    const handlers = createSkillsHandlers({
      getSkillFileByPath: jest.fn(async () => file),
      deleteSkillFile: jest.fn(async () => ({ deleted: false })),
      getStrategyFunctions: jest.fn(() => ({ deleteFile: jest.fn(async () => undefined) })),
    } as unknown as SkillsHandlersDeps);
    const res = mockResponse();

    await handlers.deleteFile(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
