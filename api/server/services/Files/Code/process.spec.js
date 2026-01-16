// Configurable file size limit for tests - use a getter so it can be changed per test
const fileSizeLimitConfig = { value: 20 * 1024 * 1024 }; // Default 20MB

// Mock librechat-data-provider with configurable file size limit
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    mergeFileConfig: jest.fn((config) => {
      const merged = actual.mergeFileConfig(config);
      // Override the serverFileSizeLimit with our test value
      return {
        ...merged,
        get serverFileSizeLimit() {
          return fileSizeLimitConfig.value;
        },
      };
    }),
    getEndpointFileConfig: jest.fn((options) => {
      const config = actual.getEndpointFileConfig(options);
      // Override fileSizeLimit with our test value
      return {
        ...config,
        get fileSizeLimit() {
          return fileSizeLimitConfig.value;
        },
      };
    }),
  };
});

const { FileContext } = require('librechat-data-provider');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

// Mock axios
jest.mock('axios');
const axios = require('axios');

// Mock logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock getCodeBaseURL
jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: jest.fn(() => 'https://code-api.example.com'),
}));

// Mock logAxiosError and getBasePath
jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  getBasePath: jest.fn(() => ''),
}));

// Mock models
jest.mock('~/models', () => ({
  createFile: jest.fn(),
  getFiles: jest.fn(),
  updateFile: jest.fn(),
}));

// Mock permissions (must be before process.js import)
jest.mock('~/server/services/Files/permissions', () => ({
  filterFilesByAgentAccess: jest.fn((options) => Promise.resolve(options.files)),
}));

// Mock strategy functions
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

// Mock convertImage
jest.mock('~/server/services/Files/images/convert', () => ({
  convertImage: jest.fn(),
}));

// Mock determineFileType
jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

const { createFile, getFiles } = require('~/models');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { convertImage } = require('~/server/services/Files/images/convert');
const { determineFileType } = require('~/server/utils');
const { logger } = require('@librechat/data-schemas');

// Import after mocks
const { processCodeOutput } = require('./process');

