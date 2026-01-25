/**
 * Tests for initializeMCPs.js
 *
 * These tests verify that MCPServersRegistry and MCPManager are ALWAYS initialized,
 * even when no explicitly configured MCP servers exist. This is critical for the
 * "Dynamic MCP Server Management" feature (v0.8.2-rc1) which allows users to
 * add MCP servers via the UI without requiring explicit configuration.
 *
 * Bug fixed: Previously, MCPManager was only initialized when mcpServers existed
 * in librechat.yaml, causing "MCPManager has not been initialized" errors when
 * users tried to create MCP servers via the UI.
 */

// Mock dependencies before imports
jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock config functions
const mockGetAppConfig = jest.fn();
const mockMergeAppTools = jest.fn();

jest.mock('./Config', () => ({
  get getAppConfig() {
    return mockGetAppConfig;
  },
  get mergeAppTools() {
    return mockMergeAppTools;
  },
}));

// Mock MCP singletons
const mockCreateMCPServersRegistry = jest.fn();
const mockCreateMCPManager = jest.fn();
const mockMCPManagerInstance = {
  getAppToolFunctions: jest.fn(),
};

jest.mock('~/config', () => ({
  get createMCPServersRegistry() {
    return mockCreateMCPServersRegistry;
  },
  get createMCPManager() {
    return mockCreateMCPManager;
  },
}));

const { logger } = require('@librechat/data-schemas');
const initializeMCPs = require('./initializeMCPs');

