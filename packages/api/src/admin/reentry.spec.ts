import { encryptV3, setConfigFields, toConfigOverrideState } from '@librechat/data-schemas';
import type { ConfigFieldWrite } from '@librechat/data-schemas';
import type { TCustomConfig } from 'librechat-data-provider';
import { findSecretReentry, getAzureGroupReentryIssues } from './reentry';

/** Encryption reads `CREDS_KEY` when data-schemas loads, before any spec code runs. */
jest.mock('@librechat/data-schemas', () => {
  process.env.CREDS_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return jest.requireActual('@librechat/data-schemas');
});

const STORED_KEY = 'v3:00000000000000000000000000000000:abcdef';

const yaml = {
  mcpServers: {
    tools: { type: 'streamable-http', url: 'https://yaml.example/mcp' },
  },
} as unknown as Partial<TCustomConfig>;

interface StoredDocument {
  overrides: Record<string, unknown>;
  tombstones: string[];
}

/** A document that stores only the key for the YAML server, which supplies the URL. */
const stored: StoredDocument = {
  overrides: {
    mcpServers: {
      tools: { apiKey: { source: 'admin', authorization_type: 'bearer', key: STORED_KEY } },
    },
  },
  tombstones: [] as string[],
};

/** A key the request entered, as encryption leaves it: a ciphertext no stored document holds. */
const ENTERED_KEY = 'v3:11111111111111111111111111111111:abcdef';

function check(
  writes: ConfigFieldWrite[],
  base = yaml,
  document: StoredDocument = stored,
  entered: ReadonlySet<string> = new Set([ENTERED_KEY]),
) {
  return findSecretReentry({
    stored: document,
    candidate: setConfigFields(toConfigOverrideState(document), writes),
    base,
    entered,
  });
}

