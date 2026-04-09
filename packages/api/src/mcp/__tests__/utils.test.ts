import {
  buildOAuthToolCallName,
  normalizeServerName,
  redactAllServerSecrets,
  redactServerSecrets,
  isUserSourced,
} from '~/mcp/utils';
import type { ParsedServerConfig } from '~/mcp/types';

describe('normalizeServerName', () => {
  it('should not modify server names that already match the pattern', () => {
    const result = normalizeServerName('valid-server_name.123');
    expect(result).toBe('valid-server_name.123');
  });

  it('should normalize server names with non-ASCII characters', () => {
    const result = normalizeServerName('我的服务');
    // Should generate a fallback name with a hash
    expect(result).toMatch(/^server_\d+$/);
    expect(result).toMatch(/^[a-zA-Z0-9_.-]+$/);
  });

  it('should normalize server names with special characters', () => {
    const result = normalizeServerName('server@name!');
    // The actual result doesn't have the trailing underscore after trimming
    expect(result).toBe('server_name');
    expect(result).toMatch(/^[a-zA-Z0-9_.-]+$/);
  });

  it('should trim leading and trailing underscores', () => {
    const result = normalizeServerName('!server-name!');
    expect(result).toBe('server-name');
    expect(result).toMatch(/^[a-zA-Z0-9_.-]+$/);
  });
});

describe('buildOAuthToolCallName', () => {
  it('should prefix a simple server name with oauth_mcp_', () => {
    expect(buildOAuthToolCallName('my-server')).toBe('oauth_mcp_my-server');
  });

  it('should not double-wrap a name that already starts with oauth_mcp_', () => {
    expect(buildOAuthToolCallName('oauth_mcp_my-server')).toBe('oauth_mcp_my-server');
  });

  it('should correctly handle server names containing _mcp_ substring', () => {
    const result = buildOAuthToolCallName('my_mcp_server');
    expect(result).toBe('oauth_mcp_my_mcp_server');
  });

  it('should normalize non-ASCII server names before prefixing', () => {
    const result = buildOAuthToolCallName('我的服务');
    expect(result).toMatch(/^oauth_mcp_server_\d+$/);
  });

  it('should normalize special characters before prefixing', () => {
    expect(buildOAuthToolCallName('server@name!')).toBe('oauth_mcp_server_name');
  });

  it('should handle empty string server name gracefully', () => {
    const result = buildOAuthToolCallName('');
    expect(result).toMatch(/^oauth_mcp_server_\d+$/);
  });

  it('should treat a name already starting with oauth_mcp_ as pre-wrapped', () => {
    // At the function level, a name starting with the oauth prefix is
    // indistinguishable from a pre-wrapped name — guard prevents double-wrapping.
    // Server names with this prefix should be blocked at registration time.
    expect(buildOAuthToolCallName('oauth_mcp_github')).toBe('oauth_mcp_github');
  });

  it('should not treat special chars that normalize to oauth_mcp_* as pre-wrapped', () => {
    // oauth@mcp@server does NOT start with 'oauth_mcp_' before normalization,
    // so the guard correctly does not fire and the prefix is added.
    const result = buildOAuthToolCallName('oauth@mcp@server');
    expect(result).toBe('oauth_mcp_oauth_mcp_server');
  });
});

