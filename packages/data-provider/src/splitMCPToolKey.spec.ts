import {
  Constants,
  splitMCPToolKey,
  splitToolCallName,
  normalizeMCPToolKey,
  buildServerNameAliases,
} from './config';

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

describe('splitToolCallName', () => {
  const d = Constants.mcp_delimiter;

  it('treats a synthetic OAuth call as oauth plus the full server name', () => {
    expect(splitToolCallName(`oauth${d}foo${d}bar`)).toEqual(['oauth', `foo${d}bar`]);
  });

  it('keeps a normalized server name that itself contains the delimiter', () => {
    expect(splitToolCallName(`oauth${d}oauth${d}server`)).toEqual(['oauth', `oauth${d}server`]);
  });

  it('resolves a real tool key whose raw name contains the delimiter', () => {
    expect(splitToolCallName(`gitlab-get${d}server_version${d}gitlab`)).toEqual([
      `gitlab-get${d}server_version`,
      'gitlab',
    ]);
  });

  it('resolves a real tool key against configured server names when supplied', () => {
    expect(splitToolCallName(`search${d}Google${d}Workspace`, [`Google${d}Workspace`])).toEqual([
      'search',
      `Google${d}Workspace`,
    ]);
  });
});

describe('splitToolCallName with configured server names', () => {
  const d = Constants.mcp_delimiter;

  it('reads a real tool whose own name starts with the oauth prefix', () => {
    expect(splitToolCallName(`oauth${d}reset${d}github`, ['github'])).toEqual([
      `oauth${d}reset`,
      'github',
    ]);
  });

  it('still resolves a synthetic OAuth call for a configured server', () => {
    expect(splitToolCallName(`oauth${d}github`, ['github'])).toEqual(['oauth', 'github']);
  });

  it('resolves a synthetic OAuth call for a delimiter-bearing configured server', () => {
    expect(splitToolCallName(`oauth${d}foo${d}bar`, [`foo${d}bar`])).toEqual([
      'oauth',
      `foo${d}bar`,
    ]);
  });
});

describe('splitMCPToolKey boundary alignment', () => {
  const d = Constants.mcp_delimiter;

  it('ignores a configured name that is not delimiter-aligned in the key', () => {
    /** `server` is a bare suffix of `myserver`, not a segment. Matching on
     *  `endsWith(name)` instead of `endsWith(delimiter + name)` would route the
     *  call to a different configured server than the agent authorized. */
    expect(splitMCPToolKey(`search${d}myserver`, ['server'])).toEqual(['search', 'myserver']);
  });

  it('treats an empty known-name list the same as no list', () => {
    expect(splitMCPToolKey(`gitlab-get${d}server_version${d}gitlab`, [])).toEqual([
      `gitlab-get${d}server_version`,
      'gitlab',
    ]);
  });

  it('requires the configured name to be normalized to match the key', () => {
    /** Keys embed `normalizeServerName`'s output, so callers must normalize their
     *  candidate list; a raw name with spaces can never align. */
    expect(splitMCPToolKey(`search${d}Google_mcp_Workspace`, ['Google_mcp_Workspace'])).toEqual([
      'search',
      'Google_mcp_Workspace',
    ]);
  });
});

describe('buildServerNameAliases', () => {
  it('maps normalized forms back to raw config names, including identity entries', () => {
    const aliases = buildServerNameAliases(['plain', 'Connector: Company']);
    expect(aliases.get('plain')).toBe('plain');
    expect(aliases.get('Connector__Company')).toBe('Connector: Company');
    expect(aliases.get('Connector: Company')).toBeUndefined();
  });

  it('skips empty names', () => {
    expect(buildServerNameAliases(['', 'srv']).size).toBe(1);
  });

  it('resolves normalized-name collisions to the FIRST configured name deterministically', () => {
    /** `Sales Force` and `Sales:Force` both normalize to `Sales_Force`; their
     *  tool keys are inherently ambiguous, so routing must at least be stable
     *  (the collision itself is warned about at context resolution). */
    const aliases = buildServerNameAliases(['Sales Force', 'Sales:Force']);
    expect(aliases.get('Sales_Force')).toBe('Sales Force');
  });

  it('an identity name owns its slot regardless of configuration order', () => {
    /** A server literally named `Sales_Force` must never have its keys
     *  rerouted to a special-character server that normalizes onto it. */
    expect(buildServerNameAliases(['Sales Force', 'Sales_Force']).get('Sales_Force')).toBe(
      'Sales_Force',
    );
    expect(buildServerNameAliases(['Sales_Force', 'Sales Force']).get('Sales_Force')).toBe(
      'Sales_Force',
    );
  });
});

describe('normalizeMCPToolKey', () => {
  const d = Constants.mcp_delimiter;

  it('rewrites the server segment of a raw-keyed tool to its normalized form', () => {
    expect(normalizeMCPToolKey(`search${d}Connector: Company`, ['Connector: Company'])).toBe(
      `search${d}Connector__Company`,
    );
  });

  it('is a no-op for already-normalized keys and safe server names', () => {
    expect(normalizeMCPToolKey(`search${d}Connector__Company`, ['Connector: Company'])).toBe(
      `search${d}Connector__Company`,
    );
    expect(normalizeMCPToolKey(`search${d}plain`, ['plain'])).toBe(`search${d}plain`);
  });

  it('is a no-op when no configured raw name matches (unconfigured or non-MCP keys)', () => {
    expect(normalizeMCPToolKey(`search${d}gone server`, ['Connector: Company'])).toBe(
      `search${d}gone server`,
    );
    expect(normalizeMCPToolKey('web_search', ['Connector: Company'])).toBe('web_search');
  });

  it('resolves the boundary by longest raw match, preserving delimiter-bearing tool names', () => {
    /** The tool half may itself contain the delimiter (gateway-prefixed names). */
    expect(normalizeMCPToolKey(`gitlab-get${d}server_version${d}My Server`, ['My Server'])).toBe(
      `gitlab-get${d}server_version${d}My_Server`,
    );
    /** `normalizeServerName` strips the trailing `_` it substitutes for `!`. */
    expect(normalizeMCPToolKey(`search${d}My${d}Server!`, ['Server!', `My${d}Server!`])).toBe(
      `search${d}My${d}Server`,
    );
  });
});

describe('splitToolCallName oauth precedence', () => {
  const d = Constants.mcp_delimiter;

  it('falls back to the oauth prefix when a list is supplied but nothing matches', () => {
    /** Pins the precedence rule: the configured branch must not return its
     *  last-delimiter result when no configured name actually matched. */
    expect(splitToolCallName(`oauth${d}foo${d}bar`, ['github'])).toEqual(['oauth', `foo${d}bar`]);
  });

  it('prefers a matching configured server over the oauth prefix', () => {
    expect(splitToolCallName(`oauth${d}reset${d}github`, ['github'])).toEqual([
      `oauth${d}reset`,
      'github',
    ]);
  });
});