describe('findSecretReentry', () => {
  describe('the mcpConfig alias, which the merge applies like mcpServers', () => {
    const aliased: StoredDocument = {
      overrides: {
        mcpConfig: {
          aliasA: {
            type: 'streamable-http',
            url: 'https://good.example/mcp',
            apiKey: { source: 'admin', authorization_type: 'bearer', key: STORED_KEY },
          },
        },
      },
      tombstones: [],
    };

    it('refuses a URL change under a key stored in the alias', () => {
      expect(
        check(
          [{ segments: ['mcpConfig', 'aliasA', 'url'], value: 'https://evil.example/mcp' }],
          yaml,
          aliased,
        ),
      ).toMatchObject({ code: 'MCP_API_KEY_REENTRY_REQUIRED', server: 'aliasA', fields: ['url'] });
    });

    it('accepts the change when the key is entered again', () => {
      expect(
        check(
          [
            { segments: ['mcpConfig', 'aliasA', 'url'], value: 'https://evil.example/mcp' },
            { segments: ['mcpConfig', 'aliasA', 'apiKey', 'key'], value: ENTERED_KEY },
          ],
          yaml,
          aliased,
        ),
      ).toBeNull();
    });

    it('resolves an alias server over its librechat.yaml entry and tombstones', () => {
      const yamlKeyed = {
        overrides: {
          mcpConfig: {
            tools: { apiKey: { source: 'admin', authorization_type: 'bearer', key: STORED_KEY } },
          },
        },
        tombstones: [] as string[],
      };
      expect(
        findSecretReentry({
          stored: yamlKeyed,
          candidate: { ...toConfigOverrideState(yamlKeyed), tombstones: ['mcpConfig.tools.url'] },
          base: yaml,
          entered: new Set(),
        }),
      ).toMatchObject({ server: 'tools', fields: ['url'] });
    });
  });

  it('compares servers as they resolve over librechat.yaml', () => {
    expect(
      check([{ segments: ['mcpServers', 'tools', 'url'], value: 'https://evil.example/mcp' }]),
    ).toEqual({
      code: 'MCP_API_KEY_REENTRY_REQUIRED',
      message: expect.stringContaining('url'),
      server: 'tools',
      fields: ['url'],
    });

    /** Spelling out the URL librechat.yaml already gives changes nothing. */
    expect(
      check([{ segments: ['mcpServers', 'tools', 'url'], value: 'https://yaml.example/mcp' }]),
    ).toBeNull();
  });

  it('catches a binding change that only shows on the resolved server, such as a tombstoned URL', () => {
    const document = { ...stored, tombstones: ['mcpServers.tools.url'] };
    const candidate = toConfigOverrideState(document);
    expect(
      findSecretReentry({
        stored,
        candidate,
        base: yaml,
        entered: new Set(),
      }),
    ).toMatchObject({ fields: ['url'] });
  });

  it('lets a write that supplies the key change the binding', () => {
    expect(
      check([
        { segments: ['mcpServers', 'tools', 'url'], value: 'https://moved.example/mcp' },
        { segments: ['mcpServers', 'tools', 'apiKey', 'key'], value: ENTERED_KEY },
      ]),
    ).toBeNull();
  });

  it('ignores a key the write removes and a key that is a visible reference', () => {
    expect(
      check([
        { segments: ['mcpServers', 'tools', 'url'], value: 'https://moved.example/mcp' },
        {
          segments: ['mcpServers', 'tools', 'apiKey'],
          value: { source: 'user', authorization_type: 'bearer' },
        },
      ]),
    ).toBeNull();

    const reference = {
      overrides: {
        mcpServers: {
          tools: { apiKey: { source: 'admin', authorization_type: 'bearer', key: '${K}' } },
        },
      },
      tombstones: [] as string[],
    };
    expect(
      check(
        [{ segments: ['mcpServers', 'tools', 'url'], value: 'https://moved.example/mcp' }],
        yaml,
        reference,
      ),
    ).toBeNull();
  });

  it('treats how the key is sent as part of its binding, as the user tier does', () => {
    /** The key as secret preservation leaves it: kept from the stored document, not supplied. */
    const writes: ConfigFieldWrite[] = [
      {
        segments: ['mcpServers', 'tools', 'apiKey'],
        value: {
          source: 'admin',
          authorization_type: 'custom',
          custom_header: 'X-Key',
          key: STORED_KEY,
        },
      },
    ];
    expect(
      findSecretReentry({
        stored,
        candidate: setConfigFields(toConfigOverrideState(stored), writes),
        base: yaml,
        entered: new Set(),
      }),
    ).toMatchObject({ fields: ['apiKey.authorization_type', 'apiKey.custom_header'] });
  });
  describe('a key is judged by the value the document ends up with, not by the paths written', () => {
    const GOOD = 'https://good.example/mcp';
    const EVIL = 'https://evil.example/mcp';
    const OTHER_KEY = 'v3:22222222222222222222222222222222:abcdef';
    const server = (url: string, key: string) => ({
      type: 'streamable-http',
      url,
      apiKey: { source: 'admin', authorization_type: 'bearer', key },
    });
    const document = (servers: Record<string, unknown>): StoredDocument => ({
      overrides: { mcpServers: servers },
      tombstones: [],
    });
    const judge = (
      from: StoredDocument,
      servers: Record<string, unknown>,
      entered: ReadonlySet<string> = new Set(),
    ) =>
      findSecretReentry({
        stored: from,
        candidate: toConfigOverrideState(document(servers)),
        base: {},
        entered,
      });

    it('refuses a stored key put back beside a new URL, though the request entered a decoy at its path', () => {
      /** The decoy was entered, but a later write of the request put the stored ciphertext back. */
      expect(
        judge(
          document({ probe: server(GOOD, STORED_KEY) }),
          { probe: server(EVIL, STORED_KEY) },
          new Set([ENTERED_KEY]),
        ),
      ).toMatchObject({ code: 'MCP_API_KEY_REENTRY_REQUIRED', server: 'probe', fields: ['url'] });
    });

    it('accepts the URL change when the document holds the key the request entered', () => {
      expect(
        judge(
          document({ probe: server(GOOD, STORED_KEY) }),
          { probe: server(EVIL, ENTERED_KEY) },
          new Set([ENTERED_KEY]),
        ),
      ).toBeNull();
    });

    it('follows a key to the server it was renamed or copied from, under any name', () => {
      const before = document({ probe: server(GOOD, STORED_KEY) });

      expect(judge(before, { renamed: server(EVIL, STORED_KEY) })).toMatchObject({
        server: 'renamed',
        fields: ['url'],
      });
      expect(judge(before, { renamed: server(GOOD, STORED_KEY) })).toBeNull();
      expect(
        judge(before, { probe: server(GOOD, STORED_KEY), copy: server(EVIL, STORED_KEY) }),
      ).toMatchObject({ server: 'copy', fields: ['url'] });
    });

    it('accepts a name swap that moves each key with its own server', () => {
      const before = document({ a: server(GOOD, STORED_KEY), b: server(EVIL, OTHER_KEY) });

      expect(judge(before, { a: server(EVIL, OTHER_KEY), b: server(GOOD, STORED_KEY) })).toBeNull();
      /** Swapping the keys but not the URLs sends each key somewhere new. */
      expect(
        judge(before, { a: server(GOOD, OTHER_KEY), b: server(EVIL, STORED_KEY) }),
      ).toMatchObject({
        server: 'a',
        fields: ['url'],
      });
    });

    it('finds the origin of a legacy plaintext key that preservation encrypted on the way', () => {
      const legacy = 'sk-legacy-plaintext-key-0001';
      const carried = encryptV3(legacy);

      expect(
        judge(document({ probe: server(GOOD, legacy) }), { renamed: server(EVIL, carried) }),
      ).toMatchObject({ server: 'renamed', fields: ['url'] });
      expect(
        judge(document({ probe: server(GOOD, legacy) }), { renamed: server(GOOD, carried) }),
      ).toBeNull();
    });
  });
});

