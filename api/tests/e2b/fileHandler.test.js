// Mock initialize.js to return the object structure
jest.mock('~/server/services/Endpoints/e2bAssistants/initialize', () => ({
  e2bClientManager: {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    executeCode: jest.fn(),
  },
  initializeClient: jest.fn(),
}));

// Mock the codeExecutor module first to prevent it from loading initialize.js
jest.mock('~/server/services/Sandbox/codeExecutor', () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
}));

const fileHandler = require('~/server/services/Sandbox/fileHandler');
const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const { FileSources } = require('librechat-data-provider');

// Fully mock the strategies module
jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/models/File', () => ({
  findFileById: jest.fn(),
  createFile: jest.fn(),
}));
const { findFileById, createFile } = require('~/models/File');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FileHandler Service', () => {
  const mockUserId = 'user123';
  const mockConversationId = 'convo123';
  const mockReq = { config: {} };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('syncFilesToSandbox', () => {
    it('should sync files successfully', async () => {
      const fileId = 'file123';
      const fileIds = [fileId];
      const mockFileDoc = {
        file_id: fileId,
        source: FileSources.local,
        filepath: '/path/to/file.txt',
        filename: 'file.txt',
      };
      
      findFileById.mockResolvedValue(mockFileDoc);
      
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('test content');
        }
      };

      const mockStrategy = {
        getDownloadStream: jest.fn().mockResolvedValue(mockStream),
      };
      getStrategyFunctions.mockReturnValue(mockStrategy);

      codeExecutor.uploadFile.mockResolvedValue({ success: true });

      const result = await fileHandler.syncFilesToSandbox({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        fileIds
      });

      expect(findFileById).toHaveBeenCalledWith(fileId);
      expect(mockStrategy.getDownloadStream).toHaveBeenCalled();
      expect(codeExecutor.uploadFile).toHaveBeenCalledWith(
        mockUserId,
        mockConversationId,
        expect.any(Buffer),
        '/home/user/file.txt'
      );
      expect(result).toHaveLength(1);
      expect(result[0].fileId).toBe(fileId);
    });

    it('should handle missing files gracefully', async () => {
      findFileById.mockResolvedValue(null);

      const result = await fileHandler.syncFilesToSandbox({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        fileIds: ['missing_file']
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('persistArtifacts', () => {
    it('should download and persist artifacts', async () => {
      const artifacts = [{ name: 'plot.png', path: '/home/user/plot.png' }];
      const mockBuffer = Buffer.from('image data');
      
      codeExecutor.downloadFile.mockResolvedValue(mockBuffer);
      
      const mockStrategy = {
        saveBuffer: jest.fn().mockResolvedValue('/storage/path/plot.png'),
      };
      getStrategyFunctions.mockReturnValue(mockStrategy);

      const mockFileDoc = { file_id: 'new_file_id', filepath: '/storage/path/plot.png' };
      createFile.mockResolvedValue(mockFileDoc);

      const result = await fileHandler.persistArtifacts({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        artifacts
      });

      expect(codeExecutor.downloadFile).toHaveBeenCalledWith(
        mockUserId,
        mockConversationId,
        '/home/user/plot.png',
        'buffer'
      );
      expect(mockStrategy.saveBuffer).toHaveBeenCalled();
      expect(createFile).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockFileDoc);
    });

    it('should handle download errors', async () => {
      codeExecutor.downloadFile.mockRejectedValue(new Error('Download failed'));

      const result = await fileHandler.persistArtifacts({
        req: mockReq,
        userId: mockUserId,
        conversationId: mockConversationId,
        artifacts: [{ name: 'test.png', path: '/path' }]
      });

      expect(result).toHaveLength(0);
    });
  });
});
