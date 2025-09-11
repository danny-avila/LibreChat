const { EToolResources, FileSources, FileContext } = require('librechat-data-provider');

jest.mock('~/server/services/Files/strategies', () => {
  const mockHandleFileUpload = jest.fn();
  const mockHandleImageUpload = jest.fn();

  return {
    getStrategyFunctions: jest.fn((source) => ({
      handleFileUpload: mockHandleFileUpload.mockImplementation(({ file, file_id }) =>
        Promise.resolve({
          filepath: `/uploads/${source}/${file_id}`,
          bytes: file?.size || 20,
        }),
      ),
      handleImageUpload: mockHandleImageUpload.mockImplementation(({ file, file_id }) =>
        Promise.resolve({
          filepath: `/uploads/${source}/images/${file_id}`,
          bytes: file.size,
          width: 800,
          height: 600,
        }),
      ),
    })),
  };
});

jest.mock('~/models/File', () => {
  const mockCreateFile = jest.fn();
  return {
    createFile: mockCreateFile.mockImplementation((fileInfo) =>
      Promise.resolve({ _id: 'test-file-id', ...fileInfo }),
    ),
    updateFileUsage: jest.fn().mockResolvedValue(),
  };
});

jest.mock('~/models/Agent', () => ({
  addAgentResourceFile: jest.fn().mockResolvedValue(),
}));

jest.mock('~/server/services/Config/getEndpointsConfig', () => ({
  checkCapability: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn(() => {
    return 'local';
  }),
}));

jest.mock('~/server/services/Files/VectorDB/crud', () => ({
  uploadVectors: jest.fn(({ file_id }) =>
    Promise.resolve({
      success: true,
      vectorIds: [`vector-${file_id}-1`, `vector-${file_id}-2`],
    }),
  ),
}));

jest.mock('~/server/controllers/assistants/helpers', () => ({
  getOpenAIClient: jest.fn(),
}));

jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(() => 'mock-stream'),
}));

jest.mock('~/server/utils/queue', () => ({
  LB_QueueAsyncCall: jest.fn((fn, args, callback) => {
    if (callback) {
      callback(null, { success: true });
    }
    return Promise.resolve({ success: true });
  }),
}));

jest.mock('~/server/services/Config/app', () => ({
  getAppConfig: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    fileStrategies: {
      agents: 'local',
    },
    imageOutputType: 'jpeg',
  }),
}));

jest.mock('~/server/services/Files/images', () => ({
  processImageFile: jest.fn().mockResolvedValue({
    filepath: '/test/image/path',
    width: 800,
    height: 600,
  }),
  handleImageUpload: jest.fn().mockResolvedValue({
    filepath: '/test/image/uploaded/path',
    bytes: 1024,
    width: 800,
    height: 600,
  }),
}));

