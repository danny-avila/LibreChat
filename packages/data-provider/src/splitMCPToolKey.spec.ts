import { splitMCPToolKey } from './config';

describe('splitMCPToolKey', () => {
  it('splits a normal single-delimiter key like String.split would', () => {
    expect(splitMCPToolKey('search_mcp_myserver')).toEqual(['search', 'myserver']);
  });

  it('returns an undefined server name when there is no delimiter', () => {
    expect(splitMCPToolKey('plainToolName')).toEqual(['plainToolName', undefined]);
  });

  it('resolves a raw tool name containing the delimiter via the last occurrence', () => {
    expect(splitMCPToolKey('gitlab-get_mcp_server_version_mcp_gitlab')).toEqual([
      'gitlab-get_mcp_server_version',
      'gitlab',
    ]);
  });

  it('resolves a server name containing the delimiter when known names are supplied', () => {
    expect(splitMCPToolKey('search_mcp_Google_mcp_Workspace', ['Google_mcp_Workspace'])).toEqual([
      'search',
      'Google_mcp_Workspace',
    ]);
  });

  it('prefers the longest matching configured server name', () => {
    expect(
      splitMCPToolKey('search_mcp_Google_mcp_Workspace', ['Workspace', 'Google_mcp_Workspace']),
    ).toEqual(['search', 'Google_mcp_Workspace']);
  });

  it('falls back to the last delimiter when no configured name matches', () => {
    expect(splitMCPToolKey('gitlab-get_mcp_server_version_mcp_gitlab', ['other'])).toEqual([
      'gitlab-get_mcp_server_version',
      'gitlab',
    ]);
  });

  it('still resolves the tool half when both halves contain the delimiter', () => {
    expect(splitMCPToolKey('a_mcp_b_mcp_Google_mcp_Workspace', ['Google_mcp_Workspace'])).toEqual([
      'a_mcp_b',
      'Google_mcp_Workspace',
    ]);
  });
});
