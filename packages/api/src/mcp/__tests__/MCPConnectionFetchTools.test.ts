/**
 * Unit tests for MCPConnection.fetchTools pagination.
 *
 * MCP `tools/list` is a paginated method: the server may return a page of tools
 * plus a `nextCursor` that the client must follow to retrieve the rest. These
 * tests verify that fetchTools walks every page, passes the cursor back
 * unchanged, and is bounded against misbehaving servers (page cap + repeated
 * cursor guard) while preserving the original single-page and error behavior.
 */

import { logger } from '@librechat/data-schemas';
import { MCPConnection } from '~/mcp/connection';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/auth', () => ({
  createSSRFSafeUndiciConnect: jest.fn(() => undefined),
  isOAuthUrlAllowed: jest.fn(() => false),
  isSSRFTarget: jest.fn(() => false),
  resolveHostnameSSRF: jest.fn(async () => false),
}));

/** Pin the page cap to a small value so the cap path is cheap to exercise. */
jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { TOOLS_LIST_MAX_PAGES: 3, CONNECTION_CHECK_TTL: 0 },
}));

const mockLogger = logger as jest.Mocked<typeof logger>;

const makeTool = (name: string) => ({
  name,
  description: `${name} description`,
  inputSchema: { type: 'object' as const, properties: {} },
});

/** Build a bare MCPConnection (no real transport) with an injected, controllable client. */
function createConnectionWithListTools(listTools: jest.Mock): MCPConnection {
  const conn = new MCPConnection({
    serverName: 'pagination-test',
    serverConfig: { type: 'streamable-http', url: 'http://localhost/mcp' },
    useSSRFProtection: false,
  });
  conn.client = { listTools } as unknown as MCPConnection['client'];
  return conn;
}

describe('MCPConnection.fetchTools pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the tools from a single page and makes one request when there is no nextCursor', async () => {
    const listTools = jest.fn().mockResolvedValue({ tools: [makeTool('a'), makeTool('b')] });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('follows nextCursor across pages, concatenating every tool and passing the cursor back', async () => {
    const listTools = jest.fn(async (params?: { cursor?: string }) => {
      switch (params?.cursor) {
        case undefined:
          return { tools: [makeTool('a'), makeTool('b')], nextCursor: 'c1' };
        case 'c1':
          return { tools: [makeTool('c'), makeTool('d')], nextCursor: 'c2' };
        case 'c2':
          return { tools: [makeTool('e')] };
        default:
          throw new Error(`unexpected cursor: ${params?.cursor}`);
      }
    });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools.map((t) => t.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(listTools).toHaveBeenCalledTimes(3);
    expect(listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(listTools).toHaveBeenNthCalledWith(2, { cursor: 'c1' });
    expect(listTools).toHaveBeenNthCalledWith(3, { cursor: 'c2' });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('stops at the page cap and warns when a server keeps returning new cursors', async () => {
    let page = 0;
    const listTools = jest.fn(async () => {
      page += 1;
      return { tools: [makeTool(`t${page}`)], nextCursor: `cursor-${page}` };
    });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    // mcpConfig.TOOLS_LIST_MAX_PAGES is mocked to 3.
    expect(listTools).toHaveBeenCalledTimes(3);
    expect(tools.map((t) => t.name)).toEqual(['t1', 't2', 't3']);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('pagination limit'));
  });

  it('stops and warns when the server repeats a cursor instead of looping forever', async () => {
    const listTools = jest.fn().mockResolvedValue({ tools: [makeTool('x')], nextCursor: 'same' });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(listTools).toHaveBeenCalledTimes(2);
    // The second page's tools are collected before the repeated cursor is detected, hence two copies.
    expect(tools.map((t) => t.name)).toEqual(['x', 'x']);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('repeated tools/list cursor'),
    );
  });

  it('continues paginating across an empty intermediate page', async () => {
    const listTools = jest.fn(async (params?: { cursor?: string }) => {
      if (params?.cursor == null) {
        return { tools: [], nextCursor: 'c1' };
      }
      return { tools: [makeTool('a')] };
    });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools.map((t) => t.name)).toEqual(['a']);
    expect(listTools).toHaveBeenCalledTimes(2);
  });

  it('treats an empty-string nextCursor as a valid cursor, not end-of-list', async () => {
    const listTools = jest.fn(async (params?: { cursor?: string }) => {
      if (params?.cursor == null) {
        return { tools: [makeTool('a')], nextCursor: '' };
      }
      return { tools: [makeTool('b')] };
    });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(listTools).toHaveBeenCalledTimes(2);
    expect(listTools).toHaveBeenNthCalledWith(2, { cursor: '' });
  });

  it('returns the pages already fetched when a later page fails, without throwing', async () => {
    const listTools = jest.fn(async (params?: { cursor?: string }) => {
      if (params?.cursor == null) {
        return { tools: [makeTool('a'), makeTool('b')], nextCursor: 'c1' };
      }
      throw new Error('page 2 boom');
    });
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(listTools).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch tools'));
  });

  it('returns an empty array when the first page request rejects', async () => {
    const listTools = jest.fn().mockRejectedValue(new Error('boom'));
    const conn = createConnectionWithListTools(listTools);

    const tools = await conn.fetchTools();

    expect(tools).toEqual([]);
    expect(listTools).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch tools'));
  });
});
