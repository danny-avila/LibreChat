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
  beforeEach(() => logger.error.mockClear());

  it('returns the result and keeps the stored object when the next step succeeds', async () => {
    const deleteFile = jest.fn();
    await expect(
      withStoredUploadCleanup(stored, { deleteFile, req: {}, logger }, async () => 'ok'),
    ).resolves.toBe('ok');
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('deletes the stored object and rethrows the original error when the next step fails', async () => {
    const deleteFile = jest.fn().mockResolvedValue(undefined);
    const req = { user: { id: 'u1' } };
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(stored, { deleteFile, req, logger }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(deleteFile).toHaveBeenCalledWith(req, stored);
  });

  it('logs a failed cleanup without replacing the original error', async () => {
    const deleteFile = jest.fn().mockRejectedValue(new Error('storage down'));
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(stored, { deleteFile, req: {}, logger }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('rethrows when the strategy has no delete function', async () => {
    const failure = new Error('createFile failed');
    await expect(
      withStoredUploadCleanup(stored, { req: {}, logger }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
