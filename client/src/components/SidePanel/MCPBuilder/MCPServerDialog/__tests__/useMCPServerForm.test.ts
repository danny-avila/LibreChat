/**
 * Unit tests for useMCPServerForm — focused on the chatMenu / serverInstructions
 * defaultValues derivation and config-building logic introduced in the Advanced section.
 *
 * These tests exercise pure TypeScript logic directly without mounting React, keeping
 * them fast and dependency-free.
 */
import type { MCPOptions } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks';

// ---------------------------------------------------------------------------
// Import shared helpers from production code
// ---------------------------------------------------------------------------
import { buildHeaders, buildCustomUserVars } from '../utils/formHelpers';
import { AuthTypeEnum, AuthorizationTypeEnum } from '../hooks/useMCPServerForm';
import type { MCPServerFormData, ServerInstructionsMode } from '../hooks/useMCPServerForm';

/**
 * Mirrors the defaultValues derivation for an existing server so we can test it
 * without mounting the full hook (which requires React context).
 */
function deriveDefaultValues(server: MCPServerDefinition): MCPServerFormData {
  let authType = AuthTypeEnum.None;
  if (server.config.oauth) {
    authType = AuthTypeEnum.OAuth;
  } else if ('apiKey' in server.config && server.config.apiKey) {
    authType = AuthTypeEnum.ServiceHttp;
  }

  const apiKeyConfig = 'apiKey' in server.config ? server.config.apiKey : undefined;
  const headersConfig =
    'headers' in server.config && server.config.headers
      ? (server.config.headers as Record<string, string>)
      : {};
  const customUserVarsConfig = server.config.customUserVars ?? {};
  const rawSecretHeaderKeys =
    'secretHeaderKeys' in server.config
      ? (server.config.secretHeaderKeys as string[] | undefined)
      : undefined;
  const secretHeaderKeysSet = new Set(rawSecretHeaderKeys ?? []);

  const si = server.config.serverInstructions;
  let serverInstructionsMode: ServerInstructionsMode = 'none';
  if (typeof si === 'string') {
    // Normalize case-insensitive "true"/"false" strings from YAML configs
    const normalized = si.toLowerCase().trim();
    if (normalized === 'true') {
      serverInstructionsMode = 'server';
    } else if (normalized === 'false' || normalized === '') {
      serverInstructionsMode = 'none';
    } else {
      serverInstructionsMode = 'custom';
    }
  } else if (si === true) {
    serverInstructionsMode = 'server';
  }

  return {
    title: server.config.title || '',
    description: server.config.description || '',
    url: 'url' in server.config ? (server.config as { url: string }).url : '',
    type: (server.config.type as 'streamable-http' | 'sse') || 'streamable-http',
    icon: server.config.iconPath || '',
    auth: {
      auth_type: authType,
      api_key: '',
      api_key_source: (apiKeyConfig?.source as 'admin' | 'user') || 'admin',
      api_key_authorization_type:
        (apiKeyConfig?.authorization_type as AuthorizationTypeEnum) || AuthorizationTypeEnum.Bearer,
      api_key_custom_header: apiKeyConfig?.custom_header || '',
      oauth_client_id: server.config.oauth?.client_id || '',
      oauth_client_secret: '',
      oauth_authorization_url: server.config.oauth?.authorization_url || '',
      oauth_token_url: server.config.oauth?.token_url || '',
      oauth_scope: server.config.oauth?.scope || '',
      server_id: server.serverName,
    },
    trust: true,
    headers: Object.entries(headersConfig).map(([key, value]) => ({
      key,
      value,
      isSecret: secretHeaderKeysSet.has(key),
    })),
    customUserVars: Object.entries(customUserVarsConfig).map(([key, cfg]) => ({
      key,
      title: cfg.title,
      description: cfg.description,
    })),
    chatMenu: server.config.chatMenu !== false,
    serverInstructionsMode,
    serverInstructionsCustom: typeof si === 'string' ? si : '',
  };
}

