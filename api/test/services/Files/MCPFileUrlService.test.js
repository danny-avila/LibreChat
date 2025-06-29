const MCPFileUrlService = require('../../../server/services/Files/MCPFileUrlService');

// Mock dependencies
jest.mock('../../../db/models', () => {
  const createMockQuery = (returnValue = []) => ({
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(returnValue),
    then: jest.fn((callback) => callback(returnValue))
  });

  return {
    File: {
      find: jest.fn(() => createMockQuery()),
      findOne: jest.fn(() => createMockQuery())
    }
  };
});

jest.mock('../../../server/services/Files/UrlGeneratorService', () => ({
  generateDownloadUrl: jest.fn()
}));

const { File } = require('../../../db/models');
const UrlGeneratorService = require('../../../server/services/Files/UrlGeneratorService');

describe('MCPFileUrlService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default File mock behavior
    const mockFiles = [
      {
        _id: 'file-1',
        filename: 'test1.pdf',
        filepath: '/uploads/test1.pdf',
        user: 'user-123'
      },
      {
        _id: 'file-2',
        filename: 'test2.pdf',
        filepath: '/uploads/test2.pdf',
        user: 'user-123'
      }
    ];

    File.find.mockImplementation(() => ({
      lean: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(mockFiles),
      then: jest.fn((callback) => callback(mockFiles))
    }));

    File.findOne.mockImplementation(() => ({
      lean: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(mockFiles[0]),
      then: jest.fn((callback) => callback(mockFiles[0]))
    }));

    // Setup UrlGeneratorService mock
    UrlGeneratorService.generateDownloadUrl.mockResolvedValue('https://example.com/download/file-1');
  });

  describe('generateCurrentMessageFileUrls', () => {
    it('should generate URLs for explicit message files', async () => {
      const mockFiles = [
        {
          file_id: 'file-1',
          filename: 'test1.pdf',
          type: 'application/pdf',
          bytes: 1024
        }
      ];

      const mockUrlData = {
        downloadUrl: 'https://example.com/download/file-1?token=abc123',
        expiresAt: new Date('2024-01-15T10:30:00Z'),
        singleUse: true
      };

      File.find.mockResolvedValue(mockFiles);
      UrlGeneratorService.generateDownloadUrl.mockResolvedValue(mockUrlData);

      const options = {
        conversationId: 'conv-123',
        messageFiles: ['file-1'],
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateCurrentMessageFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('conversationId', 'conv-123');
      expect(parsedResult).toHaveProperty('files');
      expect(parsedResult.files).toHaveLength(1);
      expect(parsedResult.files[0]).toMatchObject({
        fileId: 'file-1',
        filename: 'test1.pdf',
        type: 'application/pdf',
        size: 1024,
        downloadUrl: mockUrlData.downloadUrl
      });
    });

    it('should fallback to recent conversation files when no message files provided', async () => {
      const mockFiles = [
        {
          file_id: 'file-1',
          filename: 'recent.pdf',
          type: 'application/pdf',
          bytes: 1024
        }
      ];

      const mockUrlData = {
        downloadUrl: 'https://example.com/download/file-1?token=abc123',
        expiresAt: new Date('2024-01-15T10:30:00Z'),
        singleUse: true
      };

      File.find.mockResolvedValue(mockFiles);
      UrlGeneratorService.generateDownloadUrl.mockResolvedValue(mockUrlData);

      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateCurrentMessageFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('conversationId', 'conv-123');
      expect(parsedResult).toHaveProperty('source', 'recent_conversation');
      expect(parsedResult.files).toHaveLength(1);
      expect(parsedResult.files[0]).toMatchObject({
        fileId: 'file-1',
        filename: 'recent.pdf',
        source: 'recent_conversation'
      });
    });

    it('should return empty files when no context provided', async () => {
      const options = {
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateCurrentMessageFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('files', []);
      expect(parsedResult).toHaveProperty('message', 'No files available in current context');
    });
  });

  describe('generateConversationFileUrls', () => {
    it('should generate URLs for conversation files', async () => {
      const mockFiles = [
        {
          file_id: 'file-1',
          filename: 'test1.pdf',
          type: 'application/pdf',
          bytes: 1024
        },
        {
          file_id: 'file-2',
          filename: 'test2.txt',
          type: 'text/plain',
          bytes: 512
        }
      ];

      const mockUrlData = {
        downloadUrl: 'https://example.com/download/file-1?token=abc123',
        expiresAt: new Date('2024-01-15T10:30:00Z'),
        singleUse: true
      };

      File.find.mockResolvedValue(mockFiles);
      UrlGeneratorService.generateDownloadUrl.mockResolvedValue(mockUrlData);

      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1',
        ttlSeconds: 900,
        singleUse: true,
        clientIP: '127.0.0.1',
        userAgent: 'Test Agent',
        requestId: 'req-123'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('conversationId', 'conv-123');
      expect(parsedResult).toHaveProperty('files');
      expect(parsedResult.files).toHaveLength(2);
      expect(parsedResult.files[0]).toMatchObject({
        fileId: 'file-1',
        filename: 'test1.pdf',
        type: 'application/pdf',
        size: 1024,
        downloadUrl: mockUrlData.downloadUrl,
        expiresAt: mockUrlData.expiresAt,
        singleUse: true
      });

      expect(File.find).toHaveBeenCalledWith({
        conversationId: 'conv-123',
        user: 'user-123',
        downloadEnabled: { $ne: false }
      });

      expect(UrlGeneratorService.generateDownloadUrl).toHaveBeenCalledTimes(2);
    });

    it('should return empty files array when no files found', async () => {
      File.find.mockResolvedValue([]);

      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('files', []);
      expect(parsedResult).toHaveProperty('conversationId', 'conv-123');
    });

    it('should handle URL generation errors gracefully', async () => {
      const mockFiles = [
        {
          file_id: 'file-1',
          filename: 'test1.pdf',
          type: 'application/pdf',
          bytes: 1024
        }
      ];

      File.find.mockResolvedValue(mockFiles);
      UrlGeneratorService.generateDownloadUrl.mockRejectedValue(new Error('URL generation failed'));

      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      // Should filter out failed URL generations
      expect(parsedResult.files).toHaveLength(0);
    });

    it('should validate required inputs', async () => {
      const invalidOptions = {
        // Missing conversationId
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(invalidOptions);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('files', []);
      expect(parsedResult).toHaveProperty('error', 'Failed to generate file URLs');
    });

    it('should handle database errors gracefully', async () => {
      // Mock a database error scenario
      File.find.mockImplementation(() => {
        throw new Error('Database error');
      });

      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('files', []);
      expect(parsedResult).toHaveProperty('error', 'Failed to generate file URLs');
    });
  });

  describe('generateSingleFileUrl', () => {
    it('should generate URL for a single file', async () => {
      const mockFile = {
        file_id: 'file-1',
        filename: 'test.pdf',
        type: 'application/pdf',
        bytes: 1024
      };

      const mockUrlData = {
        downloadUrl: 'https://example.com/download/file-1?token=abc123'
      };

      File.findOne.mockResolvedValue(mockFile);
      UrlGeneratorService.generateDownloadUrl.mockResolvedValue(mockUrlData);

      const options = {
        fileId: 'file-1',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateSingleFileUrl(options);

      expect(result).toBe(mockUrlData.downloadUrl);
      expect(File.findOne).toHaveBeenCalledWith({
        file_id: 'file-1',
        user: 'user-123',
        downloadEnabled: { $ne: false }
      });
    });

    it('should throw error when file not found', async () => {
      File.findOne.mockResolvedValue(null);

      const options = {
        fileId: 'file-1',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      await expect(MCPFileUrlService.generateSingleFileUrl(options))
        .rejects.toThrow('File not found or access denied');
    });

    it('should handle URL generation errors', async () => {
      const mockFile = {
        file_id: 'file-1',
        filename: 'test.pdf',
        type: 'application/pdf',
        bytes: 1024
      };

      File.findOne.mockResolvedValue(mockFile);
      UrlGeneratorService.generateDownloadUrl.mockRejectedValue(new Error('URL generation failed'));

      const options = {
        fileId: 'file-1',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      await expect(MCPFileUrlService.generateSingleFileUrl(options))
        .rejects.toThrow('URL generation failed');
    });
  });

  describe('input validation', () => {
    it('should validate TTL bounds', async () => {
      const options = {
        conversationId: 'conv-123',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1',
        ttlSeconds: 30 // Below minimum
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('error', 'Failed to generate file URLs');
    });

    it('should validate required string fields', async () => {
      const options = {
        conversationId: '',
        userId: 'user-123',
        mcpClientId: 'mcp-client-1'
      };

      const result = await MCPFileUrlService.generateConversationFileUrls(options);
      const parsedResult = JSON.parse(result);

      expect(parsedResult).toHaveProperty('error', 'Failed to generate file URLs');
    });
  });
});