describe('redactServerSecrets', () => {
  it('should strip apiKey.key from admin-sourced keys', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      apiKey: {
        source: 'admin',
        authorization_type: 'bearer',
        key: 'super-secret-api-key',
      },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.apiKey?.key).toBeUndefined();
    expect(redacted.apiKey?.source).toBe('admin');
    expect(redacted.apiKey?.authorization_type).toBe('bearer');
  });

  it('should strip oauth.client_secret', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      oauth: {
        client_id: 'my-client',
        client_secret: 'super-secret-oauth',
        scope: 'read',
      },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.oauth?.client_secret).toBeUndefined();
    expect(redacted.oauth?.client_id).toBe('my-client');
    expect(redacted.oauth?.scope).toBe('read');
  });

  it('should strip both apiKey.key and oauth.client_secret simultaneously', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      apiKey: {
        source: 'admin',
        authorization_type: 'custom',
        custom_header: 'X-API-Key',
        key: 'secret-key',
      },
      oauth: {
        client_id: 'cid',
        client_secret: 'csecret',
      },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.apiKey?.key).toBeUndefined();
    expect(redacted.apiKey?.custom_header).toBe('X-API-Key');
    expect(redacted.oauth?.client_secret).toBeUndefined();
    expect(redacted.oauth?.client_id).toBe('cid');
  });

  it('should exclude headers from SSE configs', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'SSE Server',
    };
    (config as ParsedServerConfig & { headers: Record<string, string> }).headers = {
      Authorization: 'Bearer admin-token-123',
      'X-Custom': 'safe-value',
    };
    const redacted = redactServerSecrets(config);
    expect((redacted as Record<string, unknown>).headers).toBeUndefined();
    expect(redacted.title).toBe('SSE Server');
  });

  it('should exclude env from stdio configs', () => {
    const config: ParsedServerConfig = {
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { DATABASE_URL: 'postgres://admin:password@localhost/db', PATH: '/usr/bin' },
    };
    const redacted = redactServerSecrets(config);
    expect((redacted as Record<string, unknown>).env).toBeUndefined();
    expect((redacted as Record<string, unknown>).command).toBeUndefined();
    expect((redacted as Record<string, unknown>).args).toBeUndefined();
  });

  it('should exclude oauth_headers', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      oauth_headers: { Authorization: 'Bearer oauth-admin-token' },
    };
    const redacted = redactServerSecrets(config);
    expect((redacted as Record<string, unknown>).oauth_headers).toBeUndefined();
  });

  it('should strip apiKey.key even for user-sourced keys', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      apiKey: { source: 'user', authorization_type: 'bearer', key: 'my-own-key' },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.apiKey?.key).toBeUndefined();
    expect(redacted.apiKey?.source).toBe('user');
  });

  it('should not mutate the original config', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      apiKey: { source: 'admin', authorization_type: 'bearer', key: 'secret' },
      oauth: { client_id: 'cid', client_secret: 'csecret' },
    };
    redactServerSecrets(config);
    expect(config.apiKey?.key).toBe('secret');
    expect(config.oauth?.client_secret).toBe('csecret');
  });

  it('should preserve all safe metadata fields', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'My Server',
      description: 'A test server',
      iconPath: '/icons/test.png',
      chatMenu: true,
      requiresOAuth: false,
      capabilities: '{"tools":{}}',
      tools: 'tool_a, tool_b',
      dbId: 'abc123',
      updatedAt: 1700000000000,
      consumeOnly: false,
      inspectionFailed: false,
      customUserVars: { API_KEY: { title: 'API Key', description: 'Your key' } },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.title).toBe('My Server');
    expect(redacted.description).toBe('A test server');
    expect(redacted.iconPath).toBe('/icons/test.png');
    expect(redacted.chatMenu).toBe(true);
    expect(redacted.requiresOAuth).toBe(false);
    expect(redacted.capabilities).toBe('{"tools":{}}');
    expect(redacted.tools).toBe('tool_a, tool_b');
    expect(redacted.dbId).toBe('abc123');
    expect(redacted.updatedAt).toBe(1700000000000);
    expect(redacted.consumeOnly).toBe(false);
    expect(redacted.inspectionFailed).toBe(false);
    expect(redacted.customUserVars).toEqual(config.customUserVars);
  });

  it('should pass URLs through unchanged', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://mcp.example.com/sse?param=value',
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.url).toBe('https://mcp.example.com/sse?param=value');
  });

  it('should only include explicitly allowlisted fields', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'Test',
    };
    (config as Record<string, unknown>).someNewSensitiveField = 'leaked-value';
    const redacted = redactServerSecrets(config);
    expect((redacted as Record<string, unknown>).someNewSensitiveField).toBeUndefined();
    expect(redacted.title).toBe('Test');
  });
});

describe('redactAllServerSecrets', () => {
  it('should redact secrets from all configs in the map', () => {
    const configs: Record<string, ParsedServerConfig> = {
      'server-a': {
        type: 'sse',
        url: 'https://a.com/mcp',
        apiKey: { source: 'admin', authorization_type: 'bearer', key: 'key-a' },
      },
      'server-b': {
        type: 'sse',
        url: 'https://b.com/mcp',
        oauth: { client_id: 'cid-b', client_secret: 'secret-b' },
      },
      'server-c': {
        type: 'stdio',
        command: 'node',
        args: ['c.js'],
      },
    };
    const redacted = redactAllServerSecrets(configs);
    expect(redacted['server-a'].apiKey?.key).toBeUndefined();
    expect(redacted['server-a'].apiKey?.source).toBe('admin');
    expect(redacted['server-b'].oauth?.client_secret).toBeUndefined();
    expect(redacted['server-b'].oauth?.client_id).toBe('cid-b');
    expect((redacted['server-c'] as Record<string, unknown>).command).toBeUndefined();
  });
});

describe('isUserSourced', () => {
  it('returns false when source is yaml', () => {
    expect(isUserSourced({ source: 'yaml' })).toBe(false);
  });

  it('returns false when source is config', () => {
    expect(isUserSourced({ source: 'config' })).toBe(false);
  });

  it('returns true when source is user', () => {
    expect(isUserSourced({ source: 'user' })).toBe(true);
  });

  it('falls back to dbId when source is undefined — dbId present means user-sourced', () => {
    expect(isUserSourced({ source: undefined, dbId: 'abc123' })).toBe(true);
  });

  it('falls back to dbId when source is undefined — no dbId means trusted', () => {
    expect(isUserSourced({ source: undefined, dbId: undefined })).toBe(false);
  });

  it('returns false when both source and dbId are absent (pre-upgrade YAML server)', () => {
    expect(isUserSourced({})).toBe(false);
  });
});
