import { MCPServerInspector } from '~/mcp/registry/MCPServerInspector';
import { createMockConnection } from './mcpConnectionsMock.helper';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = jest.requireMock('@librechat/data-schemas') as {
  logger: { warn: jest.Mock; debug: jest.Mock; error: jest.Mock; info: jest.Mock };
};

describe('MCPServerInspector.getToolFunctions tool-name length', () => {
  beforeEach(() => {
    logger.warn.mockClear();
  });

  it('warns once when the composed tool name exceeds the OpenAI 64-char limit', async () => {
    const mockConnection = createMockConnection('ignored');
    // 25 server + 5 delimiter ("_mcp_") + 40 tool = 70 chars (> 64)
    const longServerName = 'my-very-long-mcp-server-1';
    const longToolName = 'execute_extremely_descriptive_action_name';
    mockConnection.client.listTools = jest.fn().mockResolvedValue({
      tools: [{ name: longToolName, description: 'long', inputSchema: { type: 'object' } }],
    });

    const result = await MCPServerInspector.getToolFunctions(longServerName, mockConnection);

    const expectedKey = `${longToolName}_mcp_${longServerName}`;
    expect(result[expectedKey]).toBeDefined();
    expect(result[expectedKey].function.name).toBe(expectedKey);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const message = logger.warn.mock.calls[0][0] as string;
    expect(message).toContain('MCP Inspector');
    expect(message).toContain(longServerName);
    expect(message).toContain(longToolName);
    expect(message).toContain('exceeds');
    expect(message).toContain('64');
  });

  it('does not warn for tool names within the OpenAI 64-char limit', async () => {
    const mockConnection = createMockConnection('brave');
    mockConnection.client.listTools = jest.fn().mockResolvedValue({
      tools: [{ name: 'search', description: 'ok', inputSchema: { type: 'object' } }],
    });

    const result = await MCPServerInspector.getToolFunctions('brave', mockConnection);

    expect(result['search_mcp_brave']).toBeDefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns per offending tool when multiple tools exceed the limit', async () => {
    const mockConnection = createMockConnection('ignored');
    const longServerName = 'my-very-long-mcp-server-1';
    mockConnection.client.listTools = jest.fn().mockResolvedValue({
      tools: [
        { name: 'execute_extremely_descriptive_action_name', description: 'a' },
        { name: 'ok', description: 'b' }, // ok_mcp_my-very-long-mcp-server-1 = 32 chars
        { name: 'another_extremely_descriptive_tool_name_x', description: 'c' },
      ],
    });

    await MCPServerInspector.getToolFunctions(longServerName, mockConnection);

    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
