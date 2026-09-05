import type * as DataSchemas from '@librechat/data-schemas';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Loaded via dynamic import in beforeAll so encryption initializes after
// CREDS_KEY is set above (encryptV3 reads the key at module load) — matches
// the pattern in admin/secrets.spec.ts, required here because this file's
// subject (./env) transitively imports the admin secrets module.
let processMCPEnv: typeof import('./env').processMCPEnv;
let resolveHeaders: typeof import('./env').resolveHeaders;
let encryptV3: typeof DataSchemas.encryptV3;
let encryptConfigSecrets: typeof import('../admin/secrets').encryptConfigSecrets;
let encryptLegacyPlaintextConfigSecrets: typeof import('../admin/secrets').encryptLegacyPlaintextConfigSecrets;
let preserveConfigSecrets: typeof import('../admin/secrets').preserveConfigSecrets;
let redactConfigSecrets: typeof import('../admin/secrets').redactConfigSecrets;
let getConfigSecretInputError: typeof import('../admin/secrets').getConfigSecretInputError;

beforeAll(async () => {
  ({ processMCPEnv, resolveHeaders } = await import('./env'));
  ({ encryptV3 } = await import('@librechat/data-schemas'));
  ({
    encryptConfigSecrets,
    encryptLegacyPlaintextConfigSecrets,
    preserveConfigSecrets,
    redactConfigSecrets,
    getConfigSecretInputError,
  } = await import('../admin/secrets'));
});

/**
 * Every field the admin config write path (packages/api/src/admin/secrets.ts)
 * encrypts at rest must be decrypted again by the time it reaches an MCP
 * connection or an outbound provider request — otherwise ciphertext is either
 * silently dropped (treated as an unresolved placeholder) or forwarded
 * verbatim as the literal credential. These tests exercise the runtime
 * resolution side of that contract, matching the shapes `processMCPEnv` and
 * `resolveHeaders` actually receive.
 */
describe('processMCPEnv decrypts admin-encrypted config secrets', () => {
  it('decrypts an encrypted admin apiKey.key before building the Authorization header', () => {
    const encrypted = encryptV3('sk-mcp-admin-key');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      apiKey: {
        source: 'admin' as const,
        authorization_type: 'bearer' as const,
        key: encrypted,
      },
    };

    const result = processMCPEnv({ options });

    expect((result as { headers?: Record<string, string> }).headers?.Authorization).toBe(
      'Bearer sk-mcp-admin-key',
    );
  });

  it('decrypts an encrypted admin apiKey.key for a custom header, not just Authorization', () => {
    const encrypted = encryptV3('sk-mcp-custom-key');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      apiKey: {
        source: 'admin' as const,
        authorization_type: 'custom' as const,
        custom_header: 'X-Api-Key',
        key: encrypted,
      },
    };

    const result = processMCPEnv({ options });

    expect((result as { headers?: Record<string, string> }).headers?.['X-Api-Key']).toBe(
      'sk-mcp-custom-key',
    );
  });

  it('decrypts an encrypted oauth.client_secret', () => {
    const encrypted = encryptV3('oauth-secret-value');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      oauth: {
        client_id: 'jira-client-id',
        client_secret: encrypted,
        token_url: 'https://auth.example.com/token',
      },
    };

    const result = processMCPEnv({ options });

    const oauth = (result as { oauth?: Record<string, unknown> }).oauth;
    expect(oauth?.client_secret).toBe('oauth-secret-value');
    expect(oauth?.client_id).toBe('jira-client-id');
  });

  it('decrypts an encrypted oauth.client_secret for a DB-sourced (dbSourced) server too', () => {
    const encrypted = encryptV3('oauth-secret-value');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      oauth: {
        client_id: 'jira-client-id',
        client_secret: encrypted,
        token_url: 'https://auth.example.com/token',
      },
    };

    const result = processMCPEnv({ options, dbSourced: true });

    const oauth = (result as { oauth?: Record<string, unknown> }).oauth;
    expect(oauth?.client_secret).toBe('oauth-secret-value');
  });

  it('decrypts an encrypted oauth_headers value', () => {
    const encrypted = encryptV3('gateway-credential');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      oauth_headers: { 'X-Gateway-Token': encrypted },
    };

    const result = processMCPEnv({ options });

    expect(
      (result as { oauth_headers?: Record<string, string> }).oauth_headers?.['X-Gateway-Token'],
    ).toBe('gateway-credential');
  });

  it('decrypts an encrypted headers value on a remote MCP server', () => {
    const encrypted = encryptV3('Bearer gateway-token');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      headers: { Authorization: encrypted },
    };

    const result = processMCPEnv({ options });

    expect((result as { headers?: Record<string, string> }).headers?.Authorization).toBe(
      'Bearer gateway-token',
    );
  });

  it('never applies user/customUserVars template substitution on top of a decrypted secret', () => {
    // A decrypted secret is a final, resolved credential -- it must not be
    // treated as a template even if it happens to contain `{{...}}`-shaped
    // text, unlike a literal admin-authored placeholder string.
    const encrypted = encryptV3('literal-value-{{MY_VAR}}-not-a-template');
    const options = {
      type: 'streamable-http' as const,
      url: 'https://api.example.com',
      oauth_headers: { 'X-Custom': encrypted },
    };

    const result = processMCPEnv({
      options,
      customUserVars: { MY_VAR: 'should-not-be-substituted' },
    });

    expect((result as { oauth_headers?: Record<string, string> }).oauth_headers?.['X-Custom']).toBe(
      'literal-value-{{MY_VAR}}-not-a-template',
    );
  });
});

