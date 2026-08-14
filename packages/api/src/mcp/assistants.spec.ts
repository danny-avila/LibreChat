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

  it('limits concurrent cold catalog recovery across referenced servers', async () => {
    const serverNames = ['one', 'two', 'three', 'four', 'five'];
    const configs = Object.fromEntries(
      serverNames.map((name) => [
        name,
        { ...serverConfig, url: `https://${name}.example.com/mcp` },
      ]),
    );
    let active = 0;
    let peak = 0;
    const recoverServerTools = jest.fn(async (name: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      const key = `search${Constants.mcp_delimiter}${name}`;
      return { [key]: { type: 'function' as const, ['function']: { name: key } } };
    });
    const deps = createDeps({
      getAllServerConfigs: jest.fn().mockResolvedValue(configs),
      getMCPServerTools: jest.fn().mockResolvedValue(null),
      getServerToolFunctionsSnapshot: jest.fn().mockResolvedValue({ tools: null }),
      recoverServerTools,
    });

    await getAssistantToolDefinitions(
      {
        ...params,
        tools: serverNames.map((name) => `search${Constants.mcp_delimiter}${name}`),
      },
      deps,
    );

    expect(recoverServerTools).toHaveBeenCalledTimes(serverNames.length);
    expect(peak).toBe(3);
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

  it('propagates config-server resolution failures instead of dropping selected tools', async () => {
    const resolutionError = new Error('config resolution failed');
    const deps = createDeps({
      ensureConfigServers: jest.fn().mockRejectedValue(resolutionError),
    });

    await expect(getAssistantToolDefinitions(params, deps)).rejects.toBe(resolutionError);
    expect(deps.getAllServerConfigs).not.toHaveBeenCalled();
    expect(deps.getMCPServerTools).not.toHaveBeenCalled();
  });

  it('rejects a selected config server omitted by partial initialization', async () => {
    const deps = createDeps({
      ensureConfigServers: jest.fn().mockResolvedValue({}),
      getAllServerConfigs: jest.fn().mockResolvedValue({}),
    });

    await expect(
      getAssistantToolDefinitions({ ...params, mcpConfig: { 'app-server': serverConfig } }, deps),
    ).rejects.toThrow('MCP server configuration unavailable for assistant server "app-server"');
    expect(deps.getMCPServerTools).not.toHaveBeenCalled();
  });

  it('does not route a missing normalized config server to a colliding available server', async () => {
    const collidingToolKey = `search${Constants.mcp_delimiter}foo`;
    const deps = createDeps({
      ensureConfigServers: jest.fn().mockResolvedValue({}),
      getAllServerConfigs: jest.fn().mockResolvedValue({ foo: serverConfig }),
    });

    await expect(
      getAssistantToolDefinitions(
        {
          ...params,
          tools: [collidingToolKey],
          mcpConfig: { 'foo!': { ...serverConfig, url: 'https://other.example.com/mcp' } },
        },
        deps,
      ),
    ).rejects.toThrow('MCP server configuration unavailable for assistant server "foo!"');
    expect(deps.getMCPServerTools).not.toHaveBeenCalled();
  });

  it('does not classify a known static tool containing the MCP delimiter as an MCP reference', async () => {
    const staticToolKey = `get${Constants.mcp_delimiter}status`;
    const staticTools: LCAvailableTools = {
      [staticToolKey]: {
        type: 'function',
        ['function']: { name: staticToolKey },
      },
    };
    const deps = createDeps({
      getAllServerConfigs: jest.fn().mockResolvedValue({ status: serverConfig }),
    });

    await expect(
      getAssistantToolDefinitions(
        {
          ...params,
          tools: [staticToolKey],
          staticTools,
        },
        deps,
      ),
    ).resolves.toBe(staticTools);
    expect(deps.ensureConfigServers).not.toHaveBeenCalled();
    expect(deps.getMCPServerTools).not.toHaveBeenCalled();
  });
});
