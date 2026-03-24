import { normalizeServerName, redactServerSecrets, redactAllServerSecrets } from '~/mcp/utils';
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

  it('should exclude headers from YAML/non-UI configs (secretHeaderKeys undefined)', () => {
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

  it('should expose non-secret headers for UI-created servers (secretHeaderKeys defined)', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'SSE Server',
      dbId: '507f1f77bcf86cd799439011',
      secretHeaderKeys: [],
    };
    (config as ParsedServerConfig & { headers: Record<string, string> }).headers = {
      'X-Index-Name': 'my-index',
      'X-Top': '{{INDEX_TOP}}',
    };
    const redacted = redactServerSecrets(config);
    expect(
      (redacted as Record<string, unknown> & { headers: Record<string, string> }).headers,
    ).toEqual({ 'X-Index-Name': 'my-index', 'X-Top': '{{INDEX_TOP}}' });
    expect(redacted.secretHeaderKeys).toEqual([]);
  });

  it('should mask secret header values as empty string and expose non-secret values', () => {
    const config: ParsedServerConfig = {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      dbId: '507f1f77bcf86cd799439012',
      secretHeaderKeys: ['X-Secret-Token'],
    };
    (config as ParsedServerConfig & { headers: Record<string, string> }).headers = {
      'X-Secret-Token': 'super-secret-value',
      'X-Public-Header': 'public-value',
    };
    const redacted = redactServerSecrets(config);
    const headers = (redacted as Record<string, unknown> & { headers: Record<string, string> })
      .headers;
    expect(headers['X-Secret-Token']).toBe('');
    expect(headers['X-Public-Header']).toBe('public-value');
    expect(redacted.secretHeaderKeys).toEqual(['X-Secret-Token']);
  });

  it('should expose secretHeaderKeys: [] for UI servers with all non-secret headers', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      dbId: '507f1f77bcf86cd799439013',
      secretHeaderKeys: [],
    };
    (config as ParsedServerConfig & { headers: Record<string, string> }).headers = {
      'X-Custom': 'value',
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.secretHeaderKeys).toEqual([]);
  });

  it('should exclude headers from YAML configs even with secretHeaderKeys present', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'YAML Server',
      secretHeaderKeys: ['X-Api-Key'],
    };
    (config as ParsedServerConfig & { headers: Record<string, string> }).headers = {
      'X-Api-Key': '${API_KEY_ENV}',
      'X-Index': '${INDEX_NAME}',
    };
    const redacted = redactServerSecrets(config);
    expect((redacted as Record<string, unknown>).headers).toBeUndefined();
    expect((redacted as Record<string, unknown>).secretHeaderKeys).toBeUndefined();
    expect(redacted.title).toBe('YAML Server');
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

  it('should preserve serverInstructions: true', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      serverInstructions: true,
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.serverInstructions).toBe(true);
  });

  it('should preserve serverInstructions as a custom string', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      serverInstructions: 'Always respond concisely.',
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.serverInstructions).toBe('Always respond concisely.');
  });

  it('should omit serverInstructions when not set', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.serverInstructions).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(redacted, 'serverInstructions')).toBe(false);
  });

  it('should preserve chatMenu: false', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      chatMenu: false,
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.chatMenu).toBe(false);
  });

  it('should omit chatMenu when not set', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.chatMenu).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(redacted, 'chatMenu')).toBe(false);
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
