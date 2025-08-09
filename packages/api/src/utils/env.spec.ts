import { resolveHeaders } from './env';
import type { TUser } from 'librechat-data-provider';

// Helper function to create test user objects
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
    // Set up test environment variables
    process.env.TEST_API_KEY = 'test-api-key-value';
    process.env.ANOTHER_SECRET = 'another-secret-value';
  });

  afterEach(() => {
    // Clean up environment variables
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
      username: undefined, // explicitly set to undefined
    });

    const headers = {
      'User-Email': '{{LIBRECHAT_USER_EMAIL}}',
      'User-Username': '{{LIBRECHAT_USER_USERNAME}}',
      'Non-Existent': '{{LIBRECHAT_USER_NONEXISTENT}}',
    };

    const result = resolveHeaders({ headers, user });

    expect(result).toEqual({
      'User-Email': 'test@example.com',
      'User-Username': '', // Empty string for missing field
      'Non-Existent': '{{LIBRECHAT_USER_NONEXISTENT}}', // Unchanged for non-existent field
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
      // Note: TUser doesn't have these boolean fields, so we'll test with string fields
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

    // Verify the result is processed
    expect(result).toEqual({
      Authorization: 'test-api-key-value',
      'User-Id': 'user-123',
    });

    // Verify the original object is unchanged
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

  // Additional comprehensive tests for all user field placeholders
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
