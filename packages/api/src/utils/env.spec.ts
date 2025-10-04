import { resolveHeaders, processMCPEnv } from './env';
import { TokenExchangeMethodEnum } from 'librechat-data-provider';
import type { TUser, MCPOptions } from 'librechat-data-provider';

function isStdioOptions(options: MCPOptions): options is Extract<MCPOptions, { type?: 'stdio' }> {
  return !options.type || options.type === 'stdio';
}

function isStreamableHTTPOptions(
  options: MCPOptions,
): options is Extract<MCPOptions, { type: 'streamable-http' | 'http' }> {
  return options.type === 'streamable-http' || options.type === 'http';
}

/** Helper function to create test user objects */
function createTestUser(overrides: Partial<TUser> = {}): TUser {
  return {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    name: 'Test User',
    avatar: 'https://example.com/avatar.png',
    provider: 'email',
    role: 'user',
    createdAt: new Date('2021-01-01').toISOString(),
    updatedAt: new Date('2021-01-01').toISOString(),
    ...overrides,
  };
}

describe('resolveHeaders', () => {
  beforeEach(() => {
    process.env.TEST_API_KEY = 'test-api-key-value';
    process.env.ANOTHER_SECRET = 'another-secret-value';
  });

  afterEach(() => {
    delete process.env.TEST_API_KEY;
    delete process.env.ANOTHER_SECRET;
  });

  it('should return empty object when headers is undefined', () => {
    const result = resolveHeaders(undefined);
    expect(result).toEqual({});
  });

  it('should return empty object when headers is null', () => {
    const result = resolveHeaders({
      headers: null as unknown as Record<string, string>,
    });
    expect(result).toEqual({});
  });

  it('should return empty object when headers is empty', () => {
    const result = resolveHeaders({ headers: {} });
    expect(result).toEqual({});
  });

  it('should process environment variables in headers', () => {
    const headers = {
      Authorization: '${TEST_API_KEY}',
      'X-Secret': '${ANOTHER_SECRET}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers });

    expect(result).toEqual({
      Authorization: 'test-api-key-value',
      'X-Secret': 'another-secret-value',
      'Content-Type': 'application/json',
    });
  });

  it('should process user ID placeholder when user has id', () => {
    const user = { id: 'test-user-123' };
    const headers = {
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Id': 'test-user-123',
      'Content-Type': 'application/json',
    });
  });

  it('should not process user ID placeholder when user is undefined', () => {
    const headers = {
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers });

    expect(result).toEqual({
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    });
  });

  it('should not process user ID placeholder when user has no id', () => {
    const user = { id: '' };
    const headers = {
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    });
  });

  it('should process full user object placeholders', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      name: 'Test User',
      role: 'admin',
    });

    const headers = {
      'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'User-Name': '{{LIBRECHAT_USER_NAME}}',
      'User-Username': '{{LIBRECHAT_USER_USERNAME}}',
      'User-Role': '{{LIBRECHAT_USER_ROLE}}',
      'User-Id': '{{LIBRECHAT_USER_ID}}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Email': 'test@example.com',
      'User-Name': 'Test User',
      'User-Username': 'testuser',
      'User-Role': 'admin',
      'User-Id': 'user-123',
      'Content-Type': 'application/json',
    });
  });

  it('should handle missing user fields gracefully', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
      username: undefined,
    });

    const headers = {
      'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'User-Username': '{{LIBRECHAT_USER_USERNAME}}',
      'Non-Existent': '{{LIBRECHAT_USER_NONEXISTENT}}',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Email': 'test@example.com',
      'User-Username': '',
      'Non-Existent': '{{LIBRECHAT_USER_NONEXISTENT}}',
    });
  });

  it('should process custom user variables', () => {
    const user = { id: 'user-123' };
    const customUserVars = {
      CUSTOM_TOKEN: 'user-specific-token',
      REGION: 'us-west-1',
    };

    const headers = {
      Authorization: 'Bearer {{CUSTOM_TOKEN}}',
      'X-Region': '{{REGION}}',
      'X-System-Key': '${TEST_API_KEY}',
      'X-User-Id': '{{LIBRECHAT_USER_ID}}',
    };

    const result = resolveHeaders({ headers, user, customUserVars });

    expect(result).toEqual({
      Authorization: 'Bearer user-specific-token',
      'X-Region': 'us-west-1',
      'X-System-Key': 'test-api-key-value',
      'X-User-Id': 'user-123',
    });
  });

  it('should prioritize custom user variables over user fields', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'user-email@example.com',
    });
    const customUserVars = {
      LIBRECHAT_USER_EMAIL: 'custom-email@example.com',
    };

    const headers = {
      'Test-Email': '{{LIBRECHAT_USER_EMAIL}}',
    };

    const result = resolveHeaders({ headers, user, customUserVars });

    expect(result).toEqual({
      'Test-Email': 'custom-email@example.com',
    });
  });

  it('should handle boolean user fields', () => {
    const user = createTestUser({
      id: 'user-123',

      role: 'admin',
    });

    const headers = {
      'User-Role': '{{LIBRECHAT_USER_ROLE}}',
      'User-Id': '{{LIBRECHAT_USER_ID}}',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Role': 'admin',
      'User-Id': 'user-123',
    });
  });

  it('should handle multiple occurrences of the same placeholder', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
    });

    const headers = {
      'Primary-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'Secondary-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'Backup-Email': '{{LIBRECHAT_USER_EMAIL}}',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'Primary-Email': 'test@example.com',
      'Secondary-Email': 'test@example.com',
      'Backup-Email': 'test@example.com',
    });
  });

  it('should handle mixed variable types in the same headers object', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
    });
    const customUserVars = {
      CUSTOM_TOKEN: 'secret-token',
    };

    const headers = {
      Authorization: 'Bearer {{CUSTOM_TOKEN}}',
      'X-User-Id': '{{LIBRECHAT_USER_ID}}',
      'X-System-Key': '${TEST_API_KEY}',
      'X-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'Content-Type': 'application/json',
    };

    const result = resolveHeaders({ headers, user, customUserVars });

    expect(result).toEqual({
      Authorization: 'Bearer secret-token',
      'X-User-Id': 'user-123',
      'X-System-Key': 'test-api-key-value',
      'X-User-Email': 'test@example.com',
      'Content-Type': 'application/json',
    });
  });

  it('should not modify the original headers object', () => {
    const originalHeaders = {
      Authorization: '${TEST_API_KEY}',
      'User-Id': '{{LIBRECHAT_USER_ID}}',
    };
    const user = { id: 'user-123' };

    const result = resolveHeaders({ headers: originalHeaders, user });

    expect(result).toEqual({
      Authorization: 'test-api-key-value',
      'User-Id': 'user-123',
    });

    expect(originalHeaders).toEqual({
      Authorization: '${TEST_API_KEY}',
      'User-Id': '{{LIBRECHAT_USER_ID}}',
    });
  });

  it('should handle special characters in custom variable names', () => {
    const user = { id: 'user-123' };
    const customUserVars = {
      'CUSTOM-VAR': 'dash-value',
      CUSTOM_VAR: 'underscore-value',
      'CUSTOM.VAR': 'dot-value',
    };

    const headers = {
      'Dash-Header': '{{CUSTOM-VAR}}',
      'Underscore-Header': '{{CUSTOM_VAR}}',
      'Dot-Header': '{{CUSTOM.VAR}}',
    };

    const result = resolveHeaders({ headers, user, customUserVars });

    expect(result).toEqual({
      'Dash-Header': 'dash-value',
      'Underscore-Header': 'underscore-value',
      'Dot-Header': 'dot-value',
    });
  });

  it('should replace all allowed user field placeholders', () => {
    const user = {
      id: 'abc',
      name: 'Test User',
      username: 'testuser',
      email: 'me@example.com',
      provider: 'google',
      role: 'admin',
      googleId: 'gid',
      facebookId: 'fbid',
      openidId: 'oid',
      samlId: 'sid',
      ldapId: 'lid',
      githubId: 'ghid',
      discordId: 'dcid',
      appleId: 'aid',
      emailVerified: true,
      twoFactorEnabled: false,
      termsAccepted: true,
    };

    const headers = {
      'X-User-ID': '{{LIBRECHAT_USER_ID}}',
      'X-User-Name': '{{LIBRECHAT_USER_NAME}}',
      'X-User-Username': '{{LIBRECHAT_USER_USERNAME}}',
      'X-User-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'X-User-Provider': '{{LIBRECHAT_USER_PROVIDER}}',
      'X-User-Role': '{{LIBRECHAT_USER_ROLE}}',
      'X-User-GoogleId': '{{LIBRECHAT_USER_GOOGLEID}}',
      'X-User-FacebookId': '{{LIBRECHAT_USER_FACEBOOKID}}',
      'X-User-OpenIdId': '{{LIBRECHAT_USER_OPENIDID}}',
      'X-User-SamlId': '{{LIBRECHAT_USER_SAMLID}}',
      'X-User-LdapId': '{{LIBRECHAT_USER_LDAPID}}',
      'X-User-GithubId': '{{LIBRECHAT_USER_GITHUBID}}',
      'X-User-DiscordId': '{{LIBRECHAT_USER_DISCORDID}}',
      'X-User-AppleId': '{{LIBRECHAT_USER_APPLEID}}',
      'X-User-EmailVerified': '{{LIBRECHAT_USER_EMAILVERIFIED}}',
      'X-User-TwoFactorEnabled': '{{LIBRECHAT_USER_TWOFACTORENABLED}}',
      'X-User-TermsAccepted': '{{LIBRECHAT_USER_TERMSACCEPTED}}',
    };

    const result = resolveHeaders({ headers, user });

    expect(result['X-User-ID']).toBe('abc');
    expect(result['X-User-Name']).toBe('Test User');
    expect(result['X-User-Username']).toBe('testuser');
    expect(result['X-User-Email']).toBe('me@example.com');
    expect(result['X-User-Provider']).toBe('google');
    expect(result['X-User-Role']).toBe('admin');
    expect(result['X-User-GoogleId']).toBe('gid');
    expect(result['X-User-FacebookId']).toBe('fbid');
    expect(result['X-User-OpenIdId']).toBe('oid');
    expect(result['X-User-SamlId']).toBe('sid');
    expect(result['X-User-LdapId']).toBe('lid');
    expect(result['X-User-GithubId']).toBe('ghid');
    expect(result['X-User-DiscordId']).toBe('dcid');
    expect(result['X-User-AppleId']).toBe('aid');
    expect(result['X-User-EmailVerified']).toBe('true');
    expect(result['X-User-TwoFactorEnabled']).toBe('false');
    expect(result['X-User-TermsAccepted']).toBe('true');
  });

  it('should handle multiple placeholders in one value', () => {
    const user = { id: 'abc', email: 'me@example.com' };
    const headers = {
      'X-Multi': 'User: {{LIBRECHAT_USER_ID}}, Env: ${TEST_API_KEY}, Custom: {{MY_CUSTOM}}',
    };
    const customVars = { MY_CUSTOM: 'custom-value' };
    const result = resolveHeaders({ headers, user, customUserVars: customVars });
    expect(result['X-Multi']).toBe('User: abc, Env: test-api-key-value, Custom: custom-value');
  });

  it('should leave unknown placeholders unchanged', () => {
    const user = { id: 'abc' };
    const headers = {
      'X-Unknown': '{{SOMETHING_NOT_RECOGNIZED}}',
      'X-Known': '{{LIBRECHAT_USER_ID}}',
    };
    const result = resolveHeaders({ headers, user });
    expect(result['X-Unknown']).toBe('{{SOMETHING_NOT_RECOGNIZED}}');
    expect(result['X-Known']).toBe('abc');
  });

  it('should handle a mix of all types', () => {
    const user = {
      id: 'abc',
      email: 'me@example.com',
      emailVerified: true,
      twoFactorEnabled: false,
    };
    const headers = {
      'X-User': '{{LIBRECHAT_USER_ID}}',
      'X-Env': '${TEST_API_KEY}',
      'X-Custom': '{{MY_CUSTOM}}',
      'X-Multi': 'ID: {{LIBRECHAT_USER_ID}}, ENV: ${TEST_API_KEY}, CUSTOM: {{MY_CUSTOM}}',
      'X-Unknown': '{{NOT_A_REAL_PLACEHOLDER}}',
      'X-Empty': '',
      'X-Boolean': '{{LIBRECHAT_USER_EMAILVERIFIED}}',
    };
    const customVars = { MY_CUSTOM: 'custom-value' };
    const result = resolveHeaders({ headers, user, customUserVars: customVars });

    expect(result['X-User']).toBe('abc');
    expect(result['X-Env']).toBe('test-api-key-value');
    expect(result['X-Custom']).toBe('custom-value');
    expect(result['X-Multi']).toBe('ID: abc, ENV: test-api-key-value, CUSTOM: custom-value');
    expect(result['X-Unknown']).toBe('{{NOT_A_REAL_PLACEHOLDER}}');
    expect(result['X-Empty']).toBe('');
    expect(result['X-Boolean']).toBe('true');
  });

  it('should process LIBRECHAT_BODY placeholders', () => {
    const body = {
      conversationId: 'conv-123',
      parentMessageId: 'parent-456',
      messageId: 'msg-789',
    };
    const headers = { 'X-Conversation': '{{LIBRECHAT_BODY_CONVERSATIONID}}' };
    const result = resolveHeaders({ headers, body });
    expect(result['X-Conversation']).toBe('conv-123');
  });
});

