/**
 * Tests for initializeMCPs.js
 *
 * These tests verify that MCPServersRegistry and MCPManager are ALWAYS initialized,
 * even when no explicitly configured MCP servers exist. This is critical for the
 * "Dynamic MCP Server Management" feature (introduced in `0.8.2-rc1` release) which
 * allows users to add MCP servers via the UI without requiring explicit configuration.
 *
 * Bug fixed: Previously, MCPManager was only initialized when mcpServers existed
 * in librechat.yaml, causing "MCPManager has not been initialized" errors when
 * users tried to create MCP servers via the UI.
 */

const mockAssertMCPAuthorityReadiness = jest.fn();
const mockInitializeMCPAuthorityConsistency = jest.fn();
const mockSetMCPAvailability = jest.fn((availability) => availability);

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
  tenantStorage: {
    run: jest.fn((_store, action) => action()),
  },
  assertMCPAuthorityReadiness: (...args) => mockAssertMCPAuthorityReadiness(...args),
}));

jest.mock('~/models', () => ({
  initializeMCPAuthorityConsistency: (...args) => mockInitializeMCPAuthorityConsistency(...args),
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
const mockInitializeMCPAuthority = jest.fn();
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
jest.mock('./MCPAuthority', () => ({
  initializeMCPAuthority: (...args) => mockInitializeMCPAuthority(...args),
  setMCPAvailability: (...args) => mockSetMCPAvailability(...args),
}));

const { logger } = require('@librechat/data-schemas');
const initializeMCPs = require('./initializeMCPs');

describe('initializeMCPs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED;

    // Default: successful initialization
    mockCreateMCPServersRegistry.mockReturnValue(undefined);
    mockCreateMCPManager.mockResolvedValue(mockMCPManagerInstance);
    mockMCPManagerInstance.getAppToolFunctions.mockResolvedValue({});
    mockMergeAppTools.mockResolvedValue(undefined);
    mockInitializeMCPAuthority.mockReturnValue(undefined);
    mockAssertMCPAuthorityReadiness.mockResolvedValue({ scannedServers: 0, indexes: [] });
    mockInitializeMCPAuthorityConsistency.mockResolvedValue({ generation: 0 });
  });

  describe('MCP authority readiness', () => {
    it('keeps general startup available but performs zero MCP effects when prerequisites are unavailable', async () => {
      mockAssertMCPAuthorityReadiness.mockRejectedValue(new Error('missing authority index'));
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null });

      await expect(initializeMCPs({ validateAuthorityReadiness: true })).resolves.toBeUndefined();

      expect(mockAssertMCPAuthorityReadiness).toHaveBeenCalledWith(require('mongoose').connection, {
        cosmosStrongConsistencyConfirmed: false,
      });
      expect(mockInitializeMCPAuthorityConsistency).not.toHaveBeenCalled();
      expect(mockSetMCPAvailability).toHaveBeenCalledWith({
        available: false,
        reason: 'prerequisite_missing',
        message: 'missing authority index',
        retryable: false,
      });
      expect(mockInitializeMCPAuthority).not.toHaveBeenCalled();
      expect(mockCreateMCPServersRegistry).not.toHaveBeenCalled();
      expect(mockCreateMCPManager).not.toHaveBeenCalled();
      expect(mockMergeAppTools).not.toHaveBeenCalled();
    });

    it('initializes the consistency fence only after schema readiness succeeds', async () => {
      const appConfig = { config: { version: '1.3.0' }, mcpConfig: null };
      mockGetAppConfig.mockResolvedValue(appConfig);

      await initializeMCPs({ validateAuthorityReadiness: true });

      expect(mockAssertMCPAuthorityReadiness.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeMCPAuthorityConsistency.mock.invocationCallOrder[0],
      );
      expect(mockInitializeMCPAuthorityConsistency.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeMCPAuthority.mock.invocationCallOrder[0],
      );
    });

    it('validates rollout prerequisites before initializing production fences', async () => {
      const appConfig = { config: { version: '1.3.0' }, mcpConfig: null };
      mockGetAppConfig.mockResolvedValue(appConfig);

      await initializeMCPs({ validateAuthorityReadiness: true });

      expect(mockAssertMCPAuthorityReadiness).toHaveBeenCalledWith(require('mongoose').connection, {
        cosmosStrongConsistencyConfirmed: false,
      });
      expect(mockAssertMCPAuthorityReadiness.mock.invocationCallOrder[0]).toBeLessThan(
        mockInitializeMCPAuthority.mock.invocationCallOrder[0],
      );
    });

    it('passes the explicit Cosmos Strong-consistency acknowledgement to readiness', async () => {
      process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED = 'true';
      mockGetAppConfig.mockResolvedValue({ config: { version: '1.3.0' }, mcpConfig: null });

      try {
        await initializeMCPs({ validateAuthorityReadiness: true });

        expect(mockAssertMCPAuthorityReadiness).toHaveBeenCalledWith(
          require('mongoose').connection,
          { cosmosStrongConsistencyConfirmed: true },
        );
      } finally {
        delete process.env.MCP_AUTHORITY_COSMOS_STRONG_CONSISTENCY_CONFIRMED;
      }
    });

    it('records a stable unavailable state instead of stopping general startup', async () => {
      mockAssertMCPAuthorityReadiness.mockRejectedValue(new Error('missing index'));

      await expect(initializeMCPs({ validateAuthorityReadiness: true })).resolves.toBeUndefined();

      expect(mockGetAppConfig).not.toHaveBeenCalled();
      expect(mockInitializeMCPAuthority).not.toHaveBeenCalled();
      expect(mockSetMCPAvailability).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          reason: 'prerequisite_missing',
          message: 'missing index',
        }),
      );
    });
  });

  describe('MCPServersRegistry initialization', () => {
    it('initializes the mandatory authority resolver from the base config', async () => {
      const appConfig = {
        config: { version: '1.3.0', mcpServers: {} },
        mcpConfig: null,
      };
      mockGetAppConfig.mockResolvedValue(appConfig);

      await initializeMCPs();

      expect(mockInitializeMCPAuthority).toHaveBeenCalledWith(appConfig);
    });

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
        undefined,
        expect.any(Function), // per-request allowlist resolver
      );
    });

    it('should pass allowedDomains from mcpSettings to registry', async () => {
      const allowedDomains = ['localhost', '*.example.com', 'trusted-mcp.com'];
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        mcpSettings: { allowedDomains },
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(
        expect.anything(),
        allowedDomains,
        undefined,
        expect.any(Function),
      );
    });

    it('should handle undefined mcpSettings gracefully', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        // mcpSettings is undefined
      });

      await initializeMCPs();

      expect(mockCreateMCPServersRegistry).toHaveBeenCalledWith(
        expect.anything(),
        undefined,
        undefined,
        expect.any(Function),
      );
    });

    it('wires a per-request resolver that reads the merged (non-baseOnly) config', async () => {
      mockGetAppConfig.mockResolvedValue({
        mcpConfig: null,
        mcpSettings: { allowedDomains: ['yaml.com'] },
      });

      await initializeMCPs();

      const resolver = mockCreateMCPServersRegistry.mock.calls[0][3];
      expect(typeof resolver).toBe('function');

      // The resolver resolves the request's merged allowlists — not the boot YAML base.
      mockGetAppConfig.mockResolvedValue({
        mcpSettings: { allowedDomains: ['merged.com'], allowedAddresses: ['10.0.0.0/8'] },
      });
      const resolved = await resolver({ userId: 'u1', role: 'ADMIN' });

      expect(mockGetAppConfig).toHaveBeenLastCalledWith({ role: 'ADMIN', userId: 'u1' });
      expect(resolved).toEqual({
        allowedDomains: ['merged.com'],
        allowedAddresses: ['10.0.0.0/8'],
      });
    });

    it('requests fail-closed app config resolution for fresh policy validation', async () => {
      mockGetAppConfig.mockResolvedValue({ mcpConfig: null, mcpSettings: {} });
      await initializeMCPs();
      const resolver = mockCreateMCPServersRegistry.mock.calls[0][3];

      await resolver({ userId: 'u1', role: 'ADMIN', refresh: true });

      expect(mockGetAppConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({ refresh: true, failClosed: true }),
      );
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
