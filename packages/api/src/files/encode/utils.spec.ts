import { Readable } from 'node:stream';
import { Providers } from '@librechat/agents';
import type { ServerRequest } from '~/types';
import { AttachmentObjectNotFoundError, getFileStream, isConfiguredProviderMediaType } from './utils';

const file = {
  file_id: 'file-1',
  filepath: 's3://bucket/file-1',
  filename: 'document.pdf',
  type: 'application/pdf',
  bytes: 4,
  source: 's3',
};

describe('getFileStream', () => {
  it('maps a missing storage object to a user-actionable attachment error', async () => {
    const getDownloadStream = jest.fn().mockRejectedValue({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    });

    await expect(
      getFileStream({} as ServerRequest, file, {}, () => ({ getDownloadStream })),
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
        getFileStream({} as ServerRequest, file, {}, () => ({ getDownloadStream })),
      ).rejects.toMatchObject({ code: 'ATTACHMENT_OBJECT_NOT_FOUND', fileId: 'file-1' });
    },
  );

  it('preserves non-missing storage failures', async () => {
    const failure = new Error('storage unavailable');
    const getDownloadStream = jest.fn().mockRejectedValue(failure);

    await expect(
      getFileStream({} as ServerRequest, file, {}, () => ({ getDownloadStream })),
    ).rejects.toBe(failure);
  });

  it('encodes available storage content', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('data')));

    await expect(
      getFileStream({} as ServerRequest, file, {}, () => ({ getDownloadStream })),
    ).resolves.toMatchObject({ content: Buffer.from('data').toString('base64') });
  });

  it.each([
    '',
    'https://minio.example.com/librechat/uploads/user%201/image%20one.png?X-Amz-Credential=secret&X-Amz-Signature=signed',
  ])('reads the canonical storage key with filepath %s', async (filepath) => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
    const storedFile = {
      ...file,
      filepath,
      storageKey: 'uploads/user 1/image one.png',
    };
    const req = {} as ServerRequest;

    await getFileStream(req, storedFile, {}, () => ({ getDownloadStream }));

    expect(getDownloadStream).toHaveBeenCalledWith(req, storedFile.storageKey);
  });

  it('passes the legacy filepath when no storage key was recorded', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue(Readable.from(Buffer.from('image')));
    const legacyUrl =
      'https://minio.example.com/librechat/uploads/user%201/image.png?X-Amz-Signature=signed';
    const req = {} as ServerRequest;

    await getFileStream(req, { ...file, filepath: legacyUrl }, {}, () => ({ getDownloadStream }));

    expect(getDownloadStream).toHaveBeenCalledWith(req, legacyUrl);
  });
});

/** Uses the real data-provider merge logic so the "inherited default" identity check is exercised. */
const reqWith = (fileConfig: unknown): ServerRequest =>
  ({ config: fileConfig === undefined ? undefined : { fileConfig } }) as unknown as ServerRequest;

describe('isConfiguredProviderMediaType', () => {
  const params = { provider: Providers.OPENAI, endpoint: 'MyGateway' };

  it('is false without any fileConfig', () => {
    expect(isConfiguredProviderMediaType(reqWith(undefined), params, 'video/mp4')).toBe(false);
  });

  it('is false when the endpoint only inherits the built-in default list', () => {
    const req = reqWith({ endpoints: { OtherEndpoint: { fileLimit: 3 } } });
    expect(isConfiguredProviderMediaType(req, params, 'video/mp4')).toBe(false);
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(false);
  });

  it('is true when the endpoint config explicitly lists the media type', () => {
    const req = reqWith({
      endpoints: { MyGateway: { supportedMimeTypes: ['image/.*', 'application/pdf', 'video/.*'] } },
    });
    expect(isConfiguredProviderMediaType(req, params, 'video/mp4')).toBe(true);
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(false);
  });

  it('is true for a permissive config', () => {
    const req = reqWith({ endpoints: { MyGateway: { supportedMimeTypes: ['.*'] } } });
    expect(isConfiguredProviderMediaType(req, params, 'audio/wav')).toBe(true);
  });

  it('falls back to the provider key when no endpoint is given', () => {
    const req = reqWith({ endpoints: { openAI: { supportedMimeTypes: ['audio/.*'] } } });
    expect(isConfiguredProviderMediaType(req, { provider: Providers.OPENAI }, 'audio/wav')).toBe(
      true,
    );
  });
});
