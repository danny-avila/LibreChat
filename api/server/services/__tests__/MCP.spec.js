const mockRegistry = {
  ensureConfigServers: jest.fn(),
  getAllServerConfigs: jest.fn(),
};

jest.mock('~/config', () => ({
  getMCPServersRegistry: jest.fn(() => mockRegistry),
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getOAuthReconnectionManager: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(() => 'tenant-1'),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
  setCachedTools: jest.fn(),
  getCachedTools: jest.fn(),
  getMCPServerTools: jest.fn(),
  loadCustomConfig: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
  MCPOAuthHandler: jest.fn(),
  isMCPDomainAllowed: jest.fn(),
  normalizeServerName: jest.fn((name) => name),
  normalizeJsonSchema: jest.fn((schema) => schema),
  GenerationJobManager: { emitChunk: jest.fn() },
  resolveJsonSchemaRefs: jest.fn((schema) => schema),
  buildOAuthToolCallName: jest.fn((name) => name),
}));

jest.mock('~/cache', () => ({ getLogStores: jest.fn() }));
jest.mock('~/models', () => ({
  findToken: jest.fn(),
  createToken: jest.fn(),
  updateToken: jest.fn(),
}));
jest.mock('~/server/services/GraphTokenService', () => ({
  getGraphApiToken: jest.fn(),
}));
jest.mock('~/server/services/OboTokenService', () => ({
  exchangeOboToken: jest.fn(),
}));
jest.mock('~/server/services/OboPolicyService', () => ({
  createOboTrustChecker: jest.fn(() => async () => true),
}));
jest.mock('~/server/services/Tools/mcp', () => ({
  reinitMCPServer: jest.fn(),
}));

const { getAppConfig } = require('~/server/services/Config');
const { sendEvent, GenerationJobManager } = require('@librechat/api');
const {
  resolveConfigServers,
  resolveMcpConfigNames,
  resolveAllMcpConfigs,
  createElicitationStart,
  getElicitationFlowContext,
  resolveElicitationFlow,
} = require('../MCP');

describe('resolveConfigServers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves config servers for the current request context', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: { url: 'http://a' } } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ srv: { name: 'srv' } });

    const result = await resolveConfigServers({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual({ srv: { name: 'srv' } });
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({ srv: { url: 'http://a' } });
  });

  it('returns {} when ensureConfigServers throws', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('returns {} when getAppConfig throws', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    const result = await resolveConfigServers({ user: { id: 'u1' } });

    expect(result).toEqual({});
  });

  it('passes empty mcpConfig when appConfig has none', async () => {
    getAppConfig.mockResolvedValue({});
    mockRegistry.ensureConfigServers.mockResolvedValue({});

    await resolveConfigServers({ user: { id: 'u1' } });

    expect(mockRegistry.ensureConfigServers).toHaveBeenCalledWith({});
  });
});

describe('resolveMcpConfigNames', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves current request config server names', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {}, yaml_srv: {} } });

    const result = await resolveMcpConfigNames({ user: { id: 'u1', role: 'admin' } });

    expect(result).toEqual(['cfg_srv', 'yaml_srv']);
    expect(getAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', userId: 'u1' }),
    );
  });

  it('returns [] when mcpConfig is absent', async () => {
    getAppConfig.mockResolvedValue({});

    const result = await resolveMcpConfigNames({ user: { id: 'u1' } });

    expect(result).toEqual([]);
  });

  it('propagates getAppConfig failures for write-path callers', async () => {
    getAppConfig.mockRejectedValue(new Error('db timeout'));

    await expect(resolveMcpConfigNames({ user: { id: 'u1' } })).rejects.toThrow('db timeout');
  });
});

describe('resolveAllMcpConfigs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('merges config servers with base servers', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { cfg_srv: {} } });
    mockRegistry.ensureConfigServers.mockResolvedValue({ cfg_srv: { name: 'cfg_srv' } });
    mockRegistry.getAllServerConfigs.mockResolvedValue({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1', role: 'user' });

    expect(result).toEqual({
      cfg_srv: { name: 'cfg_srv' },
      yaml_srv: { name: 'yaml_srv' },
    });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith(
      'u1',
      {
        cfg_srv: { name: 'cfg_srv' },
      },
      'user',
    );
  });

  it('continues with empty configServers when ensureConfigServers fails', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: { srv: {} } });
    mockRegistry.ensureConfigServers.mockRejectedValue(new Error('inspect failed'));
    mockRegistry.getAllServerConfigs.mockResolvedValue({ yaml_srv: { name: 'yaml_srv' } });

    const result = await resolveAllMcpConfigs('u1', { id: 'u1' });

    expect(result).toEqual({ yaml_srv: { name: 'yaml_srv' } });
    expect(mockRegistry.getAllServerConfigs).toHaveBeenCalledWith('u1', {});
  });

  it('propagates getAllServerConfigs failures', async () => {
    getAppConfig.mockResolvedValue({ mcpConfig: {} });
    mockRegistry.ensureConfigServers.mockResolvedValue({});
    mockRegistry.getAllServerConfigs.mockRejectedValue(new Error('redis down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('redis down');
  });

  it('propagates getAppConfig failures', async () => {
    getAppConfig.mockRejectedValue(new Error('mongo down'));

    await expect(resolveAllMcpConfigs('u1', { id: 'u1' })).rejects.toThrow('mongo down');
  });
});

