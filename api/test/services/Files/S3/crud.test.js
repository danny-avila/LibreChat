const fs = require('fs');
const fetch = require('node-fetch');
const { Readable } = require('stream');
const { FileSources } = require('librechat-data-provider');
const {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Mock dependencies
jest.mock('fs');
jest.mock('node-fetch');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('@aws-sdk/client-s3');

jest.mock('@librechat/api', () => ({
  initializeS3: jest.fn(),
  deleteRagFile: jest.fn().mockResolvedValue(undefined),
  isEnabled: jest.fn((val) => val === 'true'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { initializeS3, deleteRagFile } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

// Set env vars before requiring crud so module-level constants pick them up
process.env.AWS_BUCKET_NAME = 'test-bucket';
process.env.S3_URL_EXPIRY_SECONDS = '120';

const {
  saveBufferToS3,
  saveURLToS3,
  getS3URL,
  deleteFileFromS3,
  uploadFileToS3,
  getS3FileStream,
  refreshS3FileUrls,
  refreshS3Url,
  needsRefresh,
  getNewS3URL,
  extractKeyFromS3Url,
} = require('~/server/services/Files/S3/crud');

describe('S3 CRUD Operations', () => {
  let mockS3Client;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock S3 client
    mockS3Client = {
      send: jest.fn(),
    };
    initializeS3.mockReturnValue(mockS3Client);
  });

  afterEach(() => {
    delete process.env.S3_URL_EXPIRY_SECONDS;
    delete process.env.S3_REFRESH_EXPIRY_MS;
    delete process.env.AWS_BUCKET_NAME;
  });

  describe('saveBufferToS3', () => {
    it('should upload a buffer to S3 and return a signed URL', async () => {
      const mockBuffer = Buffer.from('test data');
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/test.jpg?signature=abc';

      mockS3Client.send.mockResolvedValue({});
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = await saveBufferToS3({
        userId: 'user123',
        buffer: mockBuffer,
        fileName: 'test.jpg',
        basePath: 'images',
      });

      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
      expect(result).toBe(mockSignedUrl);
    });

    it('should use default basePath if not provided', async () => {
      const mockBuffer = Buffer.from('test data');
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/test.jpg?signature=abc';

      mockS3Client.send.mockResolvedValue({});
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      await saveBufferToS3({
        userId: 'user123',
        buffer: mockBuffer,
        fileName: 'test.jpg',
      });

      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should handle S3 upload errors', async () => {
      const mockBuffer = Buffer.from('test data');
      const error = new Error('S3 upload failed');

      mockS3Client.send.mockRejectedValue(error);

      await expect(
        saveBufferToS3({
          userId: 'user123',
          buffer: mockBuffer,
          fileName: 'test.jpg',
        }),
      ).rejects.toThrow('S3 upload failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[saveBufferToS3] Error uploading buffer to S3:',
        'S3 upload failed',
      );
    });
  });

  describe('getS3URL', () => {
    it('should return a signed URL for a file', async () => {
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/file.pdf?signature=xyz';
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = await getS3URL({
        userId: 'user123',
        fileName: 'file.pdf',
        basePath: 'documents',
      });

      expect(result).toBe(mockSignedUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(GetObjectCommand),
        expect.objectContaining({ expiresIn: 120 }),
      );
    });

    it('should add custom filename to Content-Disposition header', async () => {
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/file.pdf?signature=xyz';
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      await getS3URL({
        userId: 'user123',
        fileName: 'file.pdf',
        customFilename: 'custom-name.pdf',
      });

      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should add custom content type', async () => {
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/file.pdf?signature=xyz';
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      await getS3URL({
        userId: 'user123',
        fileName: 'file.pdf',
        contentType: 'application/pdf',
      });

      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should handle errors when getting signed URL', async () => {
      const error = new Error('Failed to sign URL');
      getSignedUrl.mockRejectedValue(error);

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
    it('should fetch a file from URL and save to S3', async () => {
      const mockBuffer = Buffer.from('downloaded data');
      const mockResponse = {
        buffer: jest.fn().mockResolvedValue(mockBuffer),
      };
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/downloaded.jpg?signature=abc';

      fetch.mockResolvedValue(mockResponse);
      mockS3Client.send.mockResolvedValue({});
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = await saveURLToS3({
        userId: 'user123',
        URL: 'https://example.com/image.jpg',
        fileName: 'downloaded.jpg',
      });

      expect(fetch).toHaveBeenCalledWith('https://example.com/image.jpg');
      expect(mockS3Client.send).toHaveBeenCalled();
      expect(result).toBe(mockSignedUrl);
    });

    it('should handle fetch errors', async () => {
      const error = new Error('Network error');
      fetch.mockRejectedValue(error);

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
    const mockReq = {
      user: { id: 'user123' },
    };

    it('should delete a file from S3', async () => {
      const mockFile = {
        filepath: 'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg',
        file_id: 'file123',
      };

      // Mock HeadObject to verify file exists
      mockS3Client.send
        .mockResolvedValueOnce({}) // First HeadObject - exists
        .mockResolvedValueOnce({}) // DeleteObject
        .mockRejectedValueOnce({ name: 'NotFound' }); // Second HeadObject - deleted

      await deleteFileFromS3(mockReq, mockFile);

      expect(deleteRagFile).toHaveBeenCalledWith({ userId: 'user123', file: mockFile });
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
    });

    it('should handle file not found gracefully', async () => {
      const mockFile = {
        filepath: 'https://s3.amazonaws.com/test-bucket/images/user123/nonexistent.jpg',
        file_id: 'file123',
      };

      mockS3Client.send.mockRejectedValue({ name: 'NotFound' });

      await deleteFileFromS3(mockReq, mockFile);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw error if user ID does not match', async () => {
      const mockFile = {
        filepath: 'https://s3.amazonaws.com/test-bucket/images/different-user/file.jpg',
        file_id: 'file123',
      };

      await expect(deleteFileFromS3(mockReq, mockFile)).rejects.toThrow('User ID mismatch');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle NoSuchKey error', async () => {
      const mockFile = {
        filepath: 'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg',
        file_id: 'file123',
      };

      mockS3Client.send
        .mockResolvedValueOnce({}) // HeadObject - exists
        .mockRejectedValueOnce({ code: 'NoSuchKey' }); // DeleteObject fails

      await deleteFileFromS3(mockReq, mockFile);

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('uploadFileToS3', () => {
    const mockReq = {
      user: { id: 'user123' },
    };

    it('should upload a file from disk to S3', async () => {
      const mockFile = {
        path: '/tmp/upload.jpg',
        originalname: 'photo.jpg',
      };
      const mockStats = { size: 1024 };
      const mockSignedUrl =
        'https://s3.amazonaws.com/test-bucket/images/user123/file123__photo.jpg?signature=xyz';

      fs.promises = { stat: jest.fn().mockResolvedValue(mockStats) };
      fs.createReadStream = jest.fn().mockReturnValue(new Readable());
      mockS3Client.send.mockResolvedValue({});
      getSignedUrl.mockResolvedValue(mockSignedUrl);

      const result = await uploadFileToS3({
        req: mockReq,
        file: mockFile,
        file_id: 'file123',
        basePath: 'images',
      });

      expect(result).toEqual({
        filepath: mockSignedUrl,
        bytes: 1024,
      });
      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/upload.jpg');
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    });

    it('should handle upload errors and clean up temp file', async () => {
      const mockFile = {
        path: '/tmp/upload.jpg',
        originalname: 'photo.jpg',
      };
      const error = new Error('Upload failed');

      fs.promises = {
        stat: jest.fn().mockResolvedValue({ size: 1024 }),
        unlink: jest.fn().mockResolvedValue(),
      };
      fs.createReadStream = jest.fn().mockReturnValue(new Readable());
      mockS3Client.send.mockRejectedValue(error);

      await expect(
        uploadFileToS3({
          req: mockReq,
          file: mockFile,
          file_id: 'file123',
        }),
      ).rejects.toThrow('Upload failed');

      expect(logger.error).toHaveBeenCalledWith(
        '[uploadFileToS3] Error streaming file to S3:',
        error,
      );
    });
  });

  describe('getS3FileStream', () => {
    it('should return a readable stream for a file', async () => {
      const mockStream = new Readable();
      const mockResponse = { Body: mockStream };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await getS3FileStream(
        {},
        'https://s3.amazonaws.com/test-bucket/images/user123/file.pdf',
      );

      expect(result).toBe(mockStream);
      expect(mockS3Client.send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    });

    it('should handle errors when retrieving stream', async () => {
      const error = new Error('Stream error');
      mockS3Client.send.mockRejectedValue(error);

      await expect(getS3FileStream({}, 'images/user123/file.pdf')).rejects.toThrow('Stream error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('needsRefresh', () => {
    it('should return false for non-signed URLs', () => {
      const url = 'https://example.com/proxy/file.jpg';
      const result = needsRefresh(url, 3600);
      expect(result).toBe(false);
    });

    it('should return true for expired signed URLs', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000); // 1 hour ago
      const dateStr = past
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const url = `https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`;
      const result = needsRefresh(url, 60);
      expect(result).toBe(true);
    });

    it('should return false for URLs that are not close to expiration', () => {
      const now = new Date();
      const recent = new Date(now.getTime() - 10 * 1000); // 10 seconds ago
      const dateStr = recent
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const url = `https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=7200`;
      const result = needsRefresh(url, 60);
      expect(result).toBe(false);
    });

    it('should use custom refresh expiry when S3_REFRESH_EXPIRY_MS is set', () => {
      process.env.S3_REFRESH_EXPIRY_MS = '30000'; // 30 seconds

      const now = new Date();
      const recent = new Date(now.getTime() - 31 * 1000); // 31 seconds ago
      const dateStr = recent
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const url = `https://s3.amazonaws.com/bucket/key?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=7200`;

      // Need to reload the module to pick up the env var change
      jest.resetModules();
      const { needsRefresh: needsRefreshReloaded } = require('~/server/services/Files/S3/crud');

      const result = needsRefreshReloaded(url, 60);
      expect(result).toBe(true);
    });

    it('should return true for malformed URLs', () => {
      const url = 'not-a-valid-url';
      const result = needsRefresh(url, 3600);
      expect(result).toBe(true);
    });
  });

  describe('getNewS3URL', () => {
    it('should generate a new URL from an existing S3 URL', async () => {
      const currentURL =
        'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg?signature=old';
      const newURL = 'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg?signature=new';

      getSignedUrl.mockResolvedValue(newURL);

      const result = await getNewS3URL(currentURL);

      expect(result).toBe(newURL);
      expect(getSignedUrl).toHaveBeenCalled();
    });

    it('should return undefined for invalid URLs', async () => {
      const result = await getNewS3URL('invalid-url');
      expect(result).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const currentURL = 'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg';
      getSignedUrl.mockRejectedValue(new Error('Failed'));

      const result = await getNewS3URL(currentURL);

      expect(result).toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error getting new S3 URL:', expect.any(Error));
    });

    it('should construct GetObjectCommand with correct key (no bucket name duplication)', async () => {
      const currentURL =
        'https://s3.amazonaws.com/my-bucket/images/user123/file.jpg?X-Amz-Signature=old';
      getSignedUrl.mockResolvedValue(
        'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg?signature=new',
      );

      await getNewS3URL(currentURL);

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: 'images/user123/file.jpg' }),
      );
    });
  });

  describe('refreshS3FileUrls', () => {
    it('should refresh expired URLs for multiple files', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000);
      const dateStr = past
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const files = [
        {
          file_id: 'file1',
          source: FileSources.s3,
          filepath: `https://s3.amazonaws.com/bucket/images/user123/file1.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
        },
        {
          file_id: 'file2',
          source: FileSources.s3,
          filepath: `https://s3.amazonaws.com/bucket/images/user123/file2.jpg?X-Amz-Signature=def&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
        },
      ];

      const newURL1 = 'https://s3.amazonaws.com/bucket/images/user123/file1.jpg?signature=new1';
      const newURL2 = 'https://s3.amazonaws.com/bucket/images/user123/file2.jpg?signature=new2';

      getSignedUrl.mockResolvedValueOnce(newURL1).mockResolvedValueOnce(newURL2);

      const mockBatchUpdate = jest.fn().mockResolvedValue();

      const result = await refreshS3FileUrls(files, mockBatchUpdate, 60);

      expect(result[0].filepath).toBe(newURL1);
      expect(result[1].filepath).toBe(newURL2);
      expect(mockBatchUpdate).toHaveBeenCalledWith([
        { file_id: 'file1', filepath: newURL1 },
        { file_id: 'file2', filepath: newURL2 },
      ]);
    });

    it('should skip non-S3 files', async () => {
      const files = [
        {
          file_id: 'file1',
          source: 'local',
          filepath: '/local/path/file.jpg',
        },
      ];

      const mockBatchUpdate = jest.fn();

      const result = await refreshS3FileUrls(files, mockBatchUpdate);

      expect(result).toEqual(files);
      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('should handle empty or invalid input', async () => {
      const mockBatchUpdate = jest.fn();

      const result1 = await refreshS3FileUrls(null, mockBatchUpdate);
      expect(result1).toBe(null);

      const result2 = await refreshS3FileUrls([], mockBatchUpdate);
      expect(result2).toEqual([]);

      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });

    it('should handle errors for individual files gracefully', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000);
      const dateStr = past
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const files = [
        {
          file_id: 'file1',
          source: FileSources.s3,
          filepath: `https://s3.amazonaws.com/bucket/images/user123/file1.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
        },
      ];

      getSignedUrl.mockRejectedValue(new Error('Failed to refresh'));
      const mockBatchUpdate = jest.fn();

      await refreshS3FileUrls(files, mockBatchUpdate, 60);

      expect(logger.error).toHaveBeenCalledWith('Error getting new S3 URL:', expect.any(Error));
      expect(mockBatchUpdate).not.toHaveBeenCalled();
    });
  });

  describe('refreshS3Url', () => {
    it('should refresh an expired S3 URL', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000);
      const dateStr = past
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const fileObj = {
        source: FileSources.s3,
        filepath: `https://s3.amazonaws.com/bucket/images/user123/file.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
      };

      const newURL = 'https://s3.amazonaws.com/bucket/images/user123/file.jpg?signature=new';
      getSignedUrl.mockResolvedValue(newURL);

      const result = await refreshS3Url(fileObj, 60);

      expect(result).toBe(newURL);
    });

    it('should return original URL if not expired', async () => {
      const fileObj = {
        source: FileSources.s3,
        filepath: 'https://example.com/proxy/file.jpg',
      };

      const result = await refreshS3Url(fileObj, 3600);

      expect(result).toBe(fileObj.filepath);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('should return empty string for null input', async () => {
      const result = await refreshS3Url(null);
      expect(result).toBe('');
    });

    it('should return original URL for non-S3 files', async () => {
      const fileObj = {
        source: 'local',
        filepath: '/local/path/file.jpg',
      };

      const result = await refreshS3Url(fileObj);

      expect(result).toBe(fileObj.filepath);
    });

    it('should handle errors and return original URL', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3600 * 1000);
      const dateStr = past
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

      const fileObj = {
        source: FileSources.s3,
        filepath: `https://s3.amazonaws.com/bucket/images/user123/file.jpg?X-Amz-Signature=abc&X-Amz-Date=${dateStr}&X-Amz-Expires=60`,
      };

      getSignedUrl.mockRejectedValue(new Error('Refresh failed'));

      const result = await refreshS3Url(fileObj, 60);

      expect(result).toBe(fileObj.filepath);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('extractKeyFromS3Url', () => {
    it('should extract key from a full S3 URL', () => {
      const url = 'https://s3.amazonaws.com/test-bucket/images/user123/file.jpg';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('images/user123/file.jpg');
    });

    it('should extract key from a signed S3 URL with query parameters', () => {
      const url =
        'https://s3.amazonaws.com/test-bucket/documents/user456/report.pdf?X-Amz-Signature=abc123&X-Amz-Date=20260107';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('documents/user456/report.pdf');
    });

    it('should extract key from S3 URL with different domain format', () => {
      const url = 'https://test-bucket.s3.amazonaws.com/uploads/user789/image.png';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('uploads/user789/image.png');
    });

    it('should return key as-is if already properly formatted (3+ parts, no http)', () => {
      const key = 'images/user123/file.jpg';
      const result = extractKeyFromS3Url(key);
      expect(result).toBe('images/user123/file.jpg');
    });

    it('should handle key with leading slash by removing it', () => {
      const key = '/images/user123/file.jpg';
      const result = extractKeyFromS3Url(key);
      expect(result).toBe('images/user123/file.jpg');
    });

    it('should handle simple key without slashes', () => {
      const key = 'simple-file.txt';
      const result = extractKeyFromS3Url(key);
      expect(result).toBe('simple-file.txt');
    });

    it('should handle key with only two parts', () => {
      const key = 'folder/file.txt';
      const result = extractKeyFromS3Url(key);
      expect(result).toBe('folder/file.txt');
    });

    it('should throw error for empty input', () => {
      expect(() => extractKeyFromS3Url('')).toThrow('Invalid input: URL or key is empty');
    });

    it('should throw error for null input', () => {
      expect(() => extractKeyFromS3Url(null)).toThrow('Invalid input: URL or key is empty');
    });

    it('should throw error for undefined input', () => {
      expect(() => extractKeyFromS3Url(undefined)).toThrow('Invalid input: URL or key is empty');
    });

    it('should handle URLs with encoded characters', () => {
      const url = 'https://s3.amazonaws.com/test-bucket/images/user123/my%20file%20name.jpg';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('images/user123/my%20file%20name.jpg');
    });

    it('should handle deep nested paths', () => {
      const url = 'https://s3.amazonaws.com/bucket/a/b/c/d/e/f/file.jpg';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('a/b/c/d/e/f/file.jpg');
    });

    it('should log debug message when extracting from URL', () => {
      const url = 'https://s3.amazonaws.com/bucket/images/user123/file.jpg';
      extractKeyFromS3Url(url);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[extractKeyFromS3Url] fileUrlOrKey:'),
      );
    });

    it('should log fallback debug message for non-URL input', () => {
      const key = 'simple-file.txt';
      extractKeyFromS3Url(key);
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('[extractKeyFromS3Url] FALLBACK'),
      );
    });

    it('should handle valid URLs that contain only a bucket', () => {
      const url = 'https://s3.amazonaws.com/test-bucket/';
      const result = extractKeyFromS3Url(url);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[extractKeyFromS3Url] Extracted key is empty after removing bucket name from URL: https://s3.amazonaws.com/test-bucket/',
        ),
      );
      expect(result).toBe('');
    });

    it('should handle invalid URLs that contain only a bucket', () => {
      const url = 'https://s3.amazonaws.com/test-bucket';
      const result = extractKeyFromS3Url(url);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          '[extractKeyFromS3Url] Unable to extract key from path-style URL: https://s3.amazonaws.com/test-bucket',
        ),
      );
      expect(result).toBe('');
    });

    //  https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html

    // Path-style requests
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#path-style-access
    // https://s3.region-code.amazonaws.com/bucket-name/key-name
    it('should handle formatted according to Path-style regional endpoint', () => {
      const url = 'https://s3.us-west-2.amazonaws.com/amzn-s3-demo-bucket1/dogs/puppy.jpg';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('dogs/puppy.jpg');
    });

    // virtual host style
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#virtual-hosted-style-access
    // https://bucket-name.s3.region-code.amazonaws.com/key-name
    it('should handle formatted according to Virtual-hosted–style Regional endpoint', () => {
      const url = 'https://amzn-s3-demo-bucket1.s3.us-west-2.amazonaws.com/dogs/puppy.png';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('dogs/puppy.png');
    });

    // Legacy endpoints
    // https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html#VirtualHostingBackwardsCompatibility

    // s3‐Region
    // https://bucket-name.s3-region-code.amazonaws.com
    it('should handle formatted according to s3‐Region', () => {
      const url = 'https://amzn-s3-demo-bucket1.s3-us-west-2.amazonaws.com/puppy.png';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('puppy.png');

      const testcase2 = 'https://amzn-s3-demo-bucket1.s3-us-west-2.amazonaws.com/cats/kitten.png';
      const result2 = extractKeyFromS3Url(testcase2);
      expect(result2).toBe('cats/kitten.png');
    });

    // Legacy global endpoint
    // bucket-name.s3.amazonaws.com
    it('should handle formatted according to Legacy global endpoint', () => {
      const url = 'https://amzn-s3-demo-bucket1.s3.amazonaws.com/dogs/puppy.png';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('dogs/puppy.png');
    });

    it('should handle malformed URL and log error', () => {
      const malformedUrl = 'https://invalid url with spaces.com/key';
      const result = extractKeyFromS3Url(malformedUrl);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[extractKeyFromS3Url] Error parsing URL:'),
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(malformedUrl));

      expect(result).toBe(malformedUrl);
    });

    it('should return empty string for regional path-style URL with only bucket (no key)', () => {
      const url = 'https://s3.us-west-2.amazonaws.com/my-bucket';
      const result = extractKeyFromS3Url(url);
      expect(result).toBe('');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[extractKeyFromS3Url] Unable to extract key from path-style URL:'),
      );
    });

    it('should not log error when given a plain S3 key (non-URL input)', () => {
      extractKeyFromS3Url('images/user123/file.jpg');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should strip bucket from custom endpoint URLs (MinIO, R2, etc.) using bucketName', () => {
      // bucketName is the module-level const 'test-bucket', set before require at top of file
      expect(
        extractKeyFromS3Url('https://minio.example.com/test-bucket/images/user123/file.jpg'),
      ).toBe('images/user123/file.jpg');
      expect(
        extractKeyFromS3Url(
          'https://abc123.r2.cloudflarestorage.com/test-bucket/images/user123/avatar.png',
        ),
      ).toBe('images/user123/avatar.png');
    });

    it('should use endpoint base path when AWS_ENDPOINT_URL and AWS_FORCE_PATH_STYLE are set', () => {
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ENDPOINT_URL = 'https://minio.example.com';
      process.env.AWS_FORCE_PATH_STYLE = 'true';
      jest.resetModules();
      const { extractKeyFromS3Url: fn } = require('~/server/services/Files/S3/crud');

      expect(fn('https://minio.example.com/test-bucket/images/user123/file.jpg')).toBe(
        'images/user123/file.jpg',
      );

      delete process.env.AWS_ENDPOINT_URL;
      delete process.env.AWS_FORCE_PATH_STYLE;
    });

    it('should handle endpoint with a base path', () => {
      process.env.AWS_BUCKET_NAME = 'test-bucket';
      process.env.AWS_ENDPOINT_URL = 'https://example.com/storage/';
      process.env.AWS_FORCE_PATH_STYLE = 'true';
      jest.resetModules();
      const { extractKeyFromS3Url: fn } = require('~/server/services/Files/S3/crud');

      expect(fn('https://example.com/storage/test-bucket/images/user123/file.jpg')).toBe(
        'images/user123/file.jpg',
      );

      delete process.env.AWS_ENDPOINT_URL;
      delete process.env.AWS_FORCE_PATH_STYLE;
    });
  });
});
