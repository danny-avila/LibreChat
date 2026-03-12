import { Readable } from 'stream';
import type { TFile } from 'librechat-data-provider';
import type { CloudFrontFullConfig } from '~/cdn/cloudfront';
import type { ServerRequest } from '~/types';

const mockGetCloudFrontConfig = jest.fn<CloudFrontFullConfig | null, []>();
const mockGetS3Key = jest.fn<string, [string, string, string]>();
const mockSaveBufferToS3 = jest.fn();
const mockSaveURLToS3 = jest.fn();
const mockUploadFileToS3 = jest.fn();
const mockDeleteFileFromS3 = jest.fn();
const mockGetS3FileStream = jest.fn();
const mockExtractKeyFromS3Url = jest.fn<string, [string]>();
const mockCloudFrontSend = jest.fn();
const mockGetSignedUrl = jest.fn<string, [object]>();
const mockLogger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };

jest.mock('~/cdn/cloudfront', () => ({
  getCloudFrontConfig: mockGetCloudFrontConfig,
}));

jest.mock('~/storage/s3/crud', () => ({
  getS3Key: mockGetS3Key,
  saveBufferToS3: mockSaveBufferToS3,
  saveURLToS3: mockSaveURLToS3,
  uploadFileToS3: mockUploadFileToS3,
  deleteFileFromS3: mockDeleteFileFromS3,
  getS3FileStream: mockGetS3FileStream,
  extractKeyFromS3Url: mockExtractKeyFromS3Url,
}));

jest.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: jest.fn().mockImplementation(() => ({ send: mockCloudFrontSend })),
  CreateInvalidationCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@librechat/data-schemas', () => ({ logger: mockLogger }));

jest.mock('~/storage/s3/s3Config', () => ({
  s3Config: { S3_URL_EXPIRY_SECONDS: 900, DEFAULT_BASE_PATH: 'images', AWS_REGION: 'us-east-1' },
}));

function makeConfig(overrides: Partial<CloudFrontFullConfig> = {}): CloudFrontFullConfig {
  return {
    domain: 'https://d123.cloudfront.net',
    invalidateOnDelete: false,
    imageSigning: 'none',
    urlExpiry: 3600,
    privateKey: null,
    keyPairId: null,
    ...overrides,
  };
}

