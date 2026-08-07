import { createHash } from 'crypto';
import type { LCAvailableTools, ParsedServerConfig } from './types';
import {
  createMCPConnectionProvenance,
  createMCPToolCatalogEnvelope,
  createMCPToolCatalogSecurityPolicyIdentity,
  createMCPToolCatalogScope,
  getMCPAuthorizationIdentities,
  getMCPAuthorizationIdentity,
  matchesMCPConnectionProvenance,
  resolveMCPToolCatalog,
  serializeMCPToolCatalogConfigContext,
  withMCPToolCatalogConfigContext,
} from './catalog';

const serverConfig: ParsedServerConfig = {
  type: 'streamable-http',
  url: 'https://mcp.example.com/tools',
  source: 'config',
  updatedAt: 42,
};

const tools: LCAvailableTools = {
  search_mcp_docs: {
    type: 'function',
    function: {
      name: 'search_mcp_docs',
      description: 'Search docs',
      parameters: { type: 'object', properties: {} },
    },
  },
};

const scope = {
  tenantId: null,
  userId: 'user-a',
  serverName: 'docs',
  serverConfig,
  securityPolicyIdentity: 'policy-a',
  authorizationIdentity: 'none',
};

const originalCredsKey = process.env.CREDS_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

describe('MCP tool catalogs', () => {
  beforeAll(() => {
    process.env.CREDS_KEY = 'catalog-test-key';
  });

  afterAll(() => {
    if (originalCredsKey == null) {
      delete process.env.CREDS_KEY;
    } else {
      process.env.CREDS_KEY = originalCredsKey;
    }
    if (originalJwtSecret == null) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it('treats legacy unscoped tool maps as cold', () => {
    expect(resolveMCPToolCatalog(tools, scope)).toEqual({
      status: 'pending_activation',
      reason: 'cold',
    });
  });

  it('returns a valid warm catalog, including an authoritative empty tool list', () => {
    const envelope = createMCPToolCatalogEnvelope({}, scope, 100);

    expect(resolveMCPToolCatalog(envelope, scope, 101)).toEqual({
      status: 'ready',
      tools: {},
      metadata: envelope.metadata,
    });
  });

  it('binds the discovered authorization kind into catalog metadata and scope', () => {
    const oauthScope = { ...scope, authorizationKind: 'oauth' as const };
    const envelope = createMCPToolCatalogEnvelope(tools, oauthScope, 100);

    expect(envelope.metadata.authorizationKind).toBe('oauth');
    expect(resolveMCPToolCatalog(envelope, oauthScope, 101)).toEqual({
      status: 'ready',
      tools,
      metadata: envelope.metadata,
    });
    expect(resolveMCPToolCatalog(envelope, { ...scope, authorizationKind: 'none' }, 101)).toEqual({
      status: 'pending_activation',
      reason: 'credentials_changed',
    });
  });

  it('derives configured OAuth metadata even before a grant exists', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, {
      ...scope,
      serverConfig: { ...serverConfig, requiresOAuth: true },
    });

    expect(envelope.metadata.authorizationKind).toBe('oauth');
  });

  it('treats versioned catalogs without authorization provenance as a schema mismatch', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);
    const metadata = { ...envelope.metadata } as Partial<typeof envelope.metadata>;
    delete metadata.authorizationKind;

    expect(resolveMCPToolCatalog({ ...envelope, metadata }, scope, 101)).toEqual({
      status: 'pending_activation',
      reason: 'schema_mismatch',
    });
  });

  it('does not expose tenant or principal identities in catalog scope values', () => {
    const digests = createMCPToolCatalogScope(scope);

    expect(digests.tenant).not.toContain('__default_tenant__');
    expect(digests.principal).not.toContain('user-a');
    expect(digests.server).not.toContain('docs');
    expect(digests.config).not.toContain(serverConfig.url ?? '');
  });

  it('invalidates a catalog when the principal scope changes', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);

    expect(resolveMCPToolCatalog(envelope, { ...scope, userId: 'user-b' }, 101)).toEqual({
      status: 'pending_activation',
      reason: 'scope_changed',
    });
  });

  it('invalidates a catalog when the tenant scope changes', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);
    envelope.metadata.scope.tenant = 'different-tenant-digest';

    expect(resolveMCPToolCatalog(envelope, scope, 101)).toEqual({
      status: 'pending_activation',
      reason: 'scope_changed',
    });
  });

  it('rejects an envelope transplanted under another server key', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);

    expect(resolveMCPToolCatalog(envelope, { ...scope, serverName: 'other-server' }, 101)).toEqual({
      status: 'pending_activation',
      reason: 'scope_changed',
    });
  });

  it('invalidates a catalog when config revision or content changes', () => {
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);
    const revisedConfig = { ...serverConfig, updatedAt: 43, url: 'https://mcp.example.com/v2' };

    expect(resolveMCPToolCatalog(envelope, { ...scope, serverConfig: revisedConfig }, 101)).toEqual(
      { status: 'pending_activation', reason: 'config_changed' },
    );
  });

  it('keeps declarative identity stable across runtime inspection enrichment', () => {
    const preInspection = withMCPToolCatalogConfigContext({
      ...serverConfig,
      requiresOAuth: true,
      serverInstructions: true,
    });
    const postInspection = Object.assign(preInspection, {
      requiresOAuth: false,
      oauthMetadata: { issuer: 'https://auth.example.com' },
      serverInstructions: 'server-provided instructions',
      capabilities: '{"tools":{"listChanged":true}}',
      tools: 'search',
      toolFunctions: tools,
      initDuration: 50,
      updatedAt: 999,
    });

    expect(createMCPToolCatalogScope({ ...scope, serverConfig: postInspection }).config).toBe(
      createMCPToolCatalogScope({ ...scope, serverConfig: preInspection }).config,
    );
    expect(Object.keys(postInspection)).not.toContain('catalogConfiguredRequiresOAuth');

    const serialized = serializeMCPToolCatalogConfigContext(postInspection);
    expect(createMCPToolCatalogScope({ ...scope, serverConfig: serialized }).config).toBe(
      createMCPToolCatalogScope({ ...scope, serverConfig: preInspection }).config,
    );
  });

  it('invalidates a catalog when the effective MCP security policy changes', () => {
    const initialPolicy = createMCPToolCatalogSecurityPolicyIdentity({
      allowedDomains: ['mcp.example.com'],
      allowedAddresses: null,
    });
    const tightenedPolicy = createMCPToolCatalogSecurityPolicyIdentity({
      allowedDomains: ['internal.example.com'],
      allowedAddresses: ['203.0.113.10'],
    });
    const envelope = createMCPToolCatalogEnvelope(
      tools,
      { ...scope, securityPolicyIdentity: initialPolicy },
      100,
    );

    expect(
      resolveMCPToolCatalog(envelope, { ...scope, securityPolicyIdentity: tightenedPolicy }, 101),
    ).toEqual({ status: 'pending_activation', reason: 'config_changed' });
  });

  it('invalidates a catalog when custom credential scope changes', () => {
    const envelope = createMCPToolCatalogEnvelope(
      tools,
      { ...scope, customUserVars: { TOKEN: 'old' } },
      100,
    );

    expect(
      resolveMCPToolCatalog(envelope, { ...scope, customUserVars: { TOKEN: 'new' } }, 101),
    ).toEqual({ status: 'pending_activation', reason: 'credentials_changed' });
  });

  it('never stores raw or plain deterministic secret fingerprints', () => {
    const secret = '123456';
    const envelope = createMCPToolCatalogEnvelope(tools, {
      ...scope,
      customUserVars: { PIN: secret },
    });
    const plainDigest = createHash('sha256')
      .update(JSON.stringify({ authorizationIdentity: 'grant-a', customUserVars: { PIN: secret } }))
      .digest('base64url');

    expect(JSON.stringify(envelope)).not.toContain(secret);
    expect(envelope.metadata.scope.credentials).not.toBe(plainDigest);
  });

  it('keeps fingerprints stable for a fixed key and invalidates them after key rotation', () => {
    process.env.CREDS_KEY = 'fixed-key-a';
    const first = createMCPToolCatalogScope(scope);
    const second = createMCPToolCatalogScope(scope);
    const envelope = createMCPToolCatalogEnvelope(tools, scope, 100);

    expect(second).toEqual(first);

    process.env.CREDS_KEY = 'fixed-key-b';
    expect(createMCPToolCatalogScope(scope)).not.toEqual(first);
    expect(resolveMCPToolCatalog(envelope, scope, 101)).toEqual({
      status: 'pending_activation',
      reason: 'config_changed',
    });
    process.env.CREDS_KEY = 'catalog-test-key';
  });

  it('invalidates a catalog when the OAuth grant identity changes or is revoked', () => {
    const envelope = createMCPToolCatalogEnvelope(
      tools,
      { ...scope, authorizationIdentity: 'grant-a' },
      100,
    );

    expect(
      resolveMCPToolCatalog(envelope, { ...scope, authorizationIdentity: 'grant-b' }, 101),
    ).toEqual({ status: 'pending_activation', reason: 'credentials_changed' });
    expect(resolveMCPToolCatalog(envelope, scope, 101)).toEqual({
      status: 'pending_activation',
      reason: 'credentials_changed',
    });
  });

  it.each([
    ['OAuth regrant', { authorizationIdentity: 'grant-b' }],
    ['custom credential rotation', { customUserVars: { TOKEN: 'new' } }],
    ['policy tightening', { securityPolicyIdentity: 'policy-b' }],
  ])('rejects stale discovery provenance after %s', (_name, changed) => {
    const discoveryScope = {
      ...scope,
      authorizationIdentity: 'grant-a',
      customUserVars: { TOKEN: 'old' },
    };
    const provenance = createMCPConnectionProvenance(discoveryScope, 'user');

    expect(matchesMCPConnectionProvenance(provenance, { ...discoveryScope, ...changed })).toBe(
      false,
    );
  });

  it('rejects stale discovery provenance when an effective environment secret rotates', () => {
    const environmentConfig = {
      type: 'stdio',
      command: 'server',
      args: [],
      env: { API_KEY: '${MCP_CATALOG_TEST_SECRET}' },
      source: 'yaml',
    } satisfies ParsedServerConfig;
    process.env.MCP_CATALOG_TEST_SECRET = 'old-secret';
    const provenance = createMCPConnectionProvenance(
      {
        ...scope,
        serverConfig: environmentConfig,
        effectiveServerConfig: { ...environmentConfig, env: { API_KEY: 'old-secret' } },
      },
      'user',
    );

    process.env.MCP_CATALOG_TEST_SECRET = 'new-secret';
    expect(
      matchesMCPConnectionProvenance(provenance, { ...scope, serverConfig: environmentConfig }),
    ).toBe(false);
    expect(JSON.stringify(provenance)).not.toContain('old-secret');
    delete process.env.MCP_CATALOG_TEST_SECRET;
  });

  it('returns no authorization identity when token storage is unavailable', async () => {
    const findToken = jest.fn().mockRejectedValue(new Error('database unavailable'));

    await expect(
      getMCPAuthorizationIdentity({ userId: 'user-a', serverName: 'docs', findToken }),
    ).resolves.toBeNull();
  });

  it('prefers the OAuth credential-set identity over record identity', async () => {
    const findToken = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: 'client-record',
        createdAt: new Date(100),
        metadata: new Map([['credential_set_id', 'grant-generation']]),
      });

    await expect(
      getMCPAuthorizationIdentity({ userId: 'user-a', serverName: 'docs', findToken }),
    ).resolves.toBe('grant-generation');
    expect(findToken).toHaveBeenCalledTimes(3);
    expect(findToken.mock.calls.every(([, options]) => options?.sort?.createdAt === -1)).toBe(true);
  });

  it('resolves an OAuth grant identity with one indexed batch query when available', async () => {
    const findToken = jest.fn();
    const findTokens = jest.fn().mockResolvedValue([
      {
        type: 'mcp_oauth',
        identifier: 'mcp:docs',
        _id: 'access-record',
      },
      {
        type: 'mcp_oauth_client',
        identifier: 'mcp:docs:client',
        _id: 'client-record',
        metadata: new Map([['credential_set_id', 'batch-grant-generation']]),
      },
    ]);

    await expect(
      getMCPAuthorizationIdentity({
        userId: 'user-a',
        serverName: 'docs',
        findToken,
        findTokens,
      }),
    ).resolves.toBe('batch-grant-generation');
    expect(findTokens).toHaveBeenCalledTimes(1);
    expect(findTokens).toHaveBeenCalledWith({
      userId: 'user-a',
      type: {
        $in: ['mcp_oauth_client', 'mcp_oauth_refresh', 'mcp_oauth'],
      },
      identifier: {
        $in: ['mcp:docs', 'mcp:docs:refresh', 'mcp:docs:client'],
      },
    });
    expect(findToken).not.toHaveBeenCalled();
  });

  it('selects the same newest duplicate authorization generation from an unordered batch', async () => {
    const findToken = jest.fn();
    const findTokens = jest.fn().mockResolvedValue([
      {
        type: 'mcp_oauth_client',
        identifier: 'mcp:docs:client',
        _id: 'older-record',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata: new Map([['credential_set_id', 'grant-old']]),
      },
      {
        type: 'mcp_oauth_client',
        identifier: 'mcp:docs:client',
        _id: 'newer-record',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        metadata: new Map([['credential_set_id', 'grant-new']]),
      },
    ]);

    await expect(
      getMCPAuthorizationIdentity({
        userId: 'user-a',
        serverName: 'docs',
        findToken,
        findTokens,
      }),
    ).resolves.toBe('grant-new');
  });

  it('resolves multiple OAuth server identities with one request-scoped query', async () => {
    const findToken = jest.fn();
    const findTokens = jest.fn().mockResolvedValue([
      {
        type: 'mcp_oauth_client',
        identifier: 'mcp:docs:client',
        metadata: new Map([['credential_set_id', 'docs-grant']]),
      },
      {
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:search:refresh',
        _id: 'search-refresh-record',
      },
    ]);

    await expect(
      getMCPAuthorizationIdentities({
        userId: 'user-a',
        serverNames: ['docs', 'search', 'public'],
        findToken,
        findTokens,
      }),
    ).resolves.toEqual(
      new Map([
        ['docs', 'docs-grant'],
        ['search', 'search-refresh-record'],
        ['public', 'none'],
      ]),
    );
    expect(findTokens).toHaveBeenCalledTimes(1);
    expect(findToken).not.toHaveBeenCalled();
  });

  it('falls back to a non-secret token record identity for legacy grants', async () => {
    const findToken = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: 'legacy-client-record', createdAt: new Date(100) });

    await expect(
      getMCPAuthorizationIdentity({ userId: 'user-a', serverName: 'docs', findToken }),
    ).resolves.toBe('legacy-client-record');
  });

  it('uses none only when token storage succeeds and no grant exists', async () => {
    const findToken = jest.fn().mockResolvedValue(null);

    await expect(
      getMCPAuthorizationIdentity({ userId: 'user-a', serverName: 'docs', findToken }),
    ).resolves.toBe('none');
  });

  it('ignores token records without a stable identity', async () => {
    const findToken = jest.fn().mockResolvedValue({ metadata: {} });

    await expect(
      getMCPAuthorizationIdentity({ userId: 'user-a', serverName: 'docs', findToken }),
    ).resolves.toBe('none');
  });

  it('invalidates expired and malformed catalogs without returning their schemas', () => {
    const expired = createMCPToolCatalogEnvelope(tools, scope, 100);
    const malformed = createMCPToolCatalogEnvelope(
      { ...tools, search_mcp_docs: { ...tools.search_mcp_docs, function: { name: 'wrong' } } },
      scope,
      100,
    );

    expect(resolveMCPToolCatalog(expired, scope, expired.metadata.freshUntil)).toEqual({
      status: 'pending_activation',
      reason: 'expired',
    });
    expect(resolveMCPToolCatalog(malformed, scope, 101)).toEqual({
      status: 'pending_activation',
      reason: 'schema_mismatch',
    });
  });

  it('fails closed on corrupt versioned envelopes without dereferencing missing metadata', () => {
    expect(
      resolveMCPToolCatalog({ metadata: { version: 1, freshUntil: 1000 }, tools }, scope, 101),
    ).toEqual({ status: 'pending_activation', reason: 'schema_mismatch' });
    expect(
      resolveMCPToolCatalog(
        {
          metadata: {
            version: 1,
            source: 'config',
            revision: 'bad',
            cachedAt: 100,
            freshUntil: Number.NaN,
            scope: {},
          },
          tools,
        },
        scope,
        101,
      ),
    ).toEqual({ status: 'pending_activation', reason: 'schema_mismatch' });
  });
});
