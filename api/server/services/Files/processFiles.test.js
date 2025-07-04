// Mock the updateFileUsage function before importing the actual processFiles
jest.mock('~/models/File', () => ({
  updateFileUsage: jest.fn(),
}));

// Mock winston and logger configuration to avoid dependency issues
jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock all other dependencies that might cause issues
jest.mock('librechat-data-provider', () => ({
  isUUID: { parse: jest.fn() },
  megabyte: 1024 * 1024,
  FileContext: { message_attachment: 'message_attachment' },
  FileSources: { local: 'local' },
  EModelEndpoint: { assistants: 'assistants' },
  EToolResources: { file_search: 'file_search' },
  mergeFileConfig: jest.fn(),
  removeNullishValues: jest.fn((obj) => obj),
  isAssistantsEndpoint: jest.fn(),
}));

jest.mock('~/server/services/Files/images', () => ({
  convertImage: jest.fn(),
  resizeAndConvert: jest.fn(),
  resizeImageBuffer: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/v2', () => ({
  addResourceFileId: jest.fn(),
  deleteResourceFileId: jest.fn(),
}));

jest.mock('~/models/Agent', () => ({
  addAgentResourceFile: jest.fn(),
  removeAgentResourceFiles: jest.fn(),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  checkCapability: jest.fn(),
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn(),
}));

jest.mock('./strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: jest.fn(),
}));

// Import the actual processFiles function after all mocks are set up
const { processFiles } = require('./process');
const { updateFileUsage } = require('~/models/File');

describe('processFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('null filtering functionality', () => {
    it('should filter out null results from updateFileUsage when files do not exist', async () => {
      const mockFiles = [
        { file_id: 'existing-file-1' },
        { file_id: 'non-existent-file' },
        { file_id: 'existing-file-2' },
      ];

      // Mock updateFileUsage to return null for non-existent files
      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'non-existent-file') {
          return Promise.resolve(null); // Simulate file not found in the database
        }
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(updateFileUsage).toHaveBeenCalledTimes(3);
      expect(result).toEqual([
        { file_id: 'existing-file-1', usage: 1 },
        { file_id: 'existing-file-2', usage: 1 },
      ]);

      // Critical test - ensure no null values in result
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(2); // Only valid files should be returned
    });

    it('should return empty array when all updateFileUsage calls return null', async () => {
      const mockFiles = [{ file_id: 'non-existent-1' }, { file_id: 'non-existent-2' }];

      // All updateFileUsage calls return null
      updateFileUsage.mockResolvedValue(null);

      const result = await processFiles(mockFiles);

      expect(updateFileUsage).toHaveBeenCalledTimes(2);
      expect(result).toEqual([]);
      expect(result).not.toContain(null);
      expect(result.length).toBe(0);
    });

    it('should work correctly when all files exist', async () => {
      const mockFiles = [{ file_id: 'file-1' }, { file_id: 'file-2' }];

      updateFileUsage.mockImplementation(({ file_id }) => {
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(result).toEqual([
        { file_id: 'file-1', usage: 1 },
        { file_id: 'file-2', usage: 1 },
      ]);
      expect(result).not.toContain(null);
      expect(result.length).toBe(2);
    });

    it('should handle fileIds parameter and filter nulls correctly', async () => {
      const mockFiles = [{ file_id: 'file-1' }];
      const mockFileIds = ['file-2', 'non-existent-file'];

      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'non-existent-file') {
          return Promise.resolve(null);
        }
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles, mockFileIds);

      expect(result).toEqual([
        { file_id: 'file-1', usage: 1 },
        { file_id: 'file-2', usage: 1 },
      ]);
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(2);
    });

    it('should handle duplicate file_ids correctly', async () => {
      const mockFiles = [
        { file_id: 'duplicate-file' },
        { file_id: 'duplicate-file' }, // Duplicate should be ignored
        { file_id: 'unique-file' },
      ];

      updateFileUsage.mockImplementation(({ file_id }) => {
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      // Should only call updateFileUsage twice (duplicate ignored)
      expect(updateFileUsage).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { file_id: 'duplicate-file', usage: 1 },
        { file_id: 'unique-file', usage: 1 },
      ]);
      expect(result.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty files array', async () => {
      const result = await processFiles([]);
      expect(result).toEqual([]);
      expect(updateFileUsage).not.toHaveBeenCalled();
    });

    it('should handle mixed null and undefined returns from updateFileUsage', async () => {
      const mockFiles = [{ file_id: 'file-1' }, { file_id: 'file-2' }, { file_id: 'file-3' }];

      updateFileUsage.mockImplementation(({ file_id }) => {
        if (file_id === 'file-1') return Promise.resolve(null);
        if (file_id === 'file-2') return Promise.resolve(undefined);
        return Promise.resolve({ file_id, usage: 1 });
      });

      const result = await processFiles(mockFiles);

      expect(result).toEqual([{ file_id: 'file-3', usage: 1 }]);
      expect(result).not.toContain(null);
      expect(result).not.toContain(undefined);
      expect(result.length).toBe(1);
    });
  });
});
