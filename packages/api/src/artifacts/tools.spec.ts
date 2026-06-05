import { isToolAllowed, isMcpToolKey, parseMcpToolKey, authorizeArtifactToolCall } from './tools';

describe('isToolAllowed', () => {
  it('matches exact tool keys only', () => {
    const allow = ['list_prs_mcp_github'];
    expect(isToolAllowed(allow, 'list_prs_mcp_github')).toBe(true);
    expect(isToolAllowed(allow, 'delete_repo_mcp_github')).toBe(false);
  });

  it('is false for an undefined or empty allowlist', () => {
    expect(isToolAllowed(undefined, 'list_prs_mcp_github')).toBe(false);
    expect(isToolAllowed([], 'list_prs_mcp_github')).toBe(false);
  });
});

describe('parseMcpToolKey', () => {
  it('splits a valid MCP tool key', () => {
    expect(parseMcpToolKey('list_prs_mcp_github')).toEqual({
      toolName: 'list_prs',
      serverName: 'github',
    });
  });

  it('returns null for non-MCP keys', () => {
    expect(parseMcpToolKey('execute_code')).toBeNull();
    expect(isMcpToolKey('execute_code')).toBe(false);
    expect(isMcpToolKey('list_prs_mcp_github')).toBe(true);
  });
});

describe('authorizeArtifactToolCall', () => {
  const allowlist = ['list_prs_mcp_github', 'send_msg_mcp_slack'];

  it('authorizes an allowlisted MCP tool and resolves its server', () => {
    expect(authorizeArtifactToolCall(allowlist, 'list_prs_mcp_github')).toEqual({
      allowed: true,
      serverName: 'github',
      toolName: 'list_prs',
    });
  });

  it('rejects a tool outside the file allowlist', () => {
    expect(authorizeArtifactToolCall(allowlist, 'delete_repo_mcp_github')).toEqual({
      allowed: false,
      reason: 'not_allowed',
    });
  });

  it('rejects when the file declares no allowlist', () => {
    expect(authorizeArtifactToolCall(undefined, 'list_prs_mcp_github')).toEqual({
      allowed: false,
      reason: 'not_allowed',
    });
  });

  it('rejects an allowlisted non-MCP tool', () => {
    expect(authorizeArtifactToolCall(['execute_code'], 'execute_code')).toEqual({
      allowed: false,
      reason: 'not_mcp',
    });
  });
});
