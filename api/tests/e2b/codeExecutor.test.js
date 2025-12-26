const codeExecutor = require('~/server/services/Sandbox/codeExecutor');
const { e2bClientManager } = require('~/server/services/Endpoints/e2bAssistants/initialize');

// Mock the external SDK to prevent ESM loading issues
jest.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: jest.fn(),
  },
}));

jest.mock('~/server/services/Endpoints/e2bAssistants/initialize', () => ({
  e2bClientManager: {
    executeCode: jest.fn(),
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
    listFiles: jest.fn(),
  },
  initializeClient: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CodeExecutor Service', () => {
  const mockUserId = 'user123';
  const mockConversationId = 'convo123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should execute code and format stdout correctly', async () => {
    // Mock the response from e2bClientManager (which wraps the SDK response)
    e2bClientManager.executeCode.mockResolvedValue({
      success: true,
      results: [],
      stdout: ['Hello', 'World'], 
      stderr: [],
      error: null,
    });

    const code = 'print("Hello\nWorld")';
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    expect(e2bClientManager.executeCode).toHaveBeenCalledWith(mockUserId, mockConversationId, code, {});
    expect(response.success).toBe(true);
    // The _formatOutput method joins array elements with newline
    expect(response.stdout).toBe('Hello\nWorld');
    expect(response.hasVisualization).toBe(false);
  });

  test('should detect and extract images from results', async () => {
    const mockPngData = 'base64pngdata';
    
    e2bClientManager.executeCode.mockResolvedValue({
      success: true,
      results: [
        { png: mockPngData },
        { text: 'some text result' } // Should be ignored by image extractor
      ],
      stdout: [],
      stderr: [],
      error: null,
    });

    const code = 'plt.show()';
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    expect(response.success).toBe(true);
    expect(response.hasVisualization).toBe(true);
    expect(response.images).toHaveLength(1);
    expect(response.images[0]).toEqual({
      format: 'png',
      base64: mockPngData,
      mime: 'image/png',
      name: 'plot-0.png',
    });
  });

  test('should fail validation for forbidden code', async () => {
    const code = 'import os; os.system("rm -rf /")';
    
    await expect(codeExecutor.execute(mockUserId, mockConversationId, code))
      .rejects
      .toThrow(/Security validation failed/);
      
    expect(e2bClientManager.executeCode).not.toHaveBeenCalled();
  });

  test('should handle execution errors', async () => {
    e2bClientManager.executeCode.mockResolvedValue({
      success: false,
      results: [],
      stdout: [],
      stderr: ['NameError: name "x" is not defined'],
      error: 'NameError: name "x" is not defined',
    });

    const code = 'print(x)';
    const response = await codeExecutor.execute(mockUserId, mockConversationId, code);

    expect(response.success).toBe(false);
    expect(response.error).toBe('NameError: name "x" is not defined');
    expect(response.stderr).toContain('NameError');
  });
});
