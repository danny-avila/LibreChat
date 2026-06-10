import type { ParsedServerConfig } from '~/mcp/types';
import {
  buildOAuthToolCallName,
  normalizeServerName,
  redactAllServerSecrets,
  redactServerSecrets,
  requiresUserScopedConnection,
  isInvalidClientMessage,
  isClientRejectionMessage,
  getMissingCustomUserVars,
  hasCustomUserVars,
  hasRuntimeUrlPlaceholders,
  hasRuntimeBodyPlaceholders,
  hasRuntimeContextPlaceholders,
  getRuntimeBodyPlaceholderFields,
  getMissingRuntimeBodyPlaceholderFields,
  isUserSourced,
  requiresEphemeralUserConnection,
} from '~/mcp/utils';

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

  it('should preserve obo config', () => {
    const config: ParsedServerConfig = {
      type: 'sse',
      url: 'https://example.com/mcp',
      title: 'OBO Server',
      obo: { scopes: 'api://client-id/.default' },
    };
    const redacted = redactServerSecrets(config);
    expect(redacted.obo).toEqual({ scopes: 'api://client-id/.default' });
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

describe('isInvalidClientMessage', () => {
  it.each(['invalid_client', 'client_id mismatch', 'client not found', 'unknown client'])(
    'should detect "%s"',
    (pattern) => {
      expect(isInvalidClientMessage(`OAuth error: ${pattern}`)).toBe(true);
    },
  );

  it('should be case-insensitive', () => {
    expect(isInvalidClientMessage('INVALID_CLIENT')).toBe(true);
    expect(isInvalidClientMessage('Client Not Found')).toBe(true);
  });

  it('should not match unauthorized_client', () => {
    expect(isInvalidClientMessage('unauthorized_client')).toBe(false);
  });

  it('should return false for unrelated messages', () => {
    expect(isInvalidClientMessage('connection timeout')).toBe(false);
    expect(isInvalidClientMessage('')).toBe(false);
  });
});

describe('isClientRejectionMessage', () => {
  it('should match all isInvalidClientMessage patterns', () => {
    expect(isClientRejectionMessage('invalid_client')).toBe(true);
    expect(isClientRejectionMessage('client not found')).toBe(true);
  });

  it('should also match unauthorized_client', () => {
    expect(isClientRejectionMessage('unauthorized_client')).toBe(true);
  });

  it('should return false for unrelated messages', () => {
    expect(isClientRejectionMessage('server error')).toBe(false);
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

describe('requiresUserScopedConnection', () => {
  it('returns true for OAuth servers', () => {
    expect(requiresUserScopedConnection({ requiresOAuth: true })).toBe(true);
  });

  it('returns true for OBO servers', () => {
    expect(
      requiresUserScopedConnection({
        obo: { scopes: 'api://client-id/.default' },
      }),
    ).toBe(true);
  });

  it('returns true for servers with customUserVars', () => {
    expect(
      requiresUserScopedConnection({
        customUserVars: {
          API_KEY: { title: 'API Key', description: 'Your key' },
        },
      }),
    ).toBe(true);
  });

  it('returns true for trusted config with runtime user placeholders', () => {
    expect(
      requiresUserScopedConnection({
        source: 'yaml',
        headers: {
          'X-LibreChat-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
        },
      }),
    ).toBe(true);
  });

  it('returns false for user-sourced config with runtime user placeholders', () => {
    expect(
      requiresUserScopedConnection({
        source: 'user',
        dbId: 'server-123',
        headers: {
          'X-LibreChat-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
        },
      }),
    ).toBe(false);
  });

  it('returns false for app-shareable servers', () => {
    expect(
      requiresUserScopedConnection({
        requiresOAuth: false,
        customUserVars: {},
      }),
    ).toBe(false);
  });
});

describe('hasRuntimeContextPlaceholders', () => {
  it('detects trusted runtime placeholders across connection fields', () => {
    expect(
      hasRuntimeContextPlaceholders({
        source: 'config',
        url: 'https://example.com/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
          'X-Graph-Access-Token': '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      }),
    ).toBe(true);
  });

  it('detects trusted runtime placeholders in oauth_headers', () => {
    expect(
      hasRuntimeContextPlaceholders({
        source: 'yaml',
        url: 'https://example.com/mcp',
        oauth_headers: {
          'X-User': '{{LIBRECHAT_USER_ID}}',
        },
      }),
    ).toBe(true);
  });

  it('ignores custom user variable placeholders', () => {
    expect(
      hasRuntimeContextPlaceholders({
        source: 'yaml',
        headers: {
          Authorization: 'Bearer {{MCP_API_KEY}}',
        },
      }),
    ).toBe(false);
  });

  it('ignores runtime placeholders in user-sourced configs', () => {
    expect(
      hasRuntimeContextPlaceholders({
        source: 'user',
        dbId: 'server-123',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_OPENID_ID_TOKEN}}',
        },
      }),
    ).toBe(false);
  });
});

describe('hasRuntimeUrlPlaceholders', () => {
  it('detects trusted runtime placeholders in the server URL', () => {
    expect(
      hasRuntimeUrlPlaceholders({
        source: 'yaml',
        url: 'https://example.com/users/{{LIBRECHAT_USER_USERNAME}}/mcp',
      }),
    ).toBe(true);
  });

  it('ignores runtime URL placeholders in user-sourced configs', () => {
    expect(
      hasRuntimeUrlPlaceholders({
        source: 'user',
        dbId: 'server-123',
        url: 'https://example.com/users/{{LIBRECHAT_USER_USERNAME}}/mcp',
      }),
    ).toBe(false);
  });
});

describe('hasRuntimeBodyPlaceholders', () => {
  it('detects trusted runtime BODY placeholders across connection fields', () => {
    expect(
      hasRuntimeBodyPlaceholders({
        source: 'yaml',
        url: 'https://example.com/conversations/{{LIBRECHAT_BODY_CONVERSATIONID}}/mcp',
      }),
    ).toBe(true);

    expect(
      hasRuntimeBodyPlaceholders({
        source: 'config',
        headers: {
          'X-Message': '{{LIBRECHAT_BODY_MESSAGEID}}',
        },
      }),
    ).toBe(true);
  });

  it('ignores BODY placeholders in user-sourced configs', () => {
    expect(
      hasRuntimeBodyPlaceholders({
        source: 'user',
        dbId: 'server-123',
        url: 'https://example.com/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
      }),
    ).toBe(false);
  });
});

describe('getMissingRuntimeBodyPlaceholderFields', () => {
  const config = {
    source: 'yaml',
    url: 'https://example.com/conversations/{{LIBRECHAT_BODY_CONVERSATIONID}}/mcp',
    headers: {
      'X-Message': '{{LIBRECHAT_BODY_MESSAGEID}}',
      'X-Parent': '{{LIBRECHAT_BODY_PARENTMESSAGEID}}',
    },
  } as const;

  it('returns the request body fields required by trusted runtime placeholders', () => {
    expect(getRuntimeBodyPlaceholderFields(config)).toEqual([
      'messageId',
      'parentMessageId',
      'conversationId',
    ]);
  });

  it('returns missing or blank request body fields', () => {
    expect(
      getMissingRuntimeBodyPlaceholderFields(config, {
        conversationId: 'conv-123',
        messageId: ' ',
      }),
    ).toEqual(['messageId', 'parentMessageId']);
  });

  it('ignores BODY placeholders in user-sourced configs', () => {
    expect(
      getMissingRuntimeBodyPlaceholderFields({
        source: 'user',
        dbId: 'server-123',
        url: 'https://example.com/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
      }),
    ).toEqual([]);
  });
});

describe('requiresEphemeralUserConnection', () => {
  it('returns true when request-varying placeholders affect oauth_headers', () => {
    expect(
      requiresEphemeralUserConnection({
        source: 'yaml',
        url: 'https://example.com/mcp',
        oauth_headers: {
          Authorization: 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}',
        },
      }),
    ).toBe(true);
  });

  it('returns true when request-varying placeholders affect connection fields', () => {
    expect(
      requiresEphemeralUserConnection({
        source: 'yaml',
        url: 'https://example.com/messages/{{LIBRECHAT_BODY_MESSAGEID}}/mcp',
      }),
    ).toBe(true);

    expect(
      requiresEphemeralUserConnection({
        source: 'config',
        env: {
          GRAPH_TOKEN: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      }),
    ).toBe(true);
  });

  it('returns true when OpenID token placeholders affect connection fields', () => {
    expect(
      requiresEphemeralUserConnection({
        source: 'yaml',
        args: ['--id-token={{LIBRECHAT_OPENID_ID_TOKEN}}'],
      }),
    ).toBe(true);

    expect(
      requiresEphemeralUserConnection({
        source: 'yaml',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_OPENID_ACCESS_TOKEN}}',
        },
      }),
    ).toBe(true);
  });

  it('returns true when request-varying placeholders affect remote transport headers', () => {
    expect(
      requiresEphemeralUserConnection({
        source: 'yaml',
        headers: {
          'X-Message': '{{LIBRECHAT_BODY_MESSAGEID}}',
          'X-Graph': '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      }),
    ).toBe(true);
  });
});

describe('getMissingCustomUserVars', () => {
  const configWithVars = (keys: string[]): Pick<ParsedServerConfig, 'customUserVars'> => ({
    customUserVars: Object.fromEntries(
      keys.map((key) => [key, { title: key, description: `${key} description` }]),
    ),
  });

  it('returns an empty array when the server declares no customUserVars', () => {
    expect(getMissingCustomUserVars({}, {})).toEqual([]);
    expect(getMissingCustomUserVars({ customUserVars: undefined }, undefined)).toEqual([]);
  });

  it('returns an empty array when customUserVars is an empty object', () => {
    const config: Pick<ParsedServerConfig, 'customUserVars'> = { customUserVars: {} };
    expect(hasCustomUserVars(config)).toBe(false);
    expect(getMissingCustomUserVars(config, undefined)).toEqual([]);
  });

  it('reports every declared variable when no values are provided', () => {
    const config = configWithVars(['THINGY_TOKEN', 'THINGY_REGION']);
    expect(getMissingCustomUserVars(config, undefined)).toEqual(['THINGY_TOKEN', 'THINGY_REGION']);
    expect(getMissingCustomUserVars(config, null)).toEqual(['THINGY_TOKEN', 'THINGY_REGION']);
    expect(getMissingCustomUserVars(config, {})).toEqual(['THINGY_TOKEN', 'THINGY_REGION']);
  });

  it('reports only the variables the user has not set', () => {
    const config = configWithVars(['THINGY_TOKEN', 'THINGY_REGION']);
    expect(getMissingCustomUserVars(config, { THINGY_TOKEN: 'abc123' })).toEqual(['THINGY_REGION']);
  });

  it('treats empty-string and whitespace-only values as missing', () => {
    const config = configWithVars(['THINGY_TOKEN']);
    expect(getMissingCustomUserVars(config, { THINGY_TOKEN: '' })).toEqual(['THINGY_TOKEN']);
    expect(getMissingCustomUserVars(config, { THINGY_TOKEN: '   ' })).toEqual(['THINGY_TOKEN']);
    expect(getMissingCustomUserVars(config, { THINGY_TOKEN: '\t\n ' })).toEqual(['THINGY_TOKEN']);
  });

  it('returns an empty array when every declared variable has a value', () => {
    const config = configWithVars(['THINGY_TOKEN', 'THINGY_REGION']);
    expect(
      getMissingCustomUserVars(config, { THINGY_TOKEN: 'abc123', THINGY_REGION: 'eu-west-1' }),
    ).toEqual([]);
  });

  it('ignores provided values for variables the server does not declare', () => {
    const config = configWithVars(['THINGY_TOKEN']);
    expect(
      getMissingCustomUserVars(config, { THINGY_TOKEN: 'abc123', UNRELATED: 'value' }),
    ).toEqual([]);
  });
});
