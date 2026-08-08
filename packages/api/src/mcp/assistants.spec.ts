import { Constants } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from './types';
import type { AssistantToolDefinitionsDeps } from './assistants';
import { getAssistantToolDefinitions } from './assistants';

const serverConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  source: 'yaml',
};
const toolKey = `search${Constants.mcp_delimiter}app-server`;
const catalog: LCAvailableTools = {
  [toolKey]: {
    type: 'function',
    ['function']: {
      name: toolKey,
      description: '',
      parameters: { type: 'object', properties: {} },
    },
  },
};

function createDeps(
  overrides: Partial<AssistantToolDefinitionsDeps> = {},
): AssistantToolDefinitionsDeps {
  return {
    ensureConfigServers: jest.fn().mockResolvedValue({}),
    getAllServerConfigs: jest.fn().mockResolvedValue({ 'app-server': serverConfig }),
    getMCPServerTools: jest.fn().mockResolvedValue(catalog),
    getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
    recoverServerTools: jest.fn().mockResolvedValue(null),
    cacheMCPServerTools: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('getAssistantToolDefinitions', () => {
  const params = {
    user: { id: 'user-1', role: 'user' },
    tools: ['code_interpreter', toolKey],
    staticTools: {
      code_interpreter: { type: 'function' as const, ['function']: { name: 'code_interpreter' } },
    },
    mcpConfig: {},
  };

  it('combines static definitions with referenced configuration-addressed MCP catalogs', async () => {
    const deps = createDeps();

    await expect(getAssistantToolDefinitions(params, deps)).resolves.toEqual({
      ...params.staticTools,
      ...catalog,
    });
    expect(deps.getMCPServerTools).toHaveBeenCalledWith('user-1', 'app-server', serverConfig);
  });

  it('reconnects a user server when neither cache nor local snapshot has a catalog', async () => {
    const recoveredCatalog = { ...catalog };
    const recoverServerTools = jest.fn().mockResolvedValue(recoveredCatalog);
    const deps = createDeps({
      getMCPServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      recoverServerTools,
    });

    await expect(getAssistantToolDefinitions(params, deps)).resolves.toEqual({
      ...params.staticTools,
      ...recoveredCatalog,
    });
    expect(recoverServerTools).toHaveBeenCalledWith('app-server', serverConfig);
  });

  it('re-caches an authoritative empty local snapshot after a cache miss', async () => {
    const cacheMCPServerTools = jest.fn().mockResolvedValue(undefined);
    const deps = createDeps({
      getMCPServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({
        tools: {},
        publicationGeneration: 'generation-1',
      }),
      cacheMCPServerTools,
    });

    await expect(getAssistantToolDefinitions(params, deps)).resolves.toEqual(params.staticTools);
    expect(cacheMCPServerTools).toHaveBeenCalledWith({
      userId: 'user-1',
      serverName: 'app-server',
      serverTools: {},
      serverConfig,
      publicationGeneration: 'generation-1',
    });
  });
});
