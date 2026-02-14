import { MCPConnection } from '../connection';

const mockClientCtor = jest.fn();

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation((...args: unknown[]) => {
    mockClientCtor(...args);
    return {
      setNotificationHandler: jest.fn(),
      close: jest.fn(),
      connect: jest.fn(),
      ping: jest.fn(),
      getServerCapabilities: jest.fn(),
      listTools: jest.fn(),
      listResources: jest.fn(),
      listPrompts: jest.fn(),
    };
  }),
}));

describe('MCPConnection capability advertisement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advertises MCP Apps support using extension and compatibility shapes when enabled', () => {
    new MCPConnection({
      serverName: 'test',
      enableApps: true,
      serverConfig: {
        type: 'stdio',
        command: 'node',
        args: ['-v'],
      },
    });

    const clientOptions = mockClientCtor.mock.calls[0]?.[1] as {
      capabilities?: Record<string, unknown>;
    };
    const capabilities = clientOptions.capabilities as Record<string, unknown>;

    expect(capabilities).toBeDefined();
    expect(capabilities.extensions).toEqual({
      'io.modelcontextprotocol/ui': {
        mimeTypes: ['text/html;profile=mcp-app'],
      },
    });
    expect(capabilities.experimental).toEqual({
      'io.modelcontextprotocol/ui': {
        mimeTypes: ['text/html;profile=mcp-app'],
      },
    });
  });

  it('does not advertise MCP Apps support when disabled', () => {
    new MCPConnection({
      serverName: 'test',
      enableApps: false,
      serverConfig: {
        type: 'stdio',
        command: 'node',
        args: ['-v'],
      },
    });

    const clientOptions = mockClientCtor.mock.calls[0]?.[1] as {
      capabilities?: Record<string, unknown>;
    };
    expect(clientOptions.capabilities).toEqual({});
  });
});
