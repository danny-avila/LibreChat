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
});