describe('createElicitationStart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits the on_elicitation event via sendEvent when no streamId is set', async () => {
    const res = { write: jest.fn() };
    const start = createElicitationStart({ res, stepId: 'step-1', streamId: null });

    await start({
      flowId: 'u:s:t:n1',
      mode: 'url',
      message: 'Authorize access',
      serverName: 'jira',
      toolName: 'create_issue',
      url: 'https://auth.example.com/authorize',
    });

    expect(GenerationJobManager.emitChunk).not.toHaveBeenCalled();
    expect(sendEvent).toHaveBeenCalledWith(res, {
      event: 'on_elicitation',
      data: expect.objectContaining({
        id: 'step-1',
        elicitation: expect.objectContaining({
          flowId: 'u:s:t:n1',
          mode: 'url',
          message: 'Authorize access',
          serverName: 'jira',
          toolName: 'create_issue',
          url: 'https://auth.example.com/authorize',
        }),
      }),
    });
  });

  it('emits the on_elicitation event via emitChunk when a streamId is set', async () => {
    const start = createElicitationStart({ res: {}, stepId: 'step-2', streamId: 'stream-9' });

    await start({ flowId: 'u:s:t:n2', mode: 'url', message: 'Authorize', url: 'https://x/auth' });

    expect(sendEvent).not.toHaveBeenCalled();
    expect(GenerationJobManager.emitChunk).toHaveBeenCalledWith(
      'stream-9',
      expect.objectContaining({
        event: 'on_elicitation',
        data: expect.objectContaining({
          elicitation: expect.objectContaining({
            flowId: 'u:s:t:n2',
            mode: 'url',
            url: 'https://x/auth',
          }),
        }),
      }),
    );
  });

  it('captures the stream context so the completion route can emit resolution', async () => {
    const start = createElicitationStart({ res: {}, stepId: 'step-ctx', streamId: 'stream-ctx' });

    await start({ flowId: 'flow-ctx', mode: 'url', message: 'x', url: 'https://x/auth' });

    expect(getElicitationFlowContext('flow-ctx')).toEqual(
      expect.objectContaining({ streamId: 'stream-ctx', stepId: 'step-ctx' }),
    );
  });

  it('retains the server-supplied elicitationId in the flow context without leaking it onto the SSE event', async () => {
    const start = createElicitationStart({ res: {}, stepId: 'step-eid', streamId: 'stream-eid' });

    await start({
      flowId: 'flow-eid',
      mode: 'url',
      message: 'Authorize',
      url: 'https://x/auth',
      elicitationId: 'elicit-9',
    });

    expect(getElicitationFlowContext('flow-eid')).toEqual(
      expect.objectContaining({ elicitationId: 'elicit-9' }),
    );
    expect(GenerationJobManager.emitChunk).toHaveBeenCalledWith(
      'stream-eid',
      expect.objectContaining({
        data: expect.objectContaining({
          elicitation: expect.not.objectContaining({ elicitationId: expect.anything() }),
        }),
      }),
    );
  });
});

describe('resolveElicitationFlow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits on_elicitation_resolved onto the captured stream and consumes the context', async () => {
    const start = createElicitationStart({ res: {}, stepId: 'step-r', streamId: 'stream-r' });
    await start({ flowId: 'flow-resolve', mode: 'url', message: 'x', url: 'https://x/auth' });
    GenerationJobManager.emitChunk.mockClear();

    const emitted = await resolveElicitationFlow({
      flowId: 'flow-resolve',
      action: 'complete',
    });

    expect(emitted).toBe(true);
    expect(GenerationJobManager.emitChunk).toHaveBeenCalledWith(
      'stream-r',
      expect.objectContaining({
        event: 'on_elicitation_resolved',
        data: expect.objectContaining({
          id: 'step-r',
          flowId: 'flow-resolve',
          action: 'complete',
        }),
      }),
    );

    // Context is single-use: a second resolution is a no-op.
    expect(await resolveElicitationFlow({ flowId: 'flow-resolve', action: 'cancel' })).toBe(false);
    expect(getElicitationFlowContext('flow-resolve')).toBeUndefined();
  });

  it('returns false when no context exists for the flow', async () => {
    expect(await resolveElicitationFlow({ flowId: 'never-started', action: 'complete' })).toBe(
      false,
    );
  });

  it('emits via sendEvent for a non-resumable (no streamId) stream', async () => {
    const res = { write: jest.fn() };
    const start = createElicitationStart({ res, stepId: 'step-direct', streamId: null });
    await start({ flowId: 'flow-direct', mode: 'url', message: 'auth', url: 'https://x' });
    sendEvent.mockClear();

    const emitted = await resolveElicitationFlow({ flowId: 'flow-direct', action: 'complete' });

    expect(emitted).toBe(true);
    expect(sendEvent).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ event: 'on_elicitation_resolved' }),
    );
  });
});