describe('getAzureGroupReentryIssues', () => {
  const yamlGroupMap = {
    east: { apiKey: 'yaml-literal-key', instanceName: 'east', version: '2024-10-21', models: {} },
  };
  const group = (overrides: Record<string, unknown> = {}) => ({
    group: 'west',
    apiKey: STORED_KEY,
    instanceName: 'west',
    version: '2024-10-21',
    deploymentName: 'gpt-5',
    models: { 'gpt-5': true },
    ...overrides,
  });
  const storedGroups: StoredDocument = {
    overrides: { endpoints: { azureOpenAI: { groups: [group()] } } },
    tombstones: [],
  };

  function judge(writes: ConfigFieldWrite[], document: StoredDocument = storedGroups) {
    return getAzureGroupReentryIssues({
      stored: document,
      candidate: setConfigFields(toConfigOverrideState(document), writes),
      baseGroupMap: yamlGroupMap,
      entered: new Set([ENTERED_KEY]),
    });
  }

  const groupsWrite = (...groups: Record<string, unknown>[]): ConfigFieldWrite[] => [
    { segments: ['endpoints', 'azureOpenAI', 'groups'], value: groups },
  ];

  it('refuses a kept key under a moved instance, and accepts it entered again', () => {
    expect(judge(groupsWrite(group({ instanceName: 'attacker' })))).toEqual([
      {
        path: 'endpoints.azureOpenAI.groups.0.instanceName',
        segments: ['endpoints', 'azureOpenAI', 'groups', '0', 'instanceName'],
        code: 'secret_reentry_required',
        secretPath: 'endpoints.azureOpenAI.groups.0.apiKey',
      },
    ]);
    expect(judge(groupsWrite(group({ instanceName: 'attacker', apiKey: ENTERED_KEY })))).toEqual(
      [],
    );
    expect(judge(groupsWrite(group({ version: '2025-01-01' })))).toEqual([]);
  });

  it('judges a group that does not resolve yet, so a later write cannot put the move to use', () => {
    const unresolved = group({ instanceName: 'attacker', deploymentName: undefined });

    expect(judge(groupsWrite(unresolved)).map(({ path }) => path)).toEqual([
      'endpoints.azureOpenAI.groups.0.instanceName',
    ]);
  });

  it('judges a groupMap key over the group librechat.yaml resolves, under the tombstones', () => {
    const mapped: StoredDocument = {
      overrides: { endpoints: { azureOpenAI: { groupMap: { east: { apiKey: STORED_KEY } } } } },
      tombstones: [],
    };
    const tombstoned = getAzureGroupReentryIssues({
      stored: mapped,
      candidate: {
        ...toConfigOverrideState(mapped),
        tombstones: ['endpoints.azureOpenAI.groupMap.east.instanceName'],
      },
      baseGroupMap: yamlGroupMap,
      entered: new Set(),
    });

    expect(
      judge(
        [
          {
            segments: ['endpoints', 'azureOpenAI', 'groupMap', 'east', 'instanceName'],
            value: 'east',
          },
        ],
        mapped,
      ),
    ).toEqual([]);
    expect(tombstoned.map(({ path, secretPath }) => [path, secretPath])).toEqual([
      [
        'endpoints.azureOpenAI.groupMap.east.instanceName',
        'endpoints.azureOpenAI.groupMap.east.apiKey',
      ],
    ]);
  });

  it("leaves librechat.yaml's own keys to the merge", () => {
    const empty: StoredDocument = { overrides: {}, tombstones: [] };

    expect(
      judge(
        [
          {
            segments: ['endpoints', 'azureOpenAI', 'groupMap', 'east', 'instanceName'],
            value: 'x',
          },
        ],
        empty,
      ),
    ).toEqual([]);
  });
});
