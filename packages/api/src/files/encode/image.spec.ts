import { Readable } from 'node:stream';
import { FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { AttachmentStorageError, tryEncodeImageFromStorage } from './image';

const file = {
  file_id: 'image-1',
  filepath: 'https://storage.example/image.png?signature=secret',
  storageKey: 'images/user/image.png',
  filename: 'image.png',
  type: 'image/png',
  bytes: 4,
  source: FileSources.s3,
} as IMongoFile;

describe('tryEncodeImageFromStorage', () => {
  it.each([FileSources.s3, FileSources.cloudfront, FileSources.azure_blob, FileSources.firebase])(
    'encodes %s images through the storage strategy',
    async (source) => {
      const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
      const getStrategyFunctions = jest.fn(() => ({ getDownloadStream }) as StrategyFunctions);

      await expect(
        tryEncodeImageFromStorage(
          {} as ServerRequest,
          { ...file, source } as IMongoFile,
          {},
          getStrategyFunctions,
        ),
      ).resolves.toEqual([
        expect.objectContaining({ source }),
        Buffer.from('image').toString('base64'),
      ]);
      expect(getDownloadStream).toHaveBeenCalledWith(expect.anything(), file.storageKey);
    },
  );

  it('leaves non-storage image sources to the caller', async () => {
    const getStrategyFunctions = jest.fn();

    await expect(
      tryEncodeImageFromStorage(
        {} as ServerRequest,
        { ...file, source: FileSources.local } as IMongoFile,
        {},
        getStrategyFunctions,
      ),
    ).resolves.toBeNull();
    expect(getStrategyFunctions).not.toHaveBeenCalled();
  });

  it('preserves the actionable missing-object error', async () => {
    const getStrategyFunctions = () =>
      ({
        getDownloadStream: jest.fn().mockRejectedValue({ name: 'NoSuchKey' }),
      }) as StrategyFunctions;

    await expect(
      tryEncodeImageFromStorage({} as ServerRequest, file, {}, getStrategyFunctions),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_OBJECT_NOT_FOUND', fileId: 'image-1' });
  });

  it('discards buffered image bytes and hides storage error details', async () => {
    const failure = new Error('private storage path');
    const stream = new Readable({
      read() {
        this.push(Buffer.from('private-image-bytes'));
        this.destroy(failure);
      },
    });
    const getStrategyFunctions = () =>
      ({ getDownloadStream: jest.fn().mockResolvedValue(stream) }) as StrategyFunctions;

    await expect(
      tryEncodeImageFromStorage({} as ServerRequest, file, {}, getStrategyFunctions),
    ).rejects.toEqual(expect.any(AttachmentStorageError));
    expect(failure).not.toHaveProperty('bufferedData');
  });
});