describe('processMCPEnv', () => {
  beforeEach(() => {
    process.env.TEST_API_KEY = 'test-api-key-value';
    process.env.ANOTHER_SECRET = 'another-secret-value';
    process.env.OAUTH_CLIENT_ID = 'oauth-client-id-value';
    process.env.OAUTH_CLIENT_SECRET = 'oauth-client-secret-value';
    process.env.MCP_SERVER_URL = 'https://mcp.example.com';
  });

  afterEach(() => {
    delete process.env.TEST_API_KEY;
    delete process.env.ANOTHER_SECRET;
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
    delete process.env.MCP_SERVER_URL;
  });

  it('should return null/undefined as-is', () => {
    expect(processMCPEnv({ options: null as unknown as MCPOptions })).toBeNull();
    expect(processMCPEnv({ options: undefined as unknown as MCPOptions })).toBeUndefined();
  });

  it('should process stdio type MCP options with env and args', () => {
    const options: MCPOptions = {
      type: 'stdio',
      command: 'mcp-server',
      env: {
        API_KEY: '${TEST_API_KEY}',
        SECRET: '${ANOTHER_SECRET}',
        PLAIN_VALUE: 'plain-text',
      },
      args: ['--key', '${TEST_API_KEY}', '--url', '${MCP_SERVER_URL}'],
    };

    const result = processMCPEnv({ options });

    expect(result).toEqual({
      type: 'stdio',
      command: 'mcp-server',
      env: {
        API_KEY: 'test-api-key-value',
        SECRET: 'another-secret-value',
        PLAIN_VALUE: 'plain-text',
      },
      args: ['--key', 'test-api-key-value', '--url', 'https://mcp.example.com'],
    });
  });

  it('should process WebSocket type MCP options with url', () => {
    const options: MCPOptions = {
      type: 'websocket',
      url: '${MCP_SERVER_URL}/ws',
    };

    const result = processMCPEnv({ options });

    expect(result).toEqual({
      type: 'websocket',
      url: 'https://mcp.example.com/ws',
    });
  });

  it('should process OAuth configuration with environment variables', () => {
    const options: MCPOptions = {
      type: 'streamable-http',
      url: '${MCP_SERVER_URL}/api',
      headers: {
        'Content-Type': 'application/json',
      },
      oauth: {
        authorization_url: 'https://auth.example.com/authorize',
        token_url: 'https://auth.example.com/token',
        client_id: '${OAUTH_CLIENT_ID}',
        client_secret: '${OAUTH_CLIENT_SECRET}',
        scope: 'read:data write:data',
        redirect_uri: 'http://localhost:3000/callback',
        token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
      },
    };

    const result = processMCPEnv({ options });

    expect(result).toEqual({
      type: 'streamable-http',
      url: 'https://mcp.example.com/api',
      headers: {
        'Content-Type': 'application/json',
      },
      oauth: {
        authorization_url: 'https://auth.example.com/authorize',
        token_url: 'https://auth.example.com/token',
        client_id: 'oauth-client-id-value',
        client_secret: 'oauth-client-secret-value',
        scope: 'read:data write:data',
        redirect_uri: 'http://localhost:3000/callback',
        token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
      },
    });
  });

  it('should process user field placeholders in all fields', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      role: 'admin',
    });

    const options: MCPOptions = {
      type: 'stdio',
      command: 'mcp-server',
      env: {
        USER_ID: '{{LIBRECHAT_USER_ID}}',
        USER_EMAIL: '{{LIBRECHAT_USER_EMAIL}}',
        USER_ROLE: '{{LIBRECHAT_USER_ROLE}}',
      },
      args: ['--user', '{{LIBRECHAT_USER_USERNAME}}', '--id', '{{LIBRECHAT_USER_ID}}'],
    };

    const result = processMCPEnv({ options, user });

    expect(result).toEqual({
      type: 'stdio',
      command: 'mcp-server',
      env: {
        USER_ID: 'user-123',
        USER_EMAIL: 'test@example.com',
        USER_ROLE: 'admin',
      },
      args: ['--user', 'testuser', '--id', 'user-123'],
    });
  });

  it('should process custom user variables', () => {
    const customUserVars = {
      CUSTOM_TOKEN: 'user-specific-token',
      REGION: 'us-west-1',
    };

    const options: MCPOptions = {
      type: 'sse',
      url: 'https://sse.example.com/{{REGION}}',
      headers: {
        Authorization: 'Bearer {{CUSTOM_TOKEN}}',
        'X-Region': '{{REGION}}',
      },
    };

    const result = processMCPEnv({ options, customUserVars });

    expect(result).toEqual({
      type: 'sse',
      url: 'https://sse.example.com/us-west-1',
      headers: {
        Authorization: 'Bearer user-specific-token',
        'X-Region': 'us-west-1',
      },
    });
  });

  it('should process body placeholders in all fields', () => {
    const body = {
      conversationId: 'conv-123',
      parentMessageId: 'parent-456',
      messageId: 'msg-789',
    };

    const options: MCPOptions = {
      type: 'streamable-http',
      url: 'https://api.example.com/conversations/{{LIBRECHAT_BODY_CONVERSATIONID}}',
      headers: {
        'X-Parent-Message': '{{LIBRECHAT_BODY_PARENTMESSAGEID}}',
        'X-Message-Id': '{{LIBRECHAT_BODY_MESSAGEID}}',
      },
    };

    const result = processMCPEnv({ options, body });

    expect(result).toEqual({
      type: 'streamable-http',
      url: 'https://api.example.com/conversations/conv-123',
      headers: {
        'X-Parent-Message': 'parent-456',
        'X-Message-Id': 'msg-789',
      },
    });
  });

  it('should handle mixed placeholders in OAuth configuration', () => {
    const user = createTestUser({
      id: 'user-123',
      email: 'test@example.com',
    });
    const customUserVars = {
      TENANT_ID: 'tenant-456',
    };
    const body = {
      conversationId: 'conv-789',
    };

    const options: MCPOptions = {
      type: 'streamable-http',
      url: '${MCP_SERVER_URL}',
      oauth: {
        authorization_url: 'https://auth.example.com/{{TENANT_ID}}/authorize',
        token_url: 'https://auth.example.com/{{TENANT_ID}}/token',
        client_id: '${OAUTH_CLIENT_ID}',
        client_secret: '${OAUTH_CLIENT_SECRET}',
        scope: 'user:{{LIBRECHAT_USER_ID}} conversation:{{LIBRECHAT_BODY_CONVERSATIONID}}',
        redirect_uri: 'http://localhost:3000/user/{{LIBRECHAT_USER_EMAIL}}/callback',
      },
    };

    const result = processMCPEnv({ options, user, customUserVars, body });

    expect(result).toEqual({
      type: 'streamable-http',
      url: 'https://mcp.example.com',
      oauth: {
        authorization_url: 'https://auth.example.com/tenant-456/authorize',
        token_url: 'https://auth.example.com/tenant-456/token',
        client_id: 'oauth-client-id-value',
        client_secret: 'oauth-client-secret-value',
        scope: 'user:user-123 conversation:conv-789',
        redirect_uri: 'http://localhost:3000/user/test@example.com/callback',
      },
    });
  });

  it('should not modify non-string OAuth values', () => {
    const options: MCPOptions = {
      type: 'streamable-http',
      url: 'https://api.example.com',
      oauth: {
        client_id: '${OAUTH_CLIENT_ID}',
        token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
        scope: 'read:data write:data',
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
      },
    };

    const result = processMCPEnv({ options });

    if (isStreamableHTTPOptions(result) && result.oauth) {
      expect(result.oauth).toEqual({
        client_id: 'oauth-client-id-value',
        token_exchange_method: TokenExchangeMethodEnum.DefaultPost,
        scope: 'read:data write:data',
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
      });
    } else {
      throw new Error('Expected streamable-http options with oauth');
    }
  });

  it('should handle missing OAuth values gracefully', () => {
    const options: MCPOptions = {
      type: 'streamable-http',
      url: 'https://api.example.com',
      oauth: {
        client_id: '${OAUTH_CLIENT_ID}',
        client_secret: undefined,
        scope: null as unknown as string,
      },
    };

    const result = processMCPEnv({ options });

    expect(result.oauth).toEqual({
      client_id: 'oauth-client-id-value',
      client_secret: undefined,
      scope: null,
    });
  });

  it('should not modify the original options object', () => {
    const originalOptions: MCPOptions = {
      type: 'stdio',
      command: 'mcp-server',
      env: {
        API_KEY: '${TEST_API_KEY}',
      },
      args: ['--key', '${TEST_API_KEY}'],
    };

    const result = processMCPEnv({ options: originalOptions });

    if (isStdioOptions(result)) {
      expect(result.env?.API_KEY).toBe('test-api-key-value');
      expect(result.args[1]).toBe('test-api-key-value');
    } else {
      throw new Error('Expected stdio options');
    }

    if (isStdioOptions(originalOptions)) {
      expect(originalOptions.env?.API_KEY).toBe('${TEST_API_KEY}');
      expect(originalOptions.args[1]).toBe('${TEST_API_KEY}');
    }
  });

  it('should handle all placeholder types in a single value', () => {
    const user = createTestUser({ id: 'user-123' });
    const customUserVars = { CUSTOM_VAR: 'custom-value' };
    const body = { conversationId: 'conv-456' };

    const options: MCPOptions = {
      type: 'stdio',
      command: 'mcp-server',
      args: [],
      env: {
        COMPLEX_VALUE:
          'User: {{LIBRECHAT_USER_ID}}, Custom: {{CUSTOM_VAR}}, Body: {{LIBRECHAT_BODY_CONVERSATIONID}}, Env: ${TEST_API_KEY}',
      },
    };

    const result = processMCPEnv({ options, user, customUserVars, body });

    if (isStdioOptions(result)) {
      expect(result.env?.COMPLEX_VALUE).toBe(
        'User: user-123, Custom: custom-value, Body: conv-456, Env: test-api-key-value',
      );
    } else {
      throw new Error('Expected stdio options');
    }
  });
});