/**
 * Mirrors the config-building snippet from onSubmit so we can test the output
 * payload without the full React + react-hook-form stack.
 */
function buildConfig(formData: MCPServerFormData): Record<string, unknown> {
  return {
    type: formData.type,
    url: formData.url,
    title: formData.title,
    ...(formData.description && { description: formData.description }),
    ...(formData.icon && { iconPath: formData.icon }),
    ...(!formData.chatMenu && { chatMenu: false }),
    ...(formData.serverInstructionsMode === 'server' && { serverInstructions: true }),
    ...(formData.serverInstructionsMode === 'custom' &&
      formData.serverInstructionsCustom.trim() && {
        serverInstructions: formData.serverInstructionsCustom.trim(),
      }),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeServer(overrides: Partial<MCPOptions> = {}): MCPServerDefinition {
  const base: MCPOptions = {
    type: 'sse',
    url: 'https://mcp.example.com/sse',
    title: 'Test Server',
    ...overrides,
  } as MCPOptions;
  return {
    serverName: 'test-server',
    config: base,
    effectivePermissions: 7,
  };
}

// ---------------------------------------------------------------------------
// Tests: deriving defaultValues from an existing server
// ---------------------------------------------------------------------------

describe('deriveDefaultValues – chatMenu', () => {
  it('defaults chatMenu to true when the field is absent', () => {
    const server = makeServer();
    const defaults = deriveDefaultValues(server);
    expect(defaults.chatMenu).toBe(true);
  });

  it('keeps chatMenu true when config has chatMenu: true', () => {
    const server = makeServer({ chatMenu: true });
    const defaults = deriveDefaultValues(server);
    expect(defaults.chatMenu).toBe(true);
  });

  it('sets chatMenu to false when config has chatMenu: false', () => {
    const server = makeServer({ chatMenu: false });
    const defaults = deriveDefaultValues(server);
    expect(defaults.chatMenu).toBe(false);
  });
});

describe('deriveDefaultValues – serverInstructions', () => {
  it('sets serverInstructionsMode to "none" when serverInstructions is absent', () => {
    const server = makeServer();
    const defaults = deriveDefaultValues(server);
    expect(defaults.serverInstructionsMode).toBe('none');
    expect(defaults.serverInstructionsCustom).toBe('');
  });

  it('sets serverInstructionsMode to "server" when serverInstructions is true', () => {
    const server = makeServer({ serverInstructions: true });
    const defaults = deriveDefaultValues(server);
    expect(defaults.serverInstructionsMode).toBe('server');
    expect(defaults.serverInstructionsCustom).toBe('');
  });

  it('sets serverInstructionsMode to "none" when serverInstructions is false', () => {
    const server = makeServer({ serverInstructions: false });
    const defaults = deriveDefaultValues(server);
    expect(defaults.serverInstructionsMode).toBe('none');
    expect(defaults.serverInstructionsCustom).toBe('');
  });

  it('sets serverInstructionsMode to "custom" and populates custom text', () => {
    const server = makeServer({ serverInstructions: 'Use English only.' });
    const defaults = deriveDefaultValues(server);
    expect(defaults.serverInstructionsMode).toBe('custom');
    expect(defaults.serverInstructionsCustom).toBe('Use English only.');
  });

  it('treats a non-empty string serverInstructions as custom mode', () => {
    const server = makeServer({ serverInstructions: 'Multi\nline\ninstructions.' });
    const defaults = deriveDefaultValues(server);
    expect(defaults.serverInstructionsMode).toBe('custom');
    expect(defaults.serverInstructionsCustom).toBe('Multi\nline\ninstructions.');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildConfig – chatMenu payload
// ---------------------------------------------------------------------------

describe('buildConfig – chatMenu', () => {
  const baseFormData: MCPServerFormData = {
    title: 'My Server',
    url: 'https://mcp.example.com/sse',
    type: 'sse',
    auth: {
      auth_type: AuthTypeEnum.None,
      api_key: '',
      api_key_source: 'admin',
      api_key_authorization_type: AuthorizationTypeEnum.Bearer,
      api_key_custom_header: '',
      oauth_client_id: '',
      oauth_client_secret: '',
      oauth_authorization_url: '',
      oauth_token_url: '',
      oauth_scope: '',
    },
    trust: true,
    headers: [],
    customUserVars: [],
    chatMenu: true,
    serverInstructionsMode: 'none',
    serverInstructionsCustom: '',
  };

  it('omits chatMenu from payload when checked (default/true)', () => {
    const config = buildConfig({ ...baseFormData, chatMenu: true });
    expect(config.chatMenu).toBeUndefined();
  });

  it('includes chatMenu: false in payload when unchecked', () => {
    const config = buildConfig({ ...baseFormData, chatMenu: false });
    expect(config.chatMenu).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildConfig – serverInstructions payload
// ---------------------------------------------------------------------------

describe('buildConfig – serverInstructions', () => {
  const baseFormData: MCPServerFormData = {
    title: 'My Server',
    url: 'https://mcp.example.com/sse',
    type: 'sse',
    auth: {
      auth_type: AuthTypeEnum.None,
      api_key: '',
      api_key_source: 'admin',
      api_key_authorization_type: AuthorizationTypeEnum.Bearer,
      api_key_custom_header: '',
      oauth_client_id: '',
      oauth_client_secret: '',
      oauth_authorization_url: '',
      oauth_token_url: '',
      oauth_scope: '',
    },
    trust: true,
    headers: [],
    customUserVars: [],
    chatMenu: true,
    serverInstructionsMode: 'none',
    serverInstructionsCustom: '',
  };

  it('omits serverInstructions from payload when mode is "none"', () => {
    const config = buildConfig({ ...baseFormData, serverInstructionsMode: 'none' });
    expect(config.serverInstructions).toBeUndefined();
  });

  it('sends serverInstructions: true when mode is "server"', () => {
    const config = buildConfig({ ...baseFormData, serverInstructionsMode: 'server' });
    expect(config.serverInstructions).toBe(true);
  });

  it('sends custom string when mode is "custom" and text is non-empty', () => {
    const config = buildConfig({
      ...baseFormData,
      serverInstructionsMode: 'custom',
      serverInstructionsCustom: 'Respond briefly.',
    });
    expect(config.serverInstructions).toBe('Respond briefly.');
  });

  it('trims whitespace from custom instructions before sending', () => {
    const config = buildConfig({
      ...baseFormData,
      serverInstructionsMode: 'custom',
      serverInstructionsCustom: '  Trimmed text.  ',
    });
    expect(config.serverInstructions).toBe('Trimmed text.');
  });

  it('omits serverInstructions when mode is "custom" but text is blank', () => {
    const config = buildConfig({
      ...baseFormData,
      serverInstructionsMode: 'custom',
      serverInstructionsCustom: '   ',
    });
    expect(config.serverInstructions).toBeUndefined();
  });

  it('omits serverInstructions when mode is "custom" but text is empty string', () => {
    const config = buildConfig({
      ...baseFormData,
      serverInstructionsMode: 'custom',
      serverInstructionsCustom: '',
    });
    expect(config.serverInstructions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: combined chatMenu + serverInstructions scenarios
// ---------------------------------------------------------------------------

describe('buildConfig – combined chatMenu and serverInstructions', () => {
  it('sends both chatMenu: false and serverInstructions: true together', () => {
    const formData: MCPServerFormData = {
      title: 'Server',
      url: 'https://mcp.example.com/sse',
      type: 'sse',
      auth: {
        auth_type: AuthTypeEnum.None,
        api_key: '',
        api_key_source: 'admin',
        api_key_authorization_type: AuthorizationTypeEnum.Bearer,
        api_key_custom_header: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_authorization_url: '',
        oauth_token_url: '',
        oauth_scope: '',
      },
      trust: true,
      headers: [],
      customUserVars: [],
      chatMenu: false,
      serverInstructionsMode: 'server',
      serverInstructionsCustom: '',
    };
    const config = buildConfig(formData);
    expect(config.chatMenu).toBe(false);
    expect(config.serverInstructions).toBe(true);
  });

  it('sends chatMenu: false and custom serverInstructions string', () => {
    const formData: MCPServerFormData = {
      title: 'Hidden Server',
      url: 'https://mcp.example.com/sse',
      type: 'sse',
      auth: {
        auth_type: AuthTypeEnum.None,
        api_key: '',
        api_key_source: 'admin',
        api_key_authorization_type: AuthorizationTypeEnum.Bearer,
        api_key_custom_header: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_authorization_url: '',
        oauth_token_url: '',
        oauth_scope: '',
      },
      trust: true,
      headers: [],
      customUserVars: [],
      chatMenu: false,
      serverInstructionsMode: 'custom',
      serverInstructionsCustom: 'Custom instructions here.',
    };
    const config = buildConfig(formData);
    expect(config.chatMenu).toBe(false);
    expect(config.serverInstructions).toBe('Custom instructions here.');
  });

  it('omits both chatMenu and serverInstructions when defaults are used', () => {
    const formData: MCPServerFormData = {
      title: 'Default Server',
      url: 'https://mcp.example.com/sse',
      type: 'sse',
      auth: {
        auth_type: AuthTypeEnum.None,
        api_key: '',
        api_key_source: 'admin',
        api_key_authorization_type: AuthorizationTypeEnum.Bearer,
        api_key_custom_header: '',
        oauth_client_id: '',
        oauth_client_secret: '',
        oauth_authorization_url: '',
        oauth_token_url: '',
        oauth_scope: '',
      },
      trust: true,
      headers: [],
      customUserVars: [],
      chatMenu: true,
      serverInstructionsMode: 'none',
      serverInstructionsCustom: '',
    };
    const config = buildConfig(formData);
    expect(config.chatMenu).toBeUndefined();
    expect(config.serverInstructions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: deriveDefaultValues – headers round-trip
// ---------------------------------------------------------------------------

describe('deriveDefaultValues – headers', () => {
  it('produces an empty array when no headers are present', () => {
    const server = makeServer();
    const defaults = deriveDefaultValues(server);
    expect(defaults.headers).toEqual([]);
  });

  it('maps each header entry to { key, value, isSecret: false } by default', () => {
    const server = makeServer({
      headers: { 'X-Custom': 'my-value', 'X-Other': 'other' } as unknown as MCPOptions['headers'],
      secretHeaderKeys: [] as unknown as MCPOptions['secretHeaderKeys'],
    });
    const defaults = deriveDefaultValues(server);
    expect(defaults.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Custom', value: 'my-value', isSecret: false },
        { key: 'X-Other', value: 'other', isSecret: false },
      ]),
    );
    expect(defaults.headers).toHaveLength(2);
  });

  it('marks a header as isSecret: true when its key is in secretHeaderKeys', () => {
    const server = makeServer({
      headers: { Authorization: '', 'X-Public': 'pub' } as unknown as MCPOptions['headers'],
      secretHeaderKeys: ['Authorization'] as unknown as MCPOptions['secretHeaderKeys'],
    });
    const defaults = deriveDefaultValues(server);
    const authHeader = defaults.headers.find((h) => h.key === 'Authorization');
    const pubHeader = defaults.headers.find((h) => h.key === 'X-Public');
    expect(authHeader?.isSecret).toBe(true);
    expect(pubHeader?.isSecret).toBe(false);
  });

  it('marks multiple headers as secret when all are in secretHeaderKeys', () => {
    const server = makeServer({
      headers: { 'X-Secret-A': '', 'X-Secret-B': '' } as unknown as MCPOptions['headers'],
      secretHeaderKeys: ['X-Secret-A', 'X-Secret-B'] as unknown as MCPOptions['secretHeaderKeys'],
    });
    const defaults = deriveDefaultValues(server);
    expect(defaults.headers.every((h) => h.isSecret)).toBe(true);
  });

  it('treats secretHeaderKeys as empty set when field is absent (YAML server)', () => {
    const server = makeServer({
      headers: { 'X-Custom': 'value' } as unknown as MCPOptions['headers'],
      // secretHeaderKeys deliberately omitted
    });
    const defaults = deriveDefaultValues(server);
    const entry = defaults.headers.find((h) => h.key === 'X-Custom');
    expect(entry?.isSecret).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: deriveDefaultValues – customUserVars round-trip
// ---------------------------------------------------------------------------

describe('deriveDefaultValues – customUserVars', () => {
  it('produces an empty array when customUserVars is absent', () => {
    const server = makeServer();
    const defaults = deriveDefaultValues(server);
    expect(defaults.customUserVars).toEqual([]);
  });

  it('maps each customUserVars entry to { key, title, description }', () => {
    const server = makeServer({
      customUserVars: {
        API_KEY: { title: 'API Key', description: 'Your API key' },
        INDEX: { title: 'Index Name', description: '' },
      },
    });
    const defaults = deriveDefaultValues(server);
    expect(defaults.customUserVars).toEqual(
      expect.arrayContaining([
        { key: 'API_KEY', title: 'API Key', description: 'Your API key' },
        { key: 'INDEX', title: 'Index Name', description: '' },
      ]),
    );
    expect(defaults.customUserVars).toHaveLength(2);
  });

  it('preserves an empty description string', () => {
    const server = makeServer({
      customUserVars: { TOKEN: { title: 'Token', description: '' } },
    });
    const defaults = deriveDefaultValues(server);
    expect(defaults.customUserVars[0].description).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests: buildHeaders
// ---------------------------------------------------------------------------

describe('buildHeaders', () => {
  it('returns empty object when headers array is empty', () => {
    expect(buildHeaders([])).toEqual({});
  });

  it('builds a plain headers map for non-secret entries', () => {
    const result = buildHeaders([
      { key: 'X-Custom', value: 'my-value', isSecret: false },
      { key: 'X-Other', value: 'other-value', isSecret: false },
    ]);
    expect(result.headers).toEqual({ 'X-Custom': 'my-value', 'X-Other': 'other-value' });
    expect(result.secretHeaderKeys).toEqual([]);
  });

  it('includes the header key in secretHeaderKeys for secret entries', () => {
    const result = buildHeaders([{ key: 'Authorization', value: 'Bearer token', isSecret: true }]);
    expect(result.headers).toEqual({ Authorization: 'Bearer token' });
    expect(result.secretHeaderKeys).toEqual(['Authorization']);
  });

  it('keeps secret headers with empty value (preserved masked value in edit mode)', () => {
    const result = buildHeaders([{ key: 'X-Secret', value: '', isSecret: true }], true);
    expect(result.headers).toEqual({ 'X-Secret': '' });
    expect(result.secretHeaderKeys).toEqual(['X-Secret']);
  });

  it('skips non-secret headers with blank values', () => {
    const result = buildHeaders([
      { key: 'X-Empty', value: '   ', isSecret: false },
      { key: 'X-Present', value: 'ok', isSecret: false },
    ]);
    expect(result.headers).toEqual({ 'X-Present': 'ok' });
    expect(result.secretHeaderKeys).toEqual([]);
  });

  it('skips entries with blank keys', () => {
    const result = buildHeaders([
      { key: '  ', value: 'some-value', isSecret: false },
      { key: 'X-Real', value: 'val', isSecret: false },
    ]);
    expect(result.headers).toEqual({ 'X-Real': 'val' });
  });

  it('trims whitespace from keys and values', () => {
    const result = buildHeaders([{ key: '  X-Padded  ', value: '  padded  ', isSecret: false }]);
    expect(result.headers).toEqual({ 'X-Padded': 'padded' });
  });

  it('returns empty object when all entries have blank keys', () => {
    const result = buildHeaders([{ key: '', value: 'value', isSecret: false }]);
    expect(result).toEqual({});
  });

  it('returns empty object when all non-secret entries have blank values', () => {
    const result = buildHeaders([{ key: 'X-Empty', value: '', isSecret: false }]);
    expect(result).toEqual({});
  });

  it('mixes secret and non-secret headers, builds correct secretHeaderKeys', () => {
    const result = buildHeaders([
      { key: 'X-Api-Key', value: 'secret-value', isSecret: true },
      { key: 'X-Index', value: 'my-index', isSecret: false },
      { key: 'X-Token', value: 'tok', isSecret: true },
    ]);
    expect(result.headers).toEqual({
      'X-Api-Key': 'secret-value',
      'X-Index': 'my-index',
      'X-Token': 'tok',
    });
    expect(result.secretHeaderKeys).toEqual(['X-Api-Key', 'X-Token']);
  });

  it('always emits secretHeaderKeys (even as empty array) when headers are present', () => {
    const result = buildHeaders([{ key: 'X-Public', value: 'pub', isSecret: false }]);
    expect(result.secretHeaderKeys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: buildCustomUserVars
// ---------------------------------------------------------------------------

describe('buildCustomUserVars', () => {
  it('returns undefined when array is empty', () => {
    expect(buildCustomUserVars([])).toBeUndefined();
  });

  it('builds a map with title and description', () => {
    const result = buildCustomUserVars([
      { key: 'API_KEY', title: 'API Key', description: 'Your API key' },
    ]);
    expect(result).toEqual({ API_KEY: { title: 'API Key', description: 'Your API key' } });
  });

  it('preserves empty description string', () => {
    const result = buildCustomUserVars([{ key: 'TOKEN', title: 'Token', description: '' }]);
    expect(result).toEqual({ TOKEN: { title: 'Token', description: '' } });
  });

  it('trims whitespace from key, title, and description', () => {
    const result = buildCustomUserVars([
      { key: '  MY_VAR  ', title: '  My Var  ', description: '  desc  ' },
    ]);
    expect(result).toEqual({ MY_VAR: { title: 'My Var', description: 'desc' } });
  });

  it('skips entries with blank keys', () => {
    const result = buildCustomUserVars([
      { key: '', title: 'Should be skipped', description: '' },
      { key: 'VALID', title: 'Valid Var', description: '' },
    ]);
    expect(result).toEqual({ VALID: { title: 'Valid Var', description: '' } });
  });

  it('skips entries with blank titles', () => {
    const result = buildCustomUserVars([
      { key: 'MY_KEY', title: '', description: 'some desc' },
      { key: 'OTHER', title: 'Other', description: '' },
    ]);
    expect(result).toEqual({ OTHER: { title: 'Other', description: '' } });
  });

  it('skips entries with whitespace-only key', () => {
    const result = buildCustomUserVars([{ key: '   ', title: 'Title', description: '' }]);
    expect(result).toBeUndefined();
  });

  it('skips entries with whitespace-only title', () => {
    const result = buildCustomUserVars([{ key: 'MY_KEY', title: '   ', description: '' }]);
    expect(result).toBeUndefined();
  });

  it('returns undefined when all entries are invalid', () => {
    const result = buildCustomUserVars([
      { key: '', title: '', description: '' },
      { key: '  ', title: '  ', description: '' },
    ]);
    expect(result).toBeUndefined();
  });

  it('handles multiple valid entries', () => {
    const result = buildCustomUserVars([
      { key: 'API_KEY', title: 'API Key', description: 'Key for auth' },
      { key: 'INDEX', title: 'Index Name', description: '' },
      { key: 'TOP_K', title: 'Top K', description: 'Number of results' },
    ]);
    expect(result).toEqual({
      API_KEY: { title: 'API Key', description: 'Key for auth' },
      INDEX: { title: 'Index Name', description: '' },
      TOP_K: { title: 'Top K', description: 'Number of results' },
    });
  });
});
