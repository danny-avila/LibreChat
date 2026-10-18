import path from 'node:path';
import { tmpdir } from 'node:os';
import { FileSources } from 'librechat-data-provider';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { createDeleteFileWithSecondaryStorage, isMissingStorageError } from './storage';

const req = { user: { id: 'owner', tenantId: 'tenant-a' } };
const client = { provider: 'openai' };
const file = {
  file_id: 'attachment',
  user: 'owner',
  tenantId: 'tenant-a',
  embedded: true,
  metadata: { codeEnvRef: { file_id: 'code-copy' } },
};

function setup(source: string = FileSources.local) {
  const primary = jest.fn().mockResolvedValue(undefined);
  const vectors = jest.fn().mockResolvedValue(undefined);
  const code = jest.fn().mockResolvedValue(undefined);
  const getDeleteFile = jest.fn((secondary: string) =>
    secondary === FileSources.vectordb ? vectors : code,
  );
  const logger = { warn: jest.fn() };
  const remove = createDeleteFileWithSecondaryStorage<typeof req, typeof file, typeof client>({
    source,
    deleteFile: primary,
    getDeleteFile,
    logger,
  });
  return { primary, vectors, code, getDeleteFile, logger, remove };
}

describe('createDeleteFileWithSecondaryStorage', () => {
  it('waits for both secondaries before deleting the primary with its provider client', async () => {
    const { primary, vectors, code, remove } = setup(FileSources.openai);
    let finishCode: () => void = () => {};
    const pendingCode = new Promise<void>((resolve) => {
      finishCode = resolve;
    });
    code.mockReturnValue(pendingCode);

    const deletion = remove(req, file, client);
    expect(vectors).toHaveBeenCalledWith(req, file);
    expect(code).toHaveBeenCalledWith(req, file);
    expect(primary).not.toHaveBeenCalled();
    finishCode();
    await deletion;

    expect(primary).toHaveBeenCalledTimes(1);
    expect(primary).toHaveBeenCalledWith(req, file, client);
    expect(file.user).toBe('owner');
    expect(file.tenantId).toBe('tenant-a');
  });

  it.each([401, 403, 500])('keeps primary bytes on HTTP %s', async (status) => {
    const { primary, code, remove } = setup();
    const dir = await mkdtemp(path.join(tmpdir(), 'file-delete-'));
    const primaryPath = path.join(dir, 'attachment.png');
    try {
      await writeFile(primaryPath, 'readable attachment');
      primary.mockImplementation(() => unlink(primaryPath));
      const error = Object.assign(new Error('secondary unavailable'), { response: { status } });
      code.mockRejectedValue(error);

      await expect(remove(req, file)).rejects.toBe(error);
      expect(primary).not.toHaveBeenCalled();
      expect(await readFile(primaryPath, 'utf8')).toBe('readable attachment');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('retries partial secondary cleanup without skipping the primary', async () => {
    const { primary, vectors, code, remove } = setup();
    const failure = new Error('code unavailable');
    const absent = Object.assign(new Error('already removed'), {
      code: 'ERR_BAD_REQUEST',
      response: { status: 404 },
    });
    vectors.mockResolvedValueOnce(undefined).mockRejectedValueOnce(absent);
    code.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);

    await expect(remove(req, file)).rejects.toBe(failure);
    expect(primary).not.toHaveBeenCalled();
    await expect(remove(req, file)).resolves.toBeUndefined();
    expect(vectors).toHaveBeenCalledTimes(2);
    expect(code).toHaveBeenCalledTimes(2);
    expect(primary).toHaveBeenCalledTimes(1);
  });

  it('does not let a missing secondary hide a failure in another secondary', async () => {
    const { primary, vectors, code, remove } = setup();
    vectors.mockRejectedValue(Object.assign(new Error('missing'), { status: 404 }));
    const failure = new Error('permission denied');
    code.mockRejectedValue(failure);

    await expect(remove(req, file)).rejects.toBe(failure);
    expect(primary).not.toHaveBeenCalled();
  });

  it('settles every secondary before returning a failure', async () => {
    const { primary, vectors, code, remove } = setup();
    const failure = new Error('vector unavailable');
    vectors.mockRejectedValue(failure);
    let finishCode: () => void = () => {};
    const pendingCode = new Promise<void>((resolve) => {
      finishCode = resolve;
    });
    code.mockReturnValue(pendingCode);
    let settled = false;
    const deletion = remove(req, file).catch((error) => {
      settled = true;
      return error;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(primary).not.toHaveBeenCalled();
    finishCode();
    expect(await deletion).toBe(failure);
  });

  it('retries after primary failure even when both secondaries have already gone', async () => {
    const { primary, vectors, code, remove } = setup();
    const failure = new Error('primary permission denied');
    primary.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const absent = Object.assign(new Error('absent'), { code: 'NotFound' });
    vectors.mockResolvedValueOnce(undefined).mockRejectedValueOnce(absent);
    code.mockResolvedValueOnce(undefined).mockRejectedValueOnce(absent);

    await expect(remove(req, file)).rejects.toBe(failure);
    await expect(remove(req, file)).resolves.toBeUndefined();
    expect(primary).toHaveBeenCalledTimes(2);
  });

  it('logs only safe metadata for an already-removed secondary', async () => {
    const { vectors, logger, remove } = setup();
    vectors.mockRejectedValue(
      Object.assign(new Error('private provider message'), {
        response: { status: 404, data: 'private provider payload' },
      }),
    );
    await remove(req, file);
    expect(logger.warn).toHaveBeenCalledWith('File storage was already missing during delete', {
      type: 'Error',
      status: 404,
    });
  });

  it('accepts an absent primary only after the secondaries are cleaned up', async () => {
    const { primary, vectors, code, remove } = setup();
    primary.mockRejectedValue(Object.assign(new Error('absent'), { code: 'ENOENT' }));

    await expect(remove(req, file)).resolves.toBeUndefined();
    expect(vectors).toHaveBeenCalledTimes(1);
    expect(code).toHaveBeenCalledTimes(1);
  });

  it.each([FileSources.vectordb, FileSources.execute_code])(
    'does not delete the primary %s source twice',
    async (source) => {
      const { primary, getDeleteFile, remove } = setup(source);
      await remove(req, file, client);
      expect(getDeleteFile).not.toHaveBeenCalledWith(source);
      expect(getDeleteFile).toHaveBeenCalledTimes(1);
      expect(primary).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the codeEnvRefs map without changing the owner or provider references', async () => {
    const { primary, code } = setup();
    const mapped = {
      ...file,
      embedded: false,
      metadata: { codeEnvRefs: { stateful: { file_id: 'stateful-copy' } } },
    };
    const deleteMapped = createDeleteFileWithSecondaryStorage({
      source: FileSources.local,
      deleteFile: primary,
      getDeleteFile: () => code,
      logger: { warn: jest.fn() },
    });
    await deleteMapped(req, mapped);
    expect(code).toHaveBeenCalledWith(req, mapped);
    expect(mapped.metadata.codeEnvRefs.stateful.file_id).toBe('stateful-copy');
    expect(mapped.user).toBe('owner');
    expect(mapped.tenantId).toBe('tenant-a');
  });

  it('only deletes primary storage for a file without secondary references', async () => {
    const { primary, getDeleteFile } = setup();
    const remove = createDeleteFileWithSecondaryStorage({
      source: FileSources.local,
      deleteFile: primary,
      getDeleteFile,
      logger: { warn: jest.fn() },
    });
    await remove(req, {});
    expect(getDeleteFile).not.toHaveBeenCalled();
    expect(primary).toHaveBeenCalledWith(req, {}, undefined);
  });
});

describe('isMissingStorageError', () => {
  it.each([
    { code: 'ENOENT' },
    { code: 'NoSuchKey' },
    { code: 'NotFound' },
    { code: 'ResourceNotFound' },
    { status: 404 },
    { statusCode: '404' },
    { code: 'ERR_BAD_REQUEST', response: { status: 404 } },
    new Error('blob does not exist'),
  ])('recognizes an absent object: %j', (error) => {
    expect(isMissingStorageError(error)).toBe(true);
  });

  it.each([
    null,
    undefined,
    { response: { status: 401 } },
    { response: { status: 403 } },
    { response: { status: 500 } },
    { code: 'ETIMEDOUT' },
    { code: 'EACCES' },
    new Error('Configuration not found'),
  ])('does not forgive operational failures: %j', (error) => {
    expect(isMissingStorageError(error)).toBe(false);
  });
});
