import type { StoredUploadRef } from './orphan';
import { withStoredUploadCleanup } from './orphan';

const stored: StoredUploadRef = {
  file_id: 'file-1',
  filepath: 'https://bucket.example/images/user/file-1.png',
  source: 's3',
  storageKey: 'images/user/file-1.png',
};

describe('withStoredUploadCleanup', () => {
  const logger = { error: jest.fn() };
  const req = { user: { id: 'u1' } };
  beforeEach(() => logger.error.mockClear());

  it('returns the result without resolving or calling delete when the next step succeeds', async () => {
    const deleteFile = jest.fn();
    const resolveDeleteFile = jest.fn(() => deleteFile);
    await expect(
      withStoredUploadCleanup({ stored, resolveDeleteFile, req, logger }, async () => 'ok'),
    ).resolves.toBe('ok');
    expect(resolveDeleteFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('deletes the stored object and rethrows the original error when the next step fails', async () => {
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(
        { stored, resolveDeleteFile: () => deleteFile, req, logger },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(deleteFile).toHaveBeenCalledWith(req, stored);
  });

  it('logs a failed cleanup without replacing the original error', async () => {
    const deleteFile = jest.fn().mockRejectedValue(new Error('storage down'));
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(
        { stored, resolveDeleteFile: () => deleteFile, req, logger },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs a failing resolver without replacing the original error', async () => {
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(
        {
          stored,
          resolveDeleteFile: () => {
            throw new Error('no strategy');
          },
          req,
          logger,
        },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the strategy has no delete function', async () => {
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(
        { stored, resolveDeleteFile: () => undefined, req, logger },
        async () => {
          throw failure;
        },
      ),
    ).rejects.toBe(failure);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