describe('File Processing - processAgentFileUpload', () => {
  let processAgentFileUpload;
  let mockHandleFileUpload;
  let mockHandleImageUpload;
  let mockCreateFile;
  let mockAddAgentResourceFile;
  let mockUploadVectors;
  let mockCheckCapability;
  let mockGetFileStrategy;

  beforeAll(() => {
    const processModule = require('./process');
    processAgentFileUpload = processModule.processAgentFileUpload;

    const { getStrategyFunctions } = require('~/server/services/Files/strategies');
    const mockStrategies = getStrategyFunctions();
    mockHandleFileUpload = mockStrategies.handleFileUpload;
    mockHandleImageUpload = mockStrategies.handleImageUpload;

    mockCreateFile = require('~/models/File').createFile;
    mockAddAgentResourceFile = require('~/models/Agent').addAgentResourceFile;
    mockUploadVectors = require('~/server/services/Files/VectorDB/crud').uploadVectors;
    mockCheckCapability = require('~/server/services/Config/getEndpointsConfig').checkCapability;
    mockGetFileStrategy = require('~/server/utils/getFileStrategy').getFileStrategy;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processAgentFileUpload', () => {
    it('should process image file upload for agent with proper file handling', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('test image data'),
          mimetype: 'image/jpeg',
          size: 1024,
          originalname: 'test-image.jpg',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        tool_resource: EToolResources.image_edit,
        file_id: 'test-file-id',
      };

      await processAgentFileUpload({ req: mockReq, res: mockRes, metadata });

      expect(mockGetFileStrategy).toHaveBeenCalledWith(mockReq.config, { isImage: true });

      expect(mockHandleImageUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          file: mockReq.file,
          file_id: expect.any(String),
        }),
      );

      expect(mockCreateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'test-user-id',
          file_id: 'test-file-id',
          bytes: 1024,
          filename: 'test-image.jpg',
          context: FileContext.agents,
          type: 'image/jpeg',
          source: FileSources.local,
          width: 800,
          height: 600,
        }),
        true,
      );

      expect(mockAddAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'test-agent-id',
          file_id: 'test-file-id',
          tool_resource: EToolResources.image_edit,
          req: mockReq,
        }),
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Agent file uploaded and processed successfully',
        }),
      );
    });

    it('should process file_search tool resource with dual storage (file + vector)', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('test file data'),
          mimetype: 'application/pdf',
          size: 2048,
          originalname: 'test-document.pdf',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        tool_resource: EToolResources.file_search,
        file_id: 'test-file-id',
      };

      await processAgentFileUpload({ req: mockReq, res: mockRes, metadata });

      expect(mockGetFileStrategy).toHaveBeenCalledWith(mockReq.config, { isImage: false });

      expect(mockHandleFileUpload).toHaveBeenCalledWith({
        req: mockReq,
        file: mockReq.file,
        file_id: 'test-file-id',
        basePath: 'uploads',
        entity_id: 'test-agent-id',
      });

      expect(mockUploadVectors).toHaveBeenCalledWith({
        req: mockReq,
        file: mockReq.file,
        file_id: 'test-file-id',
        entity_id: 'test-agent-id',
      });

      expect(mockCreateFile).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'test-user-id',
          file_id: 'test-file-id',
          filename: 'test-document.pdf',
          context: FileContext.agents,
          type: 'application/pdf',
          source: FileSources.local,
          bytes: 2048,
          filepath: '/uploads/local/test-file-id',
          metadata: {},
        }),
        true,
      );

      expect(mockAddAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'test-agent-id',
          file_id: 'test-file-id',
          tool_resource: EToolResources.file_search,
          req: mockReq,
        }),
      );
    });

    it('should handle missing tool_resource parameter', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('test file data'),
          mimetype: 'application/pdf',
          size: 2048,
          originalname: 'test-document.pdf',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        file_id: 'test-file-id',
      };

      await expect(
        processAgentFileUpload({ req: mockReq, res: mockRes, metadata }),
      ).rejects.toThrow('No tool resource provided for agent file upload');
    });

    it('should handle missing agent_id parameter', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('test file data'),
          mimetype: 'application/pdf',
          size: 2048,
          originalname: 'test-document.pdf',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        tool_resource: EToolResources.file_search,
        file_id: 'test-file-id',
      };

      await expect(
        processAgentFileUpload({ req: mockReq, res: mockRes, metadata }),
      ).rejects.toThrow('No agent ID provided for agent file upload');
    });

    it('should handle image uploads for non-image tool resources', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('test image data'),
          mimetype: 'image/jpeg',
          size: 1024,
          originalname: 'test-image.jpg',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        tool_resource: EToolResources.file_search,
        file_id: 'test-file-id',
      };

      await expect(
        processAgentFileUpload({ req: mockReq, res: mockRes, metadata }),
      ).rejects.toThrow('Image uploads are not supported for file search tool resources');
    });

    it('should check execute_code capability and load auth values when processing code files', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('print("hello world")'),
          mimetype: 'text/x-python',
          size: 20,
          originalname: 'test.py',
          path: '/tmp/test-file.py',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        tool_resource: EToolResources.execute_code,
        file_id: 'test-file-id',
      };

      const mockLoadAuthValues = require('~/server/services/Tools/credentials').loadAuthValues;
      mockLoadAuthValues.mockResolvedValue({ CODE_API_KEY: 'test-key' });

      await processAgentFileUpload({ req: mockReq, res: mockRes, metadata });

      expect(mockCheckCapability).toHaveBeenCalledWith(mockReq, 'execute_code');

      expect(mockLoadAuthValues).toHaveBeenCalledWith({
        userId: 'test-user-id',
        authFields: ['LIBRECHAT_CODE_API_KEY'],
      });

      expect(mockHandleFileUpload).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          req: mockReq,
          stream: 'mock-stream',
          filename: 'test.py',
          entity_id: 'test-agent-id',
          apiKey: undefined,
        }),
      );

      expect(mockHandleFileUpload).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          req: mockReq,
          file: mockReq.file,
          file_id: 'test-file-id',
          basePath: 'uploads',
          entity_id: 'test-agent-id',
        }),
      );

      expect(mockAddAgentResourceFile).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'test-agent-id',
          file_id: 'test-file-id',
          tool_resource: EToolResources.execute_code,
          req: mockReq,
        }),
      );
    });

    it('should throw error when example capability (execute_code) is not enabled', async () => {
      const mockReq = {
        user: { id: 'test-user-id' },
        file: {
          buffer: Buffer.from('print("hello world")'),
          mimetype: 'text/x-python',
          size: 20,
          originalname: 'test.py',
        },
        body: {
          file_id: 'test-file-id',
        },
        config: {
          fileStrategy: 'local',
          fileStrategies: {
            agents: 'local',
          },
          imageOutputType: 'jpeg',
        },
      };

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const metadata = {
        agent_id: 'test-agent-id',
        tool_resource: EToolResources.execute_code,
        file_id: 'test-file-id',
      };

      mockCheckCapability.mockResolvedValueOnce(false);

      await expect(
        processAgentFileUpload({ req: mockReq, res: mockRes, metadata }),
      ).rejects.toThrow('Code execution is not enabled for Agents');

      expect(mockCheckCapability).toHaveBeenCalledWith(mockReq, 'execute_code');

      expect(mockHandleFileUpload).not.toHaveBeenCalled();
      expect(mockCreateFile).not.toHaveBeenCalled();
      expect(mockAddAgentResourceFile).not.toHaveBeenCalled();
    });
  });
});