describe('CloudFront CRUD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetS3Key.mockImplementation(
      (basePath, userId, fileName) => `${basePath}/${userId}/${fileName}`,
    );
    mockGetCloudFrontConfig.mockReturnValue(makeConfig());
  });

  describe('getCloudFrontURL', () => {
    it('returns plain CloudFront URL when sign is false (default)', async () => {
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      const url = await getCloudFrontURL({ userId: 'user1', fileName: 'photo.webp' });
      expect(url).toBe('https://d123.cloudfront.net/images/user1/photo.webp');
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('uses custom basePath when provided', async () => {
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      const url = await getCloudFrontURL({
        userId: 'user1',
        fileName: 'doc.pdf',
        basePath: 'documents',
      });
      expect(url).toBe('https://d123.cloudfront.net/documents/user1/doc.pdf');
    });

    it('strips trailing slash from domain', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ domain: 'https://d123.cloudfront.net/' }),
      );
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      const url = await getCloudFrontURL({ userId: 'user1', fileName: 'photo.webp' });
      expect(url).toBe('https://d123.cloudfront.net/images/user1/photo.webp');
    });

    it('strips leading slash from S3 key', async () => {
      mockGetS3Key.mockReturnValue('/images/user1/photo.webp');
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      const url = await getCloudFrontURL({ userId: 'user1', fileName: 'photo.webp' });
      expect(url).toBe('https://d123.cloudfront.net/images/user1/photo.webp');
    });

    it('returns signed URL when sign is true', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ privateKey: 'pk-secret', keyPairId: 'K123' }),
      );
      mockGetSignedUrl.mockReturnValue(
        'https://d123.cloudfront.net/doc.pdf?Policy=abc&Signature=xyz',
      );
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      const url = await getCloudFrontURL({
        userId: 'user1',
        fileName: 'doc.pdf',
        basePath: 'documents',
        sign: true,
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://d123.cloudfront.net/documents/user1/doc.pdf',
          keyPairId: 'K123',
          privateKey: 'pk-secret',
          dateLessThan: expect.any(String),
        }),
      );
      expect(url).toContain('Policy=abc');
    });

    it('uses urlExpiry from config for signed URL', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ privateKey: 'pk', keyPairId: 'K1', urlExpiry: 7200 }),
      );
      mockGetSignedUrl.mockReturnValue('https://d123.cloudfront.net/doc.pdf?signed');
      const before = Date.now();
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      await getCloudFrontURL({ userId: 'u', fileName: 'f.pdf', sign: true });
      const after = Date.now();

      const { dateLessThan } = mockGetSignedUrl.mock.calls[0][0] as { dateLessThan: string };
      const expiry = new Date(dateLessThan).getTime();
      expect(expiry).toBeGreaterThanOrEqual(before + 7200 * 1000);
      expect(expiry).toBeLessThanOrEqual(after + 7200 * 1000 + 100);
    });

    it('falls back to s3Config expiry when urlExpiry not set', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ privateKey: 'pk', keyPairId: 'K1', urlExpiry: undefined as never }), // intentionally invalid input to test runtime guard
      );
      mockGetSignedUrl.mockReturnValue('https://d123.cloudfront.net/doc.pdf?signed');
      const before = Date.now();
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      await getCloudFrontURL({ userId: 'u', fileName: 'f.pdf', sign: true });
      const after = Date.now();

      const { dateLessThan } = mockGetSignedUrl.mock.calls[0][0] as { dateLessThan: string };
      const expiry = new Date(dateLessThan).getTime();
      // 900s fallback from mocked s3Config
      expect(expiry).toBeGreaterThanOrEqual(before + 900 * 1000);
      expect(expiry).toBeLessThanOrEqual(after + 900 * 1000 + 100);
    });

    it('throws when CloudFront is not initialized', async () => {
      mockGetCloudFrontConfig.mockReturnValue(null);
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      await expect(getCloudFrontURL({ userId: 'u', fileName: 'f.png' })).rejects.toThrow(
        'CloudFront not initialized',
      );
    });

    it('throws when signing requested but keys not configured', async () => {
      // config with no keys
      mockGetCloudFrontConfig.mockReturnValue(makeConfig({ privateKey: null, keyPairId: null }));
      const { getCloudFrontURL } = await import('~/storage/cloudfront/crud');
      await expect(
        getCloudFrontURL({ userId: 'u', fileName: 'doc.pdf', sign: true }),
      ).rejects.toThrow('Signing keys not configured');
    });
  });

  describe('saveBufferToCloudFront', () => {
    it('calls saveBufferToS3 with correct params and urlBuilder', async () => {
      mockSaveBufferToS3.mockResolvedValue('https://d123.cloudfront.net/images/u/f.webp');
      const { saveBufferToCloudFront } = await import('~/storage/cloudfront/crud');
      const result = await saveBufferToCloudFront({
        userId: 'u',
        buffer: Buffer.from('data'),
        fileName: 'f.webp',
        basePath: 'images',
      });

      expect(mockSaveBufferToS3).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u',
          buffer: Buffer.from('data'),
          fileName: 'f.webp',
          basePath: 'images',
          urlBuilder: expect.any(Function),
        }),
      );
      expect(result).toBe('https://d123.cloudfront.net/images/u/f.webp');
    });

    it('passes sign=false to urlBuilder by default', async () => {
      let capturedUrlBuilder: ((p: object) => Promise<string>) | null = null;
      mockSaveBufferToS3.mockImplementation(
        ({ urlBuilder }: { urlBuilder: (p: object) => Promise<string> }) => {
          capturedUrlBuilder = urlBuilder;
          return Promise.resolve('https://d123.cloudfront.net/images/u/f.webp');
        },
      );

      const { saveBufferToCloudFront } = await import('~/storage/cloudfront/crud');
      await saveBufferToCloudFront({ userId: 'u', buffer: Buffer.from('x'), fileName: 'f.webp' });

      // urlBuilder invoked without sign should not call getSignedUrl
      await capturedUrlBuilder!({ userId: 'u', fileName: 'f.webp', basePath: 'images' });
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('passes sign=true to urlBuilder when requested', async () => {
      mockGetCloudFrontConfig.mockReturnValue(makeConfig({ privateKey: 'pk', keyPairId: 'K1' }));
      mockGetSignedUrl.mockReturnValue('https://d123.cloudfront.net/images/u/f.webp?signed');

      let capturedUrlBuilder: ((p: object) => Promise<string>) | null = null;
      mockSaveBufferToS3.mockImplementation(
        ({ urlBuilder }: { urlBuilder: (p: object) => Promise<string> }) => {
          capturedUrlBuilder = urlBuilder;
          return Promise.resolve('https://d123.cloudfront.net/images/u/f.webp?signed');
        },
      );

      const { saveBufferToCloudFront } = await import('~/storage/cloudfront/crud');
      await saveBufferToCloudFront({
        userId: 'u',
        buffer: Buffer.from('x'),
        fileName: 'f.webp',
        sign: true,
      });

      await capturedUrlBuilder!({ userId: 'u', fileName: 'f.webp', basePath: 'images' });
      expect(mockGetSignedUrl).toHaveBeenCalled();
    });
  });

  describe('saveURLToCloudFront', () => {
    it('delegates to saveURLToS3 with a urlBuilder', async () => {
      mockSaveURLToS3.mockResolvedValue('https://d123.cloudfront.net/images/u/f.webp');
      const { saveURLToCloudFront } = await import('~/storage/cloudfront/crud');
      const result = await saveURLToCloudFront({
        userId: 'u',
        URL: 'https://external.com/image.jpg',
        fileName: 'f.webp',
      });

      expect(mockSaveURLToS3).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u',
          URL: 'https://external.com/image.jpg',
          fileName: 'f.webp',
          urlBuilder: expect.any(Function),
        }),
      );
      expect(result).toBe('https://d123.cloudfront.net/images/u/f.webp');
    });
  });

  describe('uploadFileToCloudFront', () => {
    it('delegates to uploadFileToS3 with a urlBuilder', async () => {
      const uploadResult = { filepath: 'https://d123.cloudfront.net/images/u/f.pdf', bytes: 1024 };
      mockUploadFileToS3.mockResolvedValue(uploadResult);

      const mockReq = { user: { id: 'u' } } as ServerRequest;
      const mockFile = { path: '/tmp/f.pdf' } as Express.Multer.File;

      const { uploadFileToCloudFront } = await import('~/storage/cloudfront/crud');
      const result = await uploadFileToCloudFront({
        req: mockReq,
        file: mockFile,
        file_id: 'fid-1',
      });

      expect(mockUploadFileToS3).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          file: mockFile,
          file_id: 'fid-1',
          urlBuilder: expect.any(Function),
        }),
      );
      expect(result).toEqual(uploadResult);
    });
  });

  describe('deleteFileFromCloudFront', () => {
    const mockReq = { user: { id: 'u' } } as ServerRequest;
    const mockFile = {
      file_id: 'fid-1',
      filepath: 'https://d123.cloudfront.net/images/u/file.webp',
      source: 'cloudfront',
    } as unknown as TFile;

    beforeEach(() => {
      mockDeleteFileFromS3.mockResolvedValue(undefined);
      mockExtractKeyFromS3Url.mockReturnValue('images/u/file.webp');
    });

    it('calls deleteFileFromS3 to remove the file', async () => {
      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);
      expect(mockDeleteFileFromS3).toHaveBeenCalledWith(mockReq, mockFile);
    });

    it('does not create invalidation when invalidateOnDelete is false', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: false, distributionId: 'E123' }),
      );
      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);
      expect(mockCloudFrontSend).not.toHaveBeenCalled();
    });

    it('does not create invalidation when distributionId is missing', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: true, distributionId: undefined }),
      );
      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);
      expect(mockCloudFrontSend).not.toHaveBeenCalled();
    });

    it('creates CloudFront invalidation when invalidateOnDelete is true', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: true, distributionId: 'E123ABC' }),
      );
      mockCloudFrontSend.mockResolvedValue({});
      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);

      expect(mockCloudFrontSend).toHaveBeenCalledTimes(1);
      const { CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
      expect(CreateInvalidationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          DistributionId: 'E123ABC',
          InvalidationBatch: expect.objectContaining({
            Paths: { Quantity: 1, Items: ['/images/u/file.webp'] },
          }),
        }),
      );
    });

    it('prefixes key with / for invalidation path', async () => {
      mockExtractKeyFromS3Url.mockReturnValue('images/u/file.webp'); // no leading slash
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: true, distributionId: 'E123' }),
      );
      mockCloudFrontSend.mockResolvedValue({});

      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);

      const { CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
      expect(CreateInvalidationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          InvalidationBatch: expect.objectContaining({
            Paths: expect.objectContaining({ Items: ['/images/u/file.webp'] }),
          }),
        }),
      );
    });

    it('does not re-prefix path that already has leading slash', async () => {
      mockExtractKeyFromS3Url.mockReturnValue('/images/u/file.webp'); // already has slash
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: true, distributionId: 'E123' }),
      );
      mockCloudFrontSend.mockResolvedValue({});

      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await deleteFileFromCloudFront(mockReq, mockFile);

      const { CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
      expect(CreateInvalidationCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          InvalidationBatch: expect.objectContaining({
            Paths: expect.objectContaining({ Items: ['/images/u/file.webp'] }),
          }),
        }),
      );
    });

    it('logs error and continues when invalidation fails', async () => {
      mockGetCloudFrontConfig.mockReturnValue(
        makeConfig({ invalidateOnDelete: true, distributionId: 'E123' }),
      );
      mockCloudFrontSend.mockRejectedValue(new Error('Access denied'));

      const { deleteFileFromCloudFront } = await import('~/storage/cloudfront/crud');
      await expect(deleteFileFromCloudFront(mockReq, mockFile)).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[deleteFileFromCloudFront] Cache invalidation failed:'),
        'Access denied',
      );
    });
  });

  describe('getCloudFrontFileStream', () => {
    it('delegates to getS3FileStream', async () => {
      const readable = new Readable();
      mockGetS3FileStream.mockResolvedValue(readable);

      const mockReq = { user: { id: 'u' } } as ServerRequest;
      const { getCloudFrontFileStream } = await import('~/storage/cloudfront/crud');
      const result = await getCloudFrontFileStream(
        mockReq,
        'https://d123.cloudfront.net/images/u/f.webp',
      );

      expect(mockGetS3FileStream).toHaveBeenCalledWith(
        mockReq,
        'https://d123.cloudfront.net/images/u/f.webp',
      );
      expect(result).toBe(readable);
    });
  });
});