describe('Code Process', () => {
  const mockReq = {
    user: { id: 'user-123' },
    config: {
      fileConfig: {},
      fileStrategy: 'local',
      imageOutputType: 'webp',
    },
  };

  const baseParams = {
    req: mockReq,
    id: 'file-id-123',
    name: 'test-file.txt',
    apiKey: 'test-api-key',
    toolCallId: 'tool-call-123',
    conversationId: 'conv-123',
    messageId: 'msg-123',
    session_id: 'session-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    getFiles.mockResolvedValue(null);
    createFile.mockResolvedValue({});
    getStrategyFunctions.mockReturnValue({
      saveBuffer: jest.fn().mockResolvedValue('/uploads/mock-file-path.txt'),
    });
    determineFileType.mockResolvedValue({ mime: 'text/plain' });
  });

  describe('findExistingCodeFile (via processCodeOutput)', () => {
    it('should find existing file by filename and conversationId', async () => {
      const existingFile = {
        file_id: 'existing-file-id',
        filename: 'test-file.txt',
        usage: 2,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      getFiles.mockResolvedValue([existingFile]);

      const smallBuffer = Buffer.alloc(100);
      axios.mockResolvedValue({ data: smallBuffer });

      const result = await processCodeOutput(baseParams);

      // Verify getFiles was called with correct deduplication query
      expect(getFiles).toHaveBeenCalledWith(
        {
          filename: 'test-file.txt',
          conversationId: 'conv-123',
          context: FileContext.execute_code,
        },
        { createdAt: -1 },
        { text: 0 },
      );

      // Verify the existing file_id was reused
      expect(result.file_id).toBe('existing-file-id');
      // Verify usage was incremented
      expect(result.usage).toBe(3);
      // Verify original createdAt was preserved
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should create new file when no existing file found', async () => {
      getFiles.mockResolvedValue(null);

      const smallBuffer = Buffer.alloc(100);
      axios.mockResolvedValue({ data: smallBuffer });

      const result = await processCodeOutput(baseParams);

      // Should use the mocked uuid
      expect(result.file_id).toBe('mock-uuid-1234');
      // Should have usage of 1 for new file
      expect(result.usage).toBe(1);
    });

    it('should return null for invalid inputs (empty filename)', async () => {
      const smallBuffer = Buffer.alloc(100);
      axios.mockResolvedValue({ data: smallBuffer });

      // The function handles this internally - with empty name
      // findExistingCodeFile returns null early for empty filename (guard clause)
      const result = await processCodeOutput({ ...baseParams, name: '' });

      // getFiles should NOT be called due to early return in findExistingCodeFile
      expect(getFiles).not.toHaveBeenCalled();
      // A new file_id should be generated since no existing file was found
      expect(result.file_id).toBe('mock-uuid-1234');
    });
  });

  describe('processCodeOutput', () => {
    describe('image file processing', () => {
      it('should process image files using convertImage', async () => {
        const imageParams = { ...baseParams, name: 'chart.png' };
        const imageBuffer = Buffer.alloc(500);
        axios.mockResolvedValue({ data: imageBuffer });

        const convertedFile = {
          filepath: '/uploads/converted-image.webp',
          bytes: 400,
        };
        convertImage.mockResolvedValue(convertedFile);
        getFiles.mockResolvedValue(null);

        const result = await processCodeOutput(imageParams);

        expect(convertImage).toHaveBeenCalledWith(
          mockReq,
          imageBuffer,
          'high',
          'mock-uuid-1234.png',
        );
        expect(result.type).toBe('image/webp');
        expect(result.context).toBe(FileContext.execute_code);
        expect(result.filename).toBe('chart.png');
      });

      it('should update existing image file and increment usage', async () => {
        const imageParams = { ...baseParams, name: 'chart.png' };
        const existingFile = {
          file_id: 'existing-img-id',
          usage: 1,
          createdAt: '2024-01-01T00:00:00.000Z',
        };
        getFiles.mockResolvedValue([existingFile]);

        const imageBuffer = Buffer.alloc(500);
        axios.mockResolvedValue({ data: imageBuffer });
        convertImage.mockResolvedValue({ filepath: '/uploads/img.webp' });

        const result = await processCodeOutput(imageParams);

        expect(result.file_id).toBe('existing-img-id');
        expect(result.usage).toBe(2);
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('Updating existing file'),
        );
      });
    });

    describe('non-image file processing', () => {
      it('should process non-image files using saveBuffer', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const mockSaveBuffer = jest.fn().mockResolvedValue('/uploads/saved-file.txt');
        getStrategyFunctions.mockReturnValue({ saveBuffer: mockSaveBuffer });
        determineFileType.mockResolvedValue({ mime: 'text/plain' });

        const result = await processCodeOutput(baseParams);

        expect(mockSaveBuffer).toHaveBeenCalledWith({
          userId: 'user-123',
          buffer: smallBuffer,
          fileName: 'mock-uuid-1234__test-file.txt',
          basePath: 'uploads',
        });
        expect(result.type).toBe('text/plain');
        expect(result.filepath).toBe('/uploads/saved-file.txt');
        expect(result.bytes).toBe(100);
      });

      it('should detect MIME type from buffer', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue({ mime: 'application/pdf' });

        const result = await processCodeOutput({ ...baseParams, name: 'document.pdf' });

        expect(determineFileType).toHaveBeenCalledWith(smallBuffer, true);
        expect(result.type).toBe('application/pdf');
      });

      it('should fallback to application/octet-stream for unknown types', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });
        determineFileType.mockResolvedValue(null);

        const result = await processCodeOutput({ ...baseParams, name: 'unknown.xyz' });

        expect(result.type).toBe('application/octet-stream');
      });
    });

    describe('file size limit enforcement', () => {
      it('should fallback to download URL when file exceeds size limit', async () => {
        // Set a small file size limit for this test
        fileSizeLimitConfig.value = 1000; // 1KB limit

        const largeBuffer = Buffer.alloc(5000); // 5KB - exceeds 1KB limit
        axios.mockResolvedValue({ data: largeBuffer });

        const result = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exceeds size limit'));
        expect(result.filepath).toContain('/api/files/code/download/session-123/file-id-123');
        expect(result.expiresAt).toBeDefined();
        // Should not call createFile for oversized files (fallback path)
        expect(createFile).not.toHaveBeenCalled();

        // Reset to default for other tests
        fileSizeLimitConfig.value = 20 * 1024 * 1024;
      });
    });

    describe('fallback behavior', () => {
      it('should fallback to download URL when saveBuffer is not available', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });
        getStrategyFunctions.mockReturnValue({ saveBuffer: null });

        const result = await processCodeOutput(baseParams);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('saveBuffer not available'),
        );
        expect(result.filepath).toContain('/api/files/code/download/');
        expect(result.filename).toBe('test-file.txt');
      });

      it('should fallback to download URL on axios error', async () => {
        axios.mockRejectedValue(new Error('Network error'));

        const result = await processCodeOutput(baseParams);

        expect(result.filepath).toContain('/api/files/code/download/session-123/file-id-123');
        expect(result.conversationId).toBe('conv-123');
        expect(result.messageId).toBe('msg-123');
        expect(result.toolCallId).toBe('tool-call-123');
      });
    });

    describe('usage counter increment', () => {
      it('should set usage to 1 for new files', async () => {
        getFiles.mockResolvedValue(null);
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.usage).toBe(1);
      });

      it('should increment usage for existing files', async () => {
        const existingFile = { file_id: 'existing-id', usage: 5, createdAt: '2024-01-01' };
        getFiles.mockResolvedValue([existingFile]);
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.usage).toBe(6);
      });

      it('should handle existing file with undefined usage', async () => {
        const existingFile = { file_id: 'existing-id', createdAt: '2024-01-01' };
        getFiles.mockResolvedValue([existingFile]);
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        // (undefined ?? 0) + 1 = 1
        expect(result.usage).toBe(1);
      });
    });

    describe('metadata and file properties', () => {
      it('should include fileIdentifier in metadata', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.metadata).toEqual({
          fileIdentifier: 'session-123/file-id-123',
        });
      });

      it('should set correct context for code-generated files', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.context).toBe(FileContext.execute_code);
      });

      it('should include toolCallId and messageId in result', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        const result = await processCodeOutput(baseParams);

        expect(result.toolCallId).toBe('tool-call-123');
        expect(result.messageId).toBe('msg-123');
      });

      it('should call createFile with upsert enabled', async () => {
        const smallBuffer = Buffer.alloc(100);
        axios.mockResolvedValue({ data: smallBuffer });

        await processCodeOutput(baseParams);

        expect(createFile).toHaveBeenCalledWith(
          expect.objectContaining({
            file_id: 'mock-uuid-1234',
            context: FileContext.execute_code,
          }),
          true, // upsert flag
        );
      });
    });
  });
});