describe('resolveHeaders decrypts admin-encrypted config secrets', () => {
  it('decrypts an encrypted header value (endpoints.*.headers / additionalHeaders path)', () => {
    const encrypted = encryptV3('Bearer gateway-token');

    const resolved = resolveHeaders({
      headers: { Authorization: encrypted, 'X-Trace': 'plain-value' },
    });

    expect(resolved.Authorization).toBe('Bearer gateway-token');
    expect(resolved['X-Trace']).toBe('plain-value');
  });
});

describe('admin-authored header templates survive encryption', () => {
  it.each(['write', 'legacy', 'preserve'] as const)(
    '%s keeps templates encrypted and resolvable',
    (mode) => {
      const plain = {
        endpoints: { openAI: { headers: { 'X-User': '{{LIBRECHAT_USER_ID}}' } } },
        mcpServers: {
          remote: {
            type: 'streamable-http' as const,
            url: 'https://mcp.example.com',
            headers: { Authorization: 'Bearer {{MCP_API_KEY}}' },
            oauth_headers: { 'X-User': '{{LIBRECHAT_USER_ID}}' },
          },
        },
      };
      let encrypted: typeof plain;
      if (mode === 'write') {
        encrypted = encryptConfigSecrets(plain);
      } else if (mode === 'legacy') {
        encrypted = encryptLegacyPlaintextConfigSecrets(plain);
      } else {
        encrypted = preserveConfigSecrets(
          {
            endpoints: { openAI: {} },
            mcpServers: {
              remote: {
                type: 'streamable-http',
                url: 'https://mcp.example.com',
              },
            },
          },
          plain,
        ) as typeof plain;
      }

      expect(JSON.stringify(encrypted)).not.toContain('{{');
      expect(
        resolveHeaders({
          headers: encrypted.endpoints.openAI.headers,
          user: { id: 'user-42' },
          stripUnresolved: true,
        }),
      ).toEqual({ 'X-User': 'user-42' });
      const resolved = processMCPEnv({
        options: encrypted.mcpServers.remote,
        user: { id: 'user-42' },
        customUserVars: { MCP_API_KEY: 'test-token' },
      });
      expect('headers' in resolved && resolved.headers).toEqual({
        Authorization: 'Bearer test-token',
      });
      expect(resolved.oauth_headers).toEqual({ 'X-User': 'user-42' });
      expect(JSON.stringify(redactConfigSecrets(structuredClone(encrypted)))).not.toContain('v3:');
      expect(getConfigSecretInputError('endpoints', encrypted.endpoints)).not.toBeNull();
      expect(encryptLegacyPlaintextConfigSecrets(encrypted)).toEqual(encrypted);
    },
  );

  it('does not resolve environment references introduced by user substitution', () => {
    process.env.ADMIN_TEMPLATE_TEST_SECRET = 'must-not-leak';
    try {
      const encrypted = encryptConfigSecrets({ headers: { Authorization: 'Bearer {{KEY}}' } });
      const resolved = processMCPEnv({
        options: { type: 'streamable-http', url: 'https://mcp.example.com', ...encrypted },
        customUserVars: { KEY: '${ADMIN_TEMPLATE_TEST_SECRET}' },
      });
      expect('headers' in resolved && resolved.headers).toEqual({
        Authorization: 'Bearer ${ADMIN_TEMPLATE_TEST_SECRET}',
      });
    } finally {
      delete process.env.ADMIN_TEMPLATE_TEST_SECRET;
    }
  });

  it('retains DB-sourced restrictions on tagged templates', () => {
    const encrypted = encryptConfigSecrets({
      headers: {
        'X-User': '{{LIBRECHAT_USER_ID}}',
        Authorization: 'Bearer {{KEY}}',
      },
    });
    const resolved = processMCPEnv({
      options: { type: 'streamable-http', url: 'https://mcp.example.com', ...encrypted },
      dbSourced: true,
      user: { id: 'must-not-resolve' },
      customUserVars: { KEY: 'test-token' },
    });
    expect('headers' in resolved && resolved.headers).toEqual({
      'X-User': '{{LIBRECHAT_USER_ID}}',
      Authorization: 'Bearer test-token',
    });
  });

  it('keeps scalar credentials literal even when they contain template syntax', () => {
    const encrypted = encryptConfigSecrets({
      mcpServers: {
        remote: {
          type: 'streamable-http' as const,
          url: 'https://mcp.example.com',
          oauth: { client_secret: '{{KEY}}' },
          apiKey: {
            source: 'admin' as const,
            authorization_type: 'bearer' as const,
            key: '{{KEY}}',
          },
        },
      },
    });
    const resolved = processMCPEnv({
      options: encrypted.mcpServers.remote,
      customUserVars: { KEY: 'must-not-replace' },
    });
    expect(resolved.oauth?.client_secret).toBe('{{KEY}}');
    expect('headers' in resolved && resolved.headers).toEqual({ Authorization: 'Bearer {{KEY}}' });
  });
});
