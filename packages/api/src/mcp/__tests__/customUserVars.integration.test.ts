/**
 * Integration test exercising real processMCPEnv for the non-OAuth
 * customUserVars scenario: a streamable-http server whose URL contains
 * a {{PLACEHOLDER}} that must be resolved from per-user custom variables.
 *
 * This is the exact bug scenario from PR #12348 — without the fix,
 * the literal string `{{MY_CUSTOM_KEY}}` would be sent to the MCP
 * server endpoint instead of the substituted value.
 */
import type { IUser } from '@librechat/data-schemas';
import type * as t from '~/mcp/types';
import { processMCPEnv } from '~/utils/env';

describe('processMCPEnv — customUserVars placeholder resolution', () => {
  const mockUser = { id: 'user-abc', email: 'test@example.com' } as IUser;

  it('should resolve {{CUSTOM_VAR}} in a streamable-http URL', () => {
    const serverConfig: t.MCPOptions = {
      type: 'streamable-http',
      url: 'https://my-mcp.server.com/server?key={{MY_CUSTOM_KEY}}',
    } as t.MCPOptions;

    const result = processMCPEnv({
      options: serverConfig,
      user: mockUser,
      customUserVars: { MY_CUSTOM_KEY: 'c527bd0abc123' },
    });

    expect((result as t.StreamableHTTPOptions).url).toBe(
      'https://my-mcp.server.com/server?key=c527bd0abc123',
    );
  });

  it('should resolve multiple placeholders in URL and headers simultaneously', () => {
    const serverConfig: t.MCPOptions = {
      type: 'streamable-http',
      url: 'https://my-mcp.server.com/server?key={{API_KEY}}&project={{PROJECT_ID}}',
      headers: {
        Authorization: 'Bearer {{AUTH_TOKEN}}',
        'X-Project': '{{PROJECT_ID}}',
      },
    } as t.MCPOptions;

    const result = processMCPEnv({
      options: serverConfig,
      user: mockUser,
      customUserVars: {
        API_KEY: 'key-123',
        PROJECT_ID: 'proj-456',
        AUTH_TOKEN: 'tok-789',
      },
    });

    const typed = result as t.StreamableHTTPOptions;
    expect(typed.url).toBe('https://my-mcp.server.com/server?key=key-123&project=proj-456');
    expect(typed.headers).toEqual({
      Authorization: 'Bearer tok-789',
      'X-Project': 'proj-456',
    });
  });

  it('should leave unmatched placeholders as literal strings when customUserVars is undefined', () => {
    const serverConfig: t.MCPOptions = {
      type: 'streamable-http',
      url: 'https://my-mcp.server.com/server?key={{MY_CUSTOM_KEY}}',
    } as t.MCPOptions;

    const result = processMCPEnv({
      options: serverConfig,
    });

    expect((result as t.StreamableHTTPOptions).url).toContain('{{MY_CUSTOM_KEY}}');
  });
});
