import { Readable } from 'node:stream';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { AttachmentObjectNotFoundError, getFileStream } from './utils';

const file = {
  file_id: 'file-1',
  filepath: 's3://bucket/file-1',
  filename: 'document.pdf',
  type: 'application/pdf',
  bytes: 4,
  source: 's3',
} as IMongoFile;

describe('getFileStream', () => {
  it('maps a missing storage object to a user-actionable attachment error', async () => {
    const getDownloadStream = jest.fn().mockRejectedValue({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });

    await expect(
      getFileStream(
        {} as ServerRequest,
        file,
        {},
        () => ({ getDownloadStream }) as StrategyFunctions,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AttachmentObjectNotFoundError>>({
        code: 'ATTACHMENT_OBJECT_NOT_FOUND',
        fileId: 'file-1',
      }),
    );
  });

  it.each([{ response: { status: 404 } }, { status: 404 }, { statusCode: 404 }])(
    'maps HTTP-style missing storage errors to the attachment error',
    async (storageError) => {
      const getDownloadStream = jest.fn().mockRejectedValue(storageError);

      await expect(
        getFileStream(
          {} as ServerRequest,
          file,
          {},
          () => ({ getDownloadStream }) as StrategyFunctions,
        ),
      ).rejects.toMatchObject({ code: 'ATTACHMENT_OBJECT_NOT_FOUND', fileId: 'file-1' });
    },
  );

  it('preserves non-missing storage failures', async () => {
    const failure = new Error('storage unavailable');
    const getDownloadStream = jest.fn().mockRejectedValue(failure);

    await expect(
      getFileStream(
        {} as ServerRequest,
        file,
        {},
        () => ({ getDownloadStream }) as StrategyFunctions,
      ),
    ).rejects.toBe(failure);
  });

  it('discards image bytes buffered before a stream failure', async () => {
    const failure = new Error('stream failed');
    const stream = new Readable({
      read() {
        this.push(Buffer.from('private-image-bytes'));
        this.destroy(failure);
      },
    });
    const getDownloadStream = jest.fn().mockResolvedValue(stream);

    await expect(
      getFileStream(
        {} as ServerRequest,
        file,
        {},
        () => ({ getDownloadStream }) as StrategyFunctions,
      ),
    ).rejects.toBe(failure);
    expect(failure).not.toHaveProperty('bufferedData');
  });

  it('encodes available storage content', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('data')));

    await expect(
      getFileStream(
        {} as ServerRequest,
        file,
        {},
        () => ({ getDownloadStream }) as StrategyFunctions,
      ),
    ).resolves.toMatchObject({ content: Buffer.from('data').toString('base64') });
  });

  it('prefers the canonical storage key over a path-style presigned URL', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
    const storedFile = {
      ...file,
      filepath:
        'https://minio.example.com/librechat/uploads/user%201/image%20one.png?X-Amz-Credential=secret&X-Amz-Signature=signed',
      storageKey: 'uploads/user 1/image one.png',
    } as IMongoFile;
    const req = {} as ServerRequest;

    await getFileStream(req, storedFile, {}, () => ({ getDownloadStream }) as StrategyFunctions);

    expect(getDownloadStream).toHaveBeenCalledWith(req, storedFile.storageKey);
  });

  it('passes the legacy filepath when no storage key was recorded', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
    const legacyUrl =
      'https://minio.example.com/librechat/uploads/user%201/image.png?X-Amz-Signature=signed';
    const req = {} as ServerRequest;

    await getFileStream(
      req,
      { ...file, filepath: legacyUrl },
      {},
      () =>
        ({
          getDownloadStream,
        }) as StrategyFunctions,
    );

    expect(getDownloadStream).toHaveBeenCalledWith(req, legacyUrl);
  });

  it.each(['s3', 'cloudfront', 'azure_blob', 'firebase'])(
    'keeps the filepath fallback for %s records without a storage key',
    async (source) => {
      const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
      const filepath = `https://storage.example/${source}/image.png?token=signed`;
      const req = {} as ServerRequest;

      await getFileStream(
        req,
        { ...file, source, filepath } as IMongoFile,
        {},
        () =>
          ({
            getDownloadStream,
          }) as StrategyFunctions,
      );

      expect(getDownloadStream).toHaveBeenCalledWith(req, filepath);
    },
  );
});