describe('initializeMCPs', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: successful initialization
    mockCreateMCPServersRegistry.mockReturnValue(undefined);
    mockCreateMCPManager.mockResolvedValue(mockMCPManagerInstance);
    mockMCPManagerInstance.getAppToolFunctions.mockResolvedValue({});
    mockMergeAppTools.mockResolvedValue(undefined);
  });

  describe('MCPServersRegistry initialization', () => {
    it('should ALWAYS initialize MCPServersRegistry even without configured servers', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null, // No configured servers
        mcpSettings: { allowedDomains: ['localhost'] },
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledTimes(1);
      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(
        expect.anything(), // mongoose
        ['localhost'],
      );
    });

    it('should pass allowedDomains from mcpSettings to registry', async () => {
      const allowedDomains = ['localhost', '*.example.com', 'trusted-mcp.com'];
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        mcpSettings: { allowedDomains },
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(expect.anything(), allowedDomains);
    });

    it('should handle undefined mcpSettings gracefully', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        // mcpSettings is undefined
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(expect.anything(), undefined);
    });

    it('should throw and log error if MCPServersRegistry initialization fails', async () => {
      const registryError = new Error('Registry initialization failed');
      mockCreateMCPServersRegistry.mockImplementation(() => {
        throw registryError;
      });
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null });

      await expect(initializeMCPs()).rejects.toThrow('Registry initialization failed');
      expect(logger.error).toHaveBeenCalledWith(
        '[MCP] Failed to initialize MCPServersRegistry:',
        registryError,
      );
    });
  });

  describe('MCPManager initialization', () => {
    it('should ALWAYS initialize MCPManager even without configured servers', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null, // No configured servers
      });

      await initializeMCPs();

      // MCPManager should be created with empty object when no configured servers
      expect(mockCreateMCPManager).toHaveBeenCalledTimes(1);
      expect(mockCreateMCPManager).toHaveBeenCalledWith({});
    });

    it('should initialize MCPManager with configured servers when provided', async () => {
      const mcpServers = {
        'test-server': { type: 'sse', url: 'http://localhost:3001/sse' },
        'local-server': { type: 'stdio', command: 'node', args: ['server.js'] },
      };
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mcpServers });

      await initializeMCPs();

      expect(mockCreateMCPManager).toHaveBeenCalledWith(mcpServers);
    });

    it('should throw and log error if MCPManager initialization fails', async () => {
      const managerError = new Error('Manager initialization failed');
      mockCreateMCPManager.mockRejectedValue(managerError);
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null });

      await expect(initializeMCPs()).rejects.toThrow('Manager initialization failed');
      expect(logger.error).toHaveBeenCalledWith(
        '[MCP] Failed to initialize MCPManager:',
        managerError,
      );
    });
  });

  describe('Tool merging behavior', () => {
    it('should NOT merge tools when no configured servers exist', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null, // No configured servers
      });

      await initializeMCPs();

      expect(mockMCPManagerInstance.getAppToolFunctions).not.toHaveBeenCalled();
      expect(mockMergeAppTools).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP] No servers configured. MCPManager ready for UI-based servers.',
      );
    });

    it('should NOT merge tools when mcpConfig is empty object', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: {}, // Empty object
      });

      await initializeMCPs();

      expect(mockMCPManagerInstance.getAppToolFunctions).not.toHaveBeenCalled();
      expect(mockMergeAppTools).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        '[MCP] No servers configured. MCPManager ready for UI-based servers.',
      );
    });

    it('should merge tools when configured servers exist', async () => {
      const mcpServers = {
        'test-server': { type: 'sse', url: 'http://localhost:3001/sse' },
      };
      const mcpTools = {
        tool1: jest.fn(),
        tool2: jest.fn(),
      };
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mcpServers });
      mockMCPManagerInstance.getAppToolFunctions.mockResolvedValue(mcpTools);

      await initializeMCPs();

      expect(mockMCPManagerInstance.getAppToolFunctions).toHaveBeenCalledTimes(1);
      expect(mockMergeAppTools).toHaveBeenCalledWith(mcpTools);
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP] Initialized with 1 configured server and 2 tools.',
      );
    });

    it('should handle null return from getAppToolFunctions', async () => {
      const mcpServers = { 'test-server': { type: 'sse', url: 'http://localhost:3001' } };
      mockGetAppConfig.mockResolvedValue({ mcpConfig: mcpServers });
      mockMCPManagerInstance.getAppToolFunctions.mockResolvedValue(null);

      await initializeMCPs();

      // Should use empty object fallback
      expect(mockMergeAppTools).toHaveBeenCalledWith({});
      expect(logger.info).toHaveBeenCalledWith(
        '[MCP] Initialized with 1 configured server and 0 tools.',
      );
    });
  });

  describe('Initialization order', () => {
    it('should initialize Registry before Manager', async () => {
      const callOrder = [];

      mockCreateMCPServersRegistry.mockImplementation(() => {
        callOrder.push('registry');
      });
      mockCreateMCPManager.mockImplementation(async () => {
        callOrder.push('manager');
        return mockMCPManagerInstance;
      });
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null });

      await initializeMCPs();

      expect(callOrder).toEqual(['registry', 'manager']);
    });

    it('should not attempt MCPManager initialization if Registry fails', async () => {
      mockCreateMCPServersRegistry.mockImplementation(() => {
        throw new Error('Registry failed');
      });
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null });

      await expect(initializeMCPs()).rejects.toThrow('Registry failed');
      expect(mockCreateMCPManager).not.toHaveBeenCalled();
    });
  });

  describe('UI-based MCP server management support', () => {
    /**
     * This test documents the critical fix:
     * MCPManager must be initialized even without configured servers to support
     * the "Dynamic MCP Server Management" feature where users create
     * MCP servers via the UI.
     */
    it('should support UI-based server creation without explicit configuration', async () => {
      // Scenario: User has no MCP servers in librechat.yaml but wants to
      // add servers via the UI
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        mcpSettings: undefined,
      });

      await initializeMCPs();

      // Both singletons must be initialized for UI-based management to work
      expect(mockCreateMCPServersRegistry).toHaveBeenCalledTimes(1);
      expect(mockCreateMCPManager).toHaveBeenCalledTimes(1);

      // Verify manager was created with empty config (not null/undefined)
      expect(mockCreateMCPManager).toHaveBeenCalledWith({});
    });
  });
});
