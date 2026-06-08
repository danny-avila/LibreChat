import { MCPConnection } from '~/mcp/connection';
import type { MCPOptions } from 'librechat-data-provider';

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

jest.mock('~/mcp/mcpConfig', () => ({
  mcpConfig: { CONNECTION_CHECK_TTL: 0 },
}));

const SERVER_TOOLS = [
  { name: 'searchJira', description: '', inputSchema: { type: 'object' } },
  { name: 'createJiraIssue', description: '', inputSchema: { type: 'object' } },
  { name: 'lookupJiraAccountId', description: '', inputSchema: { type: 'object' } },
  { name: 'searchConfluence', description: '', inputSchema: { type: 'object' } },
];

function createConnection(toolFilter?: MCPOptions['toolFilter']): MCPConnection {
  const serverConfig = {
    type: 'streamable-http',
    url: 'http://127.0.0.1:9/',
    toolFilter,
  } as MCPOptions;
  const conn = new MCPConnection({
    serverName: 'atlassian',
    serverConfig,
    useSSRFProtection: false,
  });
  conn.client.listTools = jest.fn().mockResolvedValue({ tools: SERVER_TOOLS });
  return conn;
}

describe('MCPConnection.fetchTools toolFilter', () => {
  const toolNames = (tools: Array<{ name: string }>) => tools.map((t) => t.name).sort();

  it('returns all tools when no filter is configured', async () => {
    const conn = createConnection();
    const tools = await conn.fetchTools();
    expect(toolNames(tools)).toEqual([
      'createJiraIssue',
      'lookupJiraAccountId',
      'searchConfluence',
      'searchJira',
    ]);
  });

  it('keeps only tools matching the include allowlist', async () => {
    const conn = createConnection({ include: [{ regex: '.*Jira.*' }] });
    const tools = await conn.fetchTools();
    expect(toolNames(tools)).toEqual(['createJiraIssue', 'lookupJiraAccountId', 'searchJira']);
  });

  it('applies exclude after include', async () => {
    const conn = createConnection({
      include: [{ regex: '.*Jira.*' }],
      exclude: ['lookupJiraAccountId'],
    });
    const tools = await conn.fetchTools();
    expect(toolNames(tools)).toEqual(['createJiraIssue', 'searchJira']);
  });
});
