import fs from 'fs';
import { Readable } from 'stream';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamMixin } from '@smithy/util-stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { FileSources } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';
import type { MongoFile, S3FileRef } from '../../types';

const s3Mock = mockClient(S3Client);

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    stat: jest.fn(),
    unlink: jest.fn(),
  },
  createReadStream: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://bucket.s3.amazonaws.com/test-key?signed=true'),
}));

jest.mock('../../../files', () => ({
  deleteRagFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { deleteRagFile } from '../../../files';
import { logger } from '@librechat/data-schemas';

describe('S3 CRUD', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_BUCKET_NAME = 'test-bucket';
    process.env.S3_URL_EXPIRY_SECONDS = '120';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    const stream = new Readable();
    stream.push('test content');
    stream.push(null);
    const sdkStream = sdkStreamMixin(stream);
    s3Mock.on(GetObjectCommand).resolves({ Body: sdkStream });

    jest.clearAllMocks();
  });

  describe('getS3Key', () => {
    it('constructs key from basePath, userId, and fileName', async () => {
      const { getS3Key } = await import('../crud');
      const key = getS3Key('images', 'user123', 'file.png');
      expect(key).toBe('images/user123/file.png');
    });

    it('handles nested file names', async () => {
      const { getS3Key } = await import('../crud');
      const key = getS3Key('files', 'user456', 'folder/subfolder/doc.pdf');
      expect(key).toBe('files/user456/folder/subfolder/doc.pdf');
    });
  });

  describe('saveBufferToS3', () => {
    it('uploads buffer and returns signed URL', async () => {
      const { saveBufferToS3 } = await import('../crud');
      const result = await saveBufferToS3({
        userId: 'user123',
        buffer: Buffer.from('test'),
        fileName: 'test.txt',
        basePath: 'files',
      });
      expect(result).toContain('signed=true');
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
    });

    it('calls PutObjectCommand with correct parameters', async () => {
      const { saveBufferToS3 } = await import('../crud');
      await saveBufferToS3({
        userId: 'user123',
        buffer: Buffer.from('test content'),
        fileName: 'document.pdf',
        basePath: 'documents',
      });

      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'test-bucket',
        Key: 'documents/user123/document.pdf',
        Body: Buffer.from('test content'),
      });
    });

    it('uses default basePath if not provided', async () => {
      const { saveBufferToS3 } = await import('../crud');
      await saveBufferToS3({
        userId: 'user123',
        buffer: Buffer.from('test'),
        fileName: 'test.txt',
      });

      const calls = s3Mock.commandCalls(PutObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('images/user123/test.txt');
    });

    it('handles S3 upload errors', async () => {
      s3Mock.on(PutObjectCommand).rejects(new Error('S3 upload failed'));

      const { saveBufferToS3 } = await import('../crud');
      await expect(
        saveBufferToS3({
          userId: 'user123',
          buffer: Buffer.from('test'),
          fileName: 'test.txt',
        }),
      ).rejects.toThrow('S3 upload failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[saveBufferToS3] Error uploading buffer to S3:',
        'S3 upload failed',
      );
    });
  });

  describe('getS3URL', () => {
    it('returns signed URL', async () => {
      const { getS3URL } = await import('../crud');
      const result = await getS3URL({
        userId: 'user123',
        fileName: 'test.txt',
        basePath: 'files',
      });
      expect(result).toContain('signed=true');
    });

    it('adds custom filename to Content-Disposition header', async () => {
      const { getS3URL } = await import('../crud');
      await getS3URL({
        userId: 'user123',
        fileName: 'test.pdf',
        customFilename: 'custom-name.pdf',
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            ResponseContentDisposition: 'attachment; filename="custom-name.pdf"',
          }),
        }),
        expect.anything(),
      );
    });

    it('adds custom content type', async () => {
      const { getS3URL } = await import('../crud');
      await getS3URL({
        userId: 'user123',
        fileName: 'test.pdf',
        contentType: 'application/pdf',
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: expect.objectContaining({
            ResponseContentType: 'application/pdf',
          }),
        }),
        expect.anything(),
      );
    });

    it('handles errors when getting signed URL', async () => {
      (getSignedUrl as jest.Mock).mockRejectedValueOnce(new Error('Failed to sign URL'));

      const { getS3URL } = await import('../crud');
      await expect(
        getS3URL({
          userId: 'user123',
          fileName: 'file.pdf',
        }),
      ).rejects.toThrow('Failed to sign URL');

      expect(logger.error).toHaveBeenCalledWith(
        '[getS3URL] Error getting signed URL from S3:',
        'Failed to sign URL',
      );
    });
  });

  describe('saveURLToS3', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      }) as unknown as typeof fetch;
    });

    it('fetches file from URL and saves to S3', async () => {
      const { saveURLToS3 } = await import('../crud');
      const result = await saveURLToS3({
        userId: 'user123',
        URL: 'https://example.com/image.jpg',
        fileName: 'downloaded.jpg',
      });

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/image.jpg');
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
      expect(result).toContain('signed=true');
    });

    it('handles fetch errors', async () => {
      (global.fetch as unknown as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { saveURLToS3 } = await import('../crud');
      await expect(
        saveURLToS3({
          userId: 'user123',
          URL: 'https://example.com/image.jpg',
          fileName: 'downloaded.jpg',
        }),
      ).rejects.toThrow('Network error');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('deleteFileFromS3', () => {
    const mockReq = { user: { id: 'user123' } } as ServerRequest;

    it('deletes a file from S3', async () => {
      const mockFile = {
        filepath: 'https://bucket.s3.amazonaws.com/images/user123/file.jpg',
        file_id: 'file123',
      } as MongoFile;

      s3Mock.on(HeadObjectCommand).resolvesOnce({}).rejectsOnce({ name: 'NotFound' });

      const { deleteFileFromS3 } = await import('../crud');
      await deleteFileFromS3(mockReq, mockFile);

      expect(deleteRagFile).toHaveBeenCalledWith({ userId: 'user123', file: mockFile });
      expect(s3Mock.commandCalls(HeadObjectCommand)).toHaveLength(2);
      expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    });

    it('handles file not found gracefully', async () => {
      const mockFile = {
        filepath: 'https://bucket.s3.amazonaws.com/images/user123/nonexistent.jpg',
        file_id: 'file123',
      } as MongoFile;

      s3Mock.on(HeadObjectCommand).rejects({ name: 'NotFound' });

      const { deleteFileFromS3 } = await import('../crud');
      await deleteFileFromS3(mockReq, mockFile);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('throws error if user ID does not match', async () => {
      const mockFile = {
        filepath: 'https://bucket.s3.amazonaws.com/images/different-user/file.jpg',
        file_id: 'file123',
      } as MongoFile;

      const { deleteFileFromS3 } = await import('../crud');
      await expect(deleteFileFromS3(mockReq, mockFile)).rejects.toThrow('User ID mismatch');
      expect(logger.error).toHaveBeenCalled();
    });

    it('handles NoSuchKey error', async () => {
      const mockFile = {
        filepath: 'https://bucket.s3.amazonaws.com/images/user123/file.jpg',
        file_id: 'file123',
      } as MongoFile;

      s3Mock.on(HeadObjectCommand).resolvesOnce({});
      const noSuchKeyError = Object.assign(new Error('NoSuchKey'), { code: 'NoSuchKey' });
      s3Mock.on(DeleteObjectCommand).rejects(noSuchKeyError);

      const { deleteFileFromS3 } = await import('../crud');
      await expect(deleteFileFromS3(mockReq, mockFile)).resolves.toBeUndefined();
    });
  });

  describe('uploadFileToS3', () => {
    const mockReq = { user: { id: 'user123' } } as ServerRequest;

    it('uploads a file from disk to S3', async () => {
      const mockFile = {
        path: '/tmp/upload.jpg',
        originalname: 'photo.jpg',
      } as Express.Multer.File;

      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 1024 });
      (fs.createReadStream as jest.Mock).mockReturnValue(new Readable());

      const { uploadFileToS3 } = await import('../crud');
      const result = await uploadFileToS3({
        req: mockReq,
        file: mockFile,
        file_id: 'file123',
        basePath: 'images',
      });

      expect(result).toEqual({
        filepath: expect.stringContaining('signed=true'),
        bytes: 1024,
      });
      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/upload.jpg');
      expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
    });

    it('handles upload errors and cleans up temp file', async () => {
      const mockFile = {
        path: '/tmp/upload.jpg',
        originalname: 'photo.jpg',
      } as Express.Multer.File;

      (fs.promises.stat as jest.Mock).mockResolvedValue({ size: 1024 });
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);
      (fs.createReadStream as jest.Mock).mockReturnValue(new Readable());
      s3Mock.on(PutObjectCommand).rejects(new Error('Upload failed'));

      const { uploadFileToS3 } = await import('../crud');
      await expect(
        uploadFileToS3({
          req: mockReq,
          file: mockFile,
          file_id: 'file123',
        }),
      ).rejects.toThrow('Upload failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[uploadFileToS3] Error streaming file to S3:',
        expect.any(Error),
      );
    });
  });

  describe('getS3FileStream', () => {
    it('returns a readable stream for a file', async () => {
      const { getS3FileStream } = await import('../crud');
      const result = await getS3FileStream(
        {} as ServerRequest,
        'https://bucket.s3.amazonaws.com/images/user123/file.pdf',
      );

      expect(result).toBeInstanceOf(Readable);
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
    });

    it('handles errors when retrieving stream', async () => {
      s3Mock.on(GetObjectCommand).rejects(new Error('Stream error'));

      const { getS3FileStream } = await import('../crud');
      await expect(getS3FileStream({} as ServerRequest, 'images/user123/file.pdf')).rejects.toThrow(
        'Stream error',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('needsRefresh', () => {
    it('returns false for non-signed URLs', async () => {
      const { needsRefresh } = await import('../crud');
      const result = needsRefresh('https://example.com/file.png', 3600);
      expect(result).toBe(false);
    });

    it('returns true when URL is expired', async () => {
      const { needsRefresh } = await import('../crud');
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const url = `https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=3600`;
      const result = needsRefresh(url, 3600);
      expect(result).toBe(true);
    });

    it('returns false when URL is not close to expiration', async () => {
      const { needsRefresh } = await import('../crud');
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      const dateStr = futureDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const url = `https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=7200`;
      const result = needsRefresh(url, 60);
      expect(result).toBe(false);
    });

    it('returns true when missing expiration parameters', async () => {
      const { needsRefresh } = await import('../crud');
      const url = 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc';
      const result = needsRefresh(url, 3600);
      expect(result).toBe(true);
    });

    it('returns true for malformed URLs', async () => {
      const { needsRefresh } = await import('../crud');
      const result = needsRefresh('not-a-valid-url', 3600);
      expect(result).toBe(true);
    });
  });

  describe('getNewS3URL', () => {
    it('generates a new URL from an existing S3 URL', async () => {
      const { getNewS3URL } = await import('../crud');
      const result = await getNewS3URL(
        'https://bucket.s3.amazonaws.com/images/user123/file.jpg?signature=old',
      );

      expect(result).toContain('signed=true');
    });

    it('returns undefined for invalid URLs', async () => {
      const { getNewS3URL } = await import('../crud');
      const result = await getNewS3URL('simple-file.txt');
      expect(result).toBeUndefined();
    });

    it('returns undefined when key has insufficient parts', async () => {
      const { getNewS3URL } = await import('../crud');
      // Key with only 2 parts (basePath/userId but no fileName)
      const result = await getNewS3URL('https://bucket.s3.amazonaws.com/images/user123');
      expect(result).toBeUndefined();
    });
  });

  describe('refreshS3FileUrls', () => {
    it('refreshes expired URLs for multiple files', async () => {
      const { refreshS3FileUrls } = await import('../crud');

      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const files = [
        {
          file_id: 'file1',
          source: FileSources.s3,
          filepath: `https://bucket.s3.amazonaws.com/images/user123/file1.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
        },
        {
          file_id: 'file2',
          source: FileSources.s3,
          filepath: `https://bucket.s3.amazonaws.com/images/user456/file2.jpg?X-Amz-Signature=def&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
        },
      ];

      const mockBatchUpdate = jest.fn().mockResolvedValue(undefined);

      const result = await refreshS3FileUrls(files as MongoFile[], mockBatchUpdate, 60);

      expect(result[0].filepath).toContain('signed=true');
      expect(result[1].filepath).toContain('signed=true');
      expect(mockBatchUpdate).toHaveBeenCalledWith([
        { file_id: 'file1', filepath: expect.stringContaining('signed=true') },
        { file_id: 'file2', filepath: expect.stringContaining('signed=true') },
      ]);
    });

    it('skips non-S3 files', async () => {
      const { refreshS3FileUrls } = await import('../crud');

      const files = [
        {
          file_id: 'file1',
          source: 'local',
          filepath: '/local/path/file.jpg',
        },
      ];

      const mockBatchUpdate = jest.fn();

      const result = await refreshS3FileUrls(files as MongoFile[], mockBatchUpdate);

      expect(result).toEqual(files);
      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('handles empty or invalid input', async () => {
      const { refreshS3FileUrls } = await import('../crud');
      const mockBatchUpdate = jest.fn();

      const result1 = await refreshS3FileUrls(null as unknown as MongoFile[], mockBatchUpdate);
      expect(result1).toBe(null);

      const result2 = await refreshS3FileUrls([], mockBatchUpdate);
      expect(result2).toEqual([]);

      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });
  });

  describe('refreshS3Url', () => {
    it('refreshes an expired S3 URL', async () => {
      const { refreshS3Url } = await import('../crud');

      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const fileObj: S3FileRef = {
        source: FileSources.s3,
        filepath: `https://bucket.s3.amazonaws.com/images/user123/file.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
      };

      const result = await refreshS3Url(fileObj, 60);

      expect(result).toContain('signed=true');
    });

    it('returns original URL if not expired', async () => {
      const { refreshS3Url } = await import('../crud');

      const fileObj: S3FileRef = {
        source: FileSources.s3,
        filepath: 'https://example.com/proxy/file.jpg',
      };

      const result = await refreshS3Url(fileObj, 3600);

      expect(result).toBe(fileObj.filepath);
    });

    it('returns empty string for null input', async () => {
      const { refreshS3Url } = await import('../crud');
      const result = await refreshS3Url(null as unknown as S3FileRef);
      expect(result).toBe('');
    });

    it('returns original URL for non-S3 files', async () => {
      const { refreshS3Url } = await import('../crud');

      const fileObj: S3FileRef = {
        source: 'local',
        filepath: '/local/path/file.jpg',
      };

      const result = await refreshS3Url(fileObj);

      expect(result).toBe(fileObj.filepath);
    });

    it('handles errors and returns original URL', async () => {
      (getSignedUrl as jest.Mock).mockRejectedValueOnce(new Error('Refresh failed'));

      const { refreshS3Url } = await import('../crud');

      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const dateStr = pastDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

      const fileObj: S3FileRef = {
        source: FileSources.s3,
        filepath: `https://bucket.s3.amazonaws.com/images/user123/file.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
      };

      const result = await refreshS3Url(fileObj, 60);

      expect(result).toBe(fileObj.filepath);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('extractKeyFromS3Url', () => {
    it('extracts key from virtual-hosted-style URL', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('https://bucket.s3.amazonaws.com/images/user123/file.png');
      expect(key).toBe('images/user123/file.png');
    });

    it('returns key as-is when not a URL', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('images/user123/file.png');
      expect(key).toBe('images/user123/file.png');
    });

    it('throws on empty input', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      expect(() => extractKeyFromS3Url('')).toThrow('Invalid input: URL or key is empty');
    });

    it('handles URL with query parameters', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://bucket.s3.amazonaws.com/images/user123/file.png?X-Amz-Signature=abc',
      );
      expect(key).toBe('images/user123/file.png');
    });

    it('extracts key from path-style regional endpoint', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://s3.us-west-2.amazonaws.com/test-bucket/dogs/puppy.jpg',
      );
      expect(key).toBe('dogs/puppy.jpg');
    });

    it('extracts key from virtual-hosted regional endpoint', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://test-bucket.s3.us-west-2.amazonaws.com/dogs/puppy.png',
      );
      expect(key).toBe('dogs/puppy.png');
    });

    it('extracts key from legacy s3-region format', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://test-bucket.s3-us-west-2.amazonaws.com/cats/kitten.png',
      );
      expect(key).toBe('cats/kitten.png');
    });

    it('extracts key from legacy global endpoint', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('https://test-bucket.s3.amazonaws.com/dogs/puppy.png');
      expect(key).toBe('dogs/puppy.png');
    });

    it('handles key with leading slash by removing it', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('/images/user123/file.jpg');
      expect(key).toBe('images/user123/file.jpg');
    });

    it('handles simple key without slashes', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('simple-file.txt');
      expect(key).toBe('simple-file.txt');
    });

    it('handles key with only two parts', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('folder/file.txt');
      expect(key).toBe('folder/file.txt');
    });

    it('handles URLs with encoded characters', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://bucket.s3.amazonaws.com/test-bucket/images/user123/my%20file%20name.jpg',
      );
      expect(key).toBe('images/user123/my%20file%20name.jpg');
    });

    it('handles deep nested paths', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://bucket.s3.amazonaws.com/test-bucket/a/b/c/d/e/f/file.jpg',
      );
      expect(key).toBe('a/b/c/d/e/f/file.jpg');
    });

    it('returns empty string for URL with only bucket (no key)', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url('https://s3.us-west-2.amazonaws.com/my-bucket');
      expect(key).toBe('');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('handles malformed URL and returns input', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const malformedUrl = 'https://invalid url with spaces.com/key';
      const result = extractKeyFromS3Url(malformedUrl);

      expect(logger.error).toHaveBeenCalled();
      expect(result).toBe(malformedUrl);
    });

    it('strips bucket from custom endpoint URLs (MinIO, R2)', async () => {
      const { extractKeyFromS3Url } = await import('../crud');
      const key = extractKeyFromS3Url(
        'https://minio.example.com/test-bucket/images/user123/file.jpg',
      );
      expect(key).toBe('images/user123/file.jpg');
    });
  });
});
