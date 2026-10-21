import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import type { AppConfig, ConfigDraft } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = process.env.CREDS_IV ?? '0123456789abcdef0123456789abcdef';

type DataSchemas = typeof import('@librechat/data-schemas');
type Methods = ReturnType<DataSchemas['createMethods']>;
type AdminConfigDeps = Parameters<typeof import('./config').createAdminConfigHandlers>[0];
type Secrets = typeof import('./secrets');

interface MockRes {
  statusCode: number;
  body: undefined | Record<string, unknown>;
  status: jest.Mock;
  json: jest.Mock;
}

interface ChangesBody {
  config?: { overrides: Record<string, unknown>; tombstones: string[]; revision: string } | null;
  revision: string | null;
  written: boolean;
  dryRun: boolean;
  applied: Array<{ opIndex: number; op: string; segments: string[]; key?: string }>;
  skipped: Array<{ opIndex: number; op: string; segments: string[]; reason: string }>;
  ignored: Array<{ opIndex: number; op: string; segments: string[]; reason: string }>;
  unchanged: Array<{ opIndex: number; op: string; segments: string[] }>;
  error?: string;
  code?: string;
  reason?: string;
  opIndex?: number;
  issues?: Array<{ path: string; code: string }>;
  currentRevision?: string | null;
}

let mongoServer: MongoMemoryServer;
let methods: Methods;
let decryptV3: DataSchemas['decryptV3'];
let secrets: Secrets;
let createAdminConfigHandlers: typeof import('./config').createAdminConfigHandlers;

/** The deployment's librechat.yaml, which every write is validated on top of. */
const YAML = {
  endpoints: {
    custom: [
      {
        name: 'yaml-endpoint',
        apiKey: '${YAML_KEY}',
        baseURL: 'https://yaml.example.com/v1',
        models: { default: ['m'] },
      },
    ],
  },
  mcpServers: {
    'yaml-http': { type: 'streamable-http', url: 'https://mcp.example.com/mcp' },
    'yaml-stdio': { command: 'node', args: ['server.js'] },
  },
  memory: { agent: { id: 'agent_yaml' } },
};

function mockReq(overrides: Record<string, unknown> = {}): ServerRequest {
  return {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Partial<ServerRequest> as ServerRequest;
}

function mockRes(): Response & MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: MockRes['body']) => {
      res.body = data;
      return res;
    }),
  };
  return res as Partial<Response> as Response & MockRes;
}

function createDeps(overrides: Partial<AdminConfigDeps> = {}): AdminConfigDeps {
  return {
    listAllConfigs: methods.listAllConfigs,
    findConfigByPrincipal: methods.findConfigByPrincipal,
    writeConfigDocument: jest.fn(methods.writeConfigDocument),
    tombstoneConfigField: methods.tombstoneConfigField,
    unsetConfigField: methods.unsetConfigField,
    deleteConfig: methods.deleteConfig,
    toggleConfigActiveTracked: methods.toggleConfigActiveTracked,
    hasConfigCapability: async () => true,
    hasAnyConfigReadAccess: async () => true,
    hasCapability: async () => true,
    getAppConfig: async () => ({ config: YAML }) as unknown as AppConfig,
    invalidateConfigCaches: jest.fn(async () => undefined),
    recordAuditEntry: jest.fn(async () => undefined),
    ...overrides,
  };
}

const raw = () => mongoose.connection.db!.collection('configs');

let counter = 0;
function nextParams(): { principalType: string; principalId: string } {
  counter += 1;
  return { principalType: 'role', principalId: `changes-${counter}` };
}

async function send(
  body: Record<string, unknown>,
  params: { principalType: string; principalId: string },
  deps: AdminConfigDeps = createDeps(),
): Promise<{ status: number; body: ChangesBody; deps: AdminConfigDeps }> {
  const handlers = createAdminConfigHandlers(deps);
  const res = mockRes();
  await handlers.applyConfigChanges(mockReq({ params, body }), res);
  return { status: res.statusCode, body: res.body as unknown as ChangesBody, deps };
}

async function storedDocument(principalId: string) {
  return raw().findOne({ principalId });
}

/** Stores a role document as is, past every API guard, as an older server or another writer might. */
async function seedDocument(
  principalId: string,
  overrides: Record<string, unknown>,
  tombstones: string[],
): Promise<void> {
  const draft: ConfigDraft = {
    principalModel: PrincipalModel.ROLE,
    priority: 10,
    isActive: true,
    overrides: overrides as ConfigDraft['overrides'],
    tombstones,
  };
  await methods.writeConfigDocument(PrincipalType.ROLE, principalId, draft, 'absent');
}

async function patchFields(
  entries: Array<{ fieldPath: string; value: unknown }>,
  params: { principalType: string; principalId: string },
): Promise<{ status: number; body: ChangesBody }> {
  const handlers = createAdminConfigHandlers(createDeps());
  const res = mockRes();
  await handlers.patchConfigField(mockReq({ params, body: { entries } }), res);
  return { status: res.statusCode, body: res.body as unknown as ChangesBody };
}

const endpoint = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  baseURL: `https://${name}.example.com/v1`,
  models: { default: ['m'] },
  ...extra,
});

/** Booting mongod and importing data-schemas and the handlers can be slow on a busy runner. */
const LIFECYCLE_TIMEOUT_MS = 180_000;

beforeAll(async () => {
  const [dataSchemas, handlersModule, secretsModule, server] = await Promise.all([
    import('@librechat/data-schemas'),
    import('./config'),
    import('./secrets'),
    MongoMemoryServer.create(),
  ]);
  mongoServer = server;
  secrets = secretsModule;
  ({ decryptV3 } = dataSchemas);
  ({ createAdminConfigHandlers } = handlersModule);
  jest.spyOn(dataSchemas.logger, 'error').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'warn').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'info').mockReturnValue(dataSchemas.logger);

  await mongoose.connect(mongoServer.getUri());
  dataSchemas.createModels(mongoose);
  await mongoose.models.Config.init();
  methods = dataSchemas.createMethods(mongoose);
}, LIFECYCLE_TIMEOUT_MS);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
}, LIFECYCLE_TIMEOUT_MS);

describe('POST …/changes: one atomic write', () => {
  it('applies a mixed batch in order with one compare-and-swap write', async () => {
    const params = nextParams();
    await send(
      {
        ops: [
          { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
          { op: 'set', fieldPath: 'balance.startBalance', value: 5 },
          { op: 'set', fieldPath: 'mcpServers.mine', value: { type: 'sse', url: 'https://a/sse' } },
        ],
      },
      params,
    );
    const before = await storedDocument(params.principalId);

    const { status, body, deps } = await send(
      {
        ops: [
          { op: 'unset', fieldPath: 'balance.startBalance' },
          { op: 'tombstone', fieldPath: 'memory.agent' },
          { op: 'rename', fieldPath: 'mcpServers', from: 'mine', to: 'renamed' },
          { op: 'set', fieldPath: 'mcpServers.renamed.title', value: 'Mine' },
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('own') },
        ],
        expectedRevision: `${before!._id.toString()}:${before!.configVersion}`,
      },
      params,
    );

    expect(status).toBe(200);
    expect(body.written).toBe(true);
    expect(body.applied.map((ref) => ref.op)).toEqual([
      'unset',
      'tombstone',
      'rename',
      'set',
      'upsertEntry',
    ]);
    expect(body.applied[4].key).toBe('own');
    expect(deps.writeConfigDocument).toHaveBeenCalledTimes(1);
    expect(deps.invalidateConfigCaches).toHaveBeenCalledTimes(1);

    const after = await storedDocument(params.principalId);
    expect(after!.configVersion).toBe(before!.configVersion + 1);
    expect(after!.overrides).toEqual({
      interface: { customWelcome: 'hi' },
      mcpServers: { renamed: { type: 'sse', url: 'https://a/sse', title: 'Mine' } },
      endpoints: { custom: [endpoint('own')] },
    });
    expect(after!.tombstones).toEqual(['memory.agent']);
    expect(body.revision).toBe(`${after!._id.toString()}:${after!.configVersion}`);
    expect(body.config?.revision).toBe(body.revision);
  });

  it('writes nothing when any change is invalid: a rename plus an invalid title (audit mcp-01)', async () => {
    const params = nextParams();
    await send(
      {
        ops: [{ op: 'set', fieldPath: 'mcpServers.old', value: { type: 'sse', url: 'https://o' } }],
      },
      params,
    );
    const before = await storedDocument(params.principalId);

    const { status, body, deps } = await send(
      {
        ops: [
          { op: 'rename', fieldPath: 'mcpServers', from: 'old', to: 'new' },
          { op: 'set', fieldPath: 'mcpServers.new.title', value: 123 },
        ],
      },
      params,
    );

    expect(status).toBe(400);
    expect(body.code).toBe('CONFIG_OVERRIDE_INVALID');
    expect(body.issues).toEqual([{ path: 'mcpServers.new.title', code: 'invalid_type' }]);
    expect(deps.writeConfigDocument).not.toHaveBeenCalled();
    expect(await storedDocument(params.principalId)).toEqual(before);
  });

  it('does not apply a reset when a set in the same batch is invalid (audit providers-03)', async () => {
    const params = nextParams();
    await send({ ops: [{ op: 'set', fieldPath: 'balance.startBalance', value: 5 }] }, params);
    const before = await storedDocument(params.principalId);

    const { status } = await send(
      {
        ops: [
          { op: 'unset', fieldPath: 'balance.startBalance' },
          { op: 'set', fieldPath: 'balance.refillAmount', value: 'lots' },
        ],
      },
      params,
    );

    expect(status).toBe(400);
    expect(await storedDocument(params.principalId)).toEqual(before);
  });

  it('applies far more than the PATCH limit of 100 entries atomically', async () => {
    const params = nextParams();
    const ops = Array.from({ length: 250 }, (_, index) => ({
      op: 'set',
      segments: ['endpoints', 'bedrock', 'inferenceProfiles', `us.model-${index}.v1`],
      value: `arn:aws:bedrock:us-east-1:1:inference-profile/${index}`,
    }));

    const refused = await send(
      { ops: [...ops, { op: 'set', fieldPath: 'balance.startBalance', value: 'x' }] },
      params,
    );
    expect(refused.status).toBe(400);
    expect(await storedDocument(params.principalId)).toBeNull();

    const { status, body } = await send({ ops }, params);
    expect(status).toBe(200);
    expect(body.applied).toHaveLength(250);
    const stored = await methods.findConfigByPrincipal('role' as never, params.principalId);
    expect(stored!.configVersion).toBe(1);
    expect(
      Object.keys(
        (stored!.overrides as { endpoints: { bedrock: { inferenceProfiles: object } } }).endpoints
          .bedrock.inferenceProfiles,
      ),
    ).toHaveLength(250);
  });

  it('judges the batch in its end state: tombstone the YAML agent id, set provider and model', async () => {
    const params = nextParams();
    const setsOnly = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'memory.agent.provider', value: 'openAI' },
          { op: 'set', fieldPath: 'memory.agent.model', value: 'gpt-4o' },
        ],
      },
      params,
    );
    expect(setsOnly.status).toBe(400);

    const { status, body } = await send(
      {
        ops: [
          { op: 'tombstone', fieldPath: 'memory.agent.id' },
          { op: 'set', fieldPath: 'memory.agent.provider', value: 'openAI' },
          { op: 'set', fieldPath: 'memory.agent.model', value: 'gpt-4o' },
        ],
      },
      params,
    );
    expect(status).toBe(200);
    expect(body.config?.overrides).toEqual({
      memory: { agent: { provider: 'openAI', model: 'gpt-4o' } },
    });
    expect(body.config?.tombstones).toEqual(['memory.agent.id']);
  });
});

describe('POST …/changes: secrets', () => {
  it('keeps a stored secret when a set of its object omits it', async () => {
    const params = nextParams();
    await send(
      {
        ops: [
          {
            op: 'set',
            fieldPath: 'webSearch',
            value: { serperApiKey: 'sk-serper-secret-value', searchProvider: 'serper' },
          },
        ],
      },
      params,
    );
    const stored = await storedDocument(params.principalId);
    const ciphertext = stored!.overrides.webSearch.serperApiKey as string;
    expect(ciphertext.startsWith('v3:')).toBe(true);

    const { status, body } = await send(
      {
        ops: [
          {
            op: 'set',
            fieldPath: 'webSearch',
            value: {
              searchProvider: 'serper',
              serperApiKeyPreview: '...lue',
              scraperTimeout: 9000,
            },
          },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    const after = await storedDocument(params.principalId);
    expect(after!.overrides.webSearch.serperApiKey).toBe(ciphertext);
    expect(decryptV3(after!.overrides.webSearch.serperApiKey)).toBe('sk-serper-secret-value');
    expect(after!.overrides.webSearch.scraperTimeout).toBe(9000);
    expect(JSON.stringify(body)).not.toContain('sk-serper-secret-value');
    expect(JSON.stringify(body)).not.toContain(ciphertext);
  });

  it('encrypts an entry key, keeps it through a rename and an edit, and never needs it again', async () => {
    const params = nextParams();
    const created = await send(
      {
        ops: [
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: endpoint('old', { apiKey: 'sk-endpoint-secret-0001' }),
          },
        ],
      },
      params,
    );
    expect(created.status).toBe(200);
    const stored = await storedDocument(params.principalId);
    const [storedEntry] = stored!.overrides.endpoints.custom;
    expect(storedEntry.apiKey.startsWith('v3:')).toBe(true);
    expect(storedEntry.apiKeyPreview).toBe('...0001');

    const { status, body } = await send(
      {
        ops: [
          { op: 'rename', fieldPath: 'endpoints.custom', from: 'old', to: 'new' },
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: endpoint('new', { baseURL: 'https://new.example.com/v2' }),
          },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    const [entry] = (await storedDocument(params.principalId))!.overrides.endpoints.custom;
    expect(entry).toEqual({
      ...endpoint('new', { baseURL: 'https://new.example.com/v2' }),
      apiKey: storedEntry.apiKey,
      apiKeyPreview: '...0001',
    });
    expect(secrets.resolveCustomEndpointSecrets(entry).apiKey).toBe('sk-endpoint-secret-0001');
    const returned = (body.config?.overrides.endpoints as { custom: object[] }).custom[0];
    expect(returned).not.toHaveProperty('apiKey');
    expect(returned).toHaveProperty('apiKeyPreview', '...0001');
  });

  it('refuses submitted ciphertext and writes under a secret, naming the change', async () => {
    const params = nextParams();

    const encrypted = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: endpoint('x', { apiKey: 'v3:00112233445566778899aabbccddeeff:abcd' }),
          },
        ],
      },
      params,
    );
    expect(encrypted.status).toBe(400);
    expect(encrypted.body).toMatchObject({ code: 'SECRET_PATH', opIndex: 1 });

    const inside = await send(
      { ops: [{ op: 'set', fieldPath: 'webSearch.serperApiKey.nested', value: 'x' }] },
      params,
    );
    expect(inside.body).toMatchObject({ code: 'SECRET_PATH', opIndex: 0 });

    const preview = await send(
      { ops: [{ op: 'unset', fieldPath: 'webSearch.serperApiKeyPreview' }] },
      params,
    );
    expect(preview.body).toMatchObject({ code: 'SECRET_PATH', opIndex: 0 });
    expect(await storedDocument(params.principalId)).toBeNull();
  });

  it('removes a secret and its preview together on unset and tombstone', async () => {
    const params = nextParams();
    await send(
      { ops: [{ op: 'set', fieldPath: 'webSearch.serperApiKey', value: 'sk-serper-0123456789' }] },
      params,
    );
    expect(Object.keys((await storedDocument(params.principalId))!.overrides.webSearch)).toEqual([
      'serperApiKey',
      'serperApiKeyPreview',
    ]);

    await send({ ops: [{ op: 'tombstone', fieldPath: 'webSearch.serperApiKey' }] }, params);

    const stored = await storedDocument(params.principalId);
    expect(stored!.overrides).toEqual({});
    expect(stored!.tombstones).toEqual(['webSearch.serperApiKey', 'webSearch.serperApiKeyPreview']);
  });
});

describe('POST …/changes: entries librechat.yaml owns', () => {
  it('refuses to rename a YAML entry or to take its name', async () => {
    const params = nextParams();
    await send(
      {
        ops: [
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('own') },
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: endpoint('yaml-endpoint', { baseURL: 'https://yaml.example.com/v1' }),
          },
          { op: 'set', fieldPath: 'mcpServers.yaml-http.title', value: 'HTTP' },
        ],
      },
      params,
    );
    const before = await storedDocument(params.principalId);

    for (const op of [
      { op: 'rename', fieldPath: 'endpoints.custom', from: 'yaml-endpoint', to: 'other' },
      { op: 'rename', fieldPath: 'endpoints.custom', from: 'own', to: 'yaml-endpoint' },
      { op: 'rename', fieldPath: 'mcpServers', from: 'yaml-http', to: 'other' },
    ]) {
      const { status, body } = await send({ ops: [op] }, params);
      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'CONFIG_ENTRY_INVALID',
        reason: 'inherited_entry',
        opIndex: 0,
      });
    }
    expect(await storedDocument(params.principalId)).toEqual(before);
  });

  it('lets removeEntry revert an own override of a YAML entry and report a missing one', async () => {
    const params = nextParams();
    await send(
      {
        ops: [
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: { name: 'yaml-endpoint', models: { default: ['override'] } },
          },
        ],
      },
      params,
    );

    const { status, body } = await send(
      {
        ops: [
          { op: 'removeEntry', fieldPath: 'endpoints.custom', key: 'yaml-endpoint' },
          { op: 'removeEntry', fieldPath: 'endpoints.custom', key: 'never-added' },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    expect(body.applied.map((ref) => ref.key)).toEqual(['yaml-endpoint']);
    expect(body.unchanged.map((ref) => ref.opIndex)).toEqual([1]);
    expect((await storedDocument(params.principalId))!.overrides).toEqual({});
  });

  it('reports writes to a YAML stdio server as applied but ignored at runtime', async () => {
    const params = nextParams();
    const { status, body } = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'mcpServers.yaml-stdio.title', value: 'Local' },
          { op: 'set', fieldPath: 'mcpServers.yaml-http.title', value: 'Remote' },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    expect(body.applied).toHaveLength(2);
    expect(body.ignored).toEqual([
      {
        opIndex: 0,
        op: 'set',
        segments: ['mcpServers', 'yaml-stdio', 'title'],
        reason: 'process_mcp_server',
      },
    ]);
  });

  it('refuses process-only MCP fields as PATCH does', async () => {
    const { status, body } = await send(
      { ops: [{ op: 'set', fieldPath: 'mcpServers.mine.command', value: 'rm' }] },
      nextParams(),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'PROCESS_MCP_CONFIG', opIndex: 0 });
  });
});

describe('POST …/changes: skipped, not refused (owner decision #2)', () => {
  it('stores the rest of the batch and reports each skipped change or part with its reason', async () => {
    const params = nextParams();
    const { status, body } = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'filters.blockedDomains', value: ['x.com'] },
          { op: 'set', fieldPath: 'langfuse.publicKey', value: 'pk' },
          { op: 'set', fieldPath: 'interface.prompts', value: false },
          {
            op: 'set',
            fieldPath: 'interface',
            value: {
              modelSelect: false,
              agents: { use: false, placeholder: 'keep' },
              bookmarks: false,
            },
          },
          {
            op: 'set',
            fieldPath: 'endpoints.agents',
            value: { disableBuilder: true, pullRequests: { provider: 'github', enabled: true } },
          },
          { op: 'tombstone', fieldPath: 'endpoints.agents.pullRequests.host' },
          { op: 'set', fieldPath: 'endpoints.agents.pullRequests.oauth', value: {} },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    expect(
      body.skipped.map(({ opIndex, segments, reason }) => [opIndex, segments.join('.'), reason]),
    ).toEqual([
      [0, 'filters.blockedDomains', 'base_only_section'],
      [1, 'langfuse.publicKey', 'dedicated_section'],
      [2, 'interface.prompts', 'interface_permission'],
      [3, 'interface.agents.use', 'interface_permission'],
      [3, 'interface.bookmarks', 'interface_permission'],
      [4, 'endpoints.agents.pullRequests.provider', 'base_only_path'],
      [5, 'endpoints.agents.pullRequests.host', 'base_only_path'],
      [6, 'endpoints.agents.pullRequests.oauth', 'base_only_path'],
    ]);
    expect(body.applied.map((ref) => ref.opIndex)).toEqual([3, 4]);
    const stored = await storedDocument(params.principalId);
    expect(stored!.overrides).toEqual({
      interface: { modelSelect: false, agents: { placeholder: 'keep' } },
      endpoints: { agents: { disableBuilder: true, pullRequests: { enabled: true } } },
    });
    expect(stored!.tombstones).toEqual([]);
  });

  it('replaces what a whole-value set addresses with what is left of it, resetting it when nothing is', async () => {
    const params = nextParams();
    const seed = () =>
      send(
        {
          ops: [
            { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
            { op: 'set', fieldPath: 'endpoints.agents.pullRequests.enabled', value: true },
          ],
        },
        params,
      );
    const resetOps = [
      { op: 'set', fieldPath: 'interface', value: { prompts: false } },
      { op: 'set', fieldPath: 'endpoints.agents.pullRequests', value: { provider: 'github' } },
    ];
    await seed();

    const partial = await send(
      {
        ops: [{ op: 'set', fieldPath: 'interface', value: { prompts: false, modelSelect: true } }],
      },
      params,
    );
    expect(partial.body.config?.overrides.interface).toEqual({ modelSelect: true });

    await seed();
    const { status, body } = await send({ ops: resetOps }, params);

    expect(status).toBe(200);
    expect(body.applied.map(({ opIndex, op }) => [opIndex, op])).toEqual([
      [0, 'set'],
      [1, 'set'],
    ]);
    expect(body.skipped.map(({ segments, reason }) => [segments.join('.'), reason])).toEqual([
      ['interface.prompts', 'interface_permission'],
      ['endpoints.agents.pullRequests.provider', 'base_only_path'],
    ]);
    expect((await storedDocument(params.principalId))!.overrides).toEqual({});

    const again = await send({ ops: resetOps }, params);
    expect(again.body.written).toBe(false);
    expect(again.body.unchanged.map((ref) => ref.opIndex)).toEqual([0, 1]);
  });

  it('answers 200 without writing when every change is skipped', async () => {
    const params = nextParams();
    const { status, body, deps } = await send(
      { ops: [{ op: 'set', fieldPath: 'filters.blockedDomains', value: [] }] },
      params,
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ written: false, revision: null, config: null, applied: [] });
    expect(body.skipped).toHaveLength(1);
    expect(deps.writeConfigDocument).not.toHaveBeenCalled();
    expect(deps.recordAuditEntry).not.toHaveBeenCalled();
  });
});

describe('POST …/changes: no-ops, dry runs and preconditions', () => {
  it('writes nothing for a batch that changes nothing, keeping the revision', async () => {
    const params = nextParams();
    const first = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' }] },
      params,
    );

    const { status, body, deps } = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
          { op: 'unset', fieldPath: 'balance' },
          { op: 'removeEntry', fieldPath: 'endpoints.custom', key: 'none' },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    expect(body.written).toBe(false);
    expect(body.unchanged.map((ref) => ref.opIndex)).toEqual([0, 1, 2]);
    expect(body.revision).toBe(first.body.revision);
    expect(deps.writeConfigDocument).not.toHaveBeenCalled();
    expect(deps.invalidateConfigCaches).not.toHaveBeenCalled();
  });

  it('validates and reports on a dry run without writing', async () => {
    const params = nextParams();
    const valid = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
          { op: 'set', fieldPath: 'filters.blockedDomains', value: [] },
        ],
        dryRun: true,
      },
      params,
    );
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ dryRun: true, written: false, revision: null });
    expect(valid.body).not.toHaveProperty('config');
    expect(valid.body.applied).toHaveLength(1);
    expect(valid.body.skipped).toHaveLength(1);

    const invalid = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'filters.blockedDomains', value: [] },
          { op: 'set', fieldPath: 'balance.startBalance', value: 'x' },
        ],
        dryRun: true,
      },
      params,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: 'CONFIG_OVERRIDE_INVALID',
      issues: [{ path: 'balance.startBalance', code: 'invalid_type' }],
      skipped: [
        {
          opIndex: 0,
          op: 'set',
          segments: ['filters', 'blockedDomains'],
          reason: 'base_only_section',
        },
      ],
    });
    expect(await storedDocument(params.principalId)).toBeNull();
  });

  it('answers 409 for a stale revision and for a create-only batch on an existing document', async () => {
    const params = nextParams();
    const created = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'one' }] },
      params,
    );
    await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'two' }] },
      params,
    );
    const current = (await send({ ops: [{ op: 'unset', fieldPath: 'none' }] }, params)).body
      .revision;

    const stale = await send(
      {
        ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'three' }],
        expectedRevision: created.body.revision,
      },
      params,
    );
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: 'CONFIG_VERSION_CONFLICT', currentRevision: current });

    const createOnly = await send(
      {
        ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'three' }],
        expectedRevision: 'absent',
      },
      params,
    );
    expect(createOnly.status).toBe(409);

    const malformed = await send(
      { ops: [{ op: 'unset', fieldPath: 'x' }], expectedRevision: 'nope' },
      params,
    );
    expect(malformed.body.code).toBe('INVALID_EXPECTED_REVISION');
    expect((await storedDocument(params.principalId))!.overrides.interface.customWelcome).toBe(
      'two',
    );
  });

  it('absorbs concurrent batches without a revision so neither is lost', async () => {
    const params = nextParams();
    await send({ ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'x' }] }, params);

    const results = await Promise.all(
      ['a', 'b', 'c'].map((key) =>
        send(
          { ops: [{ op: 'set', segments: ['mcpServers', key], value: { url: `https://${key}` } }] },
          params,
        ),
      ),
    );

    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    const stored = await storedDocument(params.principalId);
    expect(Object.keys(stored!.overrides.mcpServers).sort()).toEqual(['a', 'b', 'c']);
    expect(stored!.configVersion).toBe(4);
  });

  it('lets exactly one of two batches at the same revision win', async () => {
    const params = nextParams();
    const created = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'x' }] },
      params,
    );

    const results = await Promise.all(
      ['a', 'b'].map((value) =>
        send(
          {
            ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value }],
            expectedRevision: created.body.revision,
          },
          params,
        ),
      ),
    );

    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  });
});

describe('POST …/changes: request checks', () => {
  it('refuses two changes that address the same path or entry', async () => {
    const samePath = await send(
      {
        ops: [
          { op: 'unset', fieldPath: 'interface.customWelcome' },
          { op: 'set', segments: ['interface', 'customWelcome'], value: 'x' },
        ],
      },
      nextParams(),
    );
    expect(samePath.body).toMatchObject({ code: 'DUPLICATE_FIELD_PATH', opIndex: 1 });

    const sameEntry = await send(
      {
        ops: [
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('a') },
          { op: 'removeEntry', fieldPath: 'endpoints.custom', key: 'a' },
        ],
      },
      nextParams(),
    );
    expect(sameEntry.body).toMatchObject({ code: 'DUPLICATE_FIELD_PATH', opIndex: 1 });

    const otherEntries = await send(
      {
        ops: [
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('a') },
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('b') },
          { op: 'set', fieldPath: 'endpoints.custom', value: [endpoint('c')] },
        ],
      },
      nextParams(),
    );
    expect(otherEntries.status).toBe(200);
    expect(otherEntries.body.config?.overrides).toEqual({ endpoints: { custom: [endpoint('c')] } });
  });

  it('refuses malformed changes, naming the first one', async () => {
    const cases: Array<[unknown, string, string?]> = [
      [{ op: 'replace', fieldPath: 'a' }, 'INVALID_CHANGE'],
      [null, 'INVALID_CHANGE'],
      [{ op: 'set', fieldPath: 'interface.customWelcome' }, 'INVALID_CHANGE'],
      [{ op: 'set', fieldPath: 'a..b', value: 1 }, 'INVALID_FIELD_PATH'],
      [
        { op: 'set', segments: ['interface', '$where'], value: 1 },
        'CONFIG_PATH_INVALID',
        'unsafe_segment',
      ],
      [
        { op: 'tombstone', segments: ['endpoints', 'bedrock', 'inferenceProfiles', 'us.a'] },
        'CONFIG_PATH_INVALID',
        'dotted_segment',
      ],
      [
        { op: 'upsertEntry', fieldPath: 'modelSpecs.list', entry: { name: 'x' } },
        'CONFIG_ENTRY_INVALID',
        'not_collection',
      ],
      [
        { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: { baseURL: 'x' } },
        'CONFIG_ENTRY_INVALID',
        'invalid_entry',
      ],
      [
        { op: 'removeEntry', fieldPath: 'endpoints.custom' },
        'CONFIG_ENTRY_INVALID',
        'invalid_entry',
      ],
      [
        { op: 'rename', fieldPath: 'interface', from: 'a', to: 'b' },
        'CONFIG_ENTRY_INVALID',
        'not_collection',
      ],
      [
        { op: 'rename', fieldPath: 'mcpServers', from: 'a', to: 'b.c' },
        'CONFIG_PATH_INVALID',
        'dotted_segment',
      ],
      [
        { op: 'rename', fieldPath: 'mcpServers', from: 'a', to: '__proto__' },
        'CONFIG_PATH_INVALID',
        'unsafe_segment',
      ],
      [{ op: 'set', fieldPath: 'paths.uploads', value: '/tmp/x' }, 'UNKNOWN_SECTION'],
      [{ op: 'set', fieldPath: 'config.version', value: '1.0.0' }, 'UNKNOWN_SECTION'],
      [{ op: 'set', segments: ['availableTools'], value: {} }, 'UNKNOWN_SECTION'],
      [{ op: 'tombstone', fieldPath: 'interfaceConfig.customWelcome' }, 'UNKNOWN_SECTION'],
      [{ op: 'upsertEntry', fieldPath: 'mcpConfig', entry: { name: 'x' } }, 'UNKNOWN_SECTION'],
      [{ op: 'rename', fieldPath: 'turnstileConfig', from: 'a', to: 'b' }, 'UNKNOWN_SECTION'],
      [
        { op: 'tombstone', fieldPath: 'endpoints.custom.0.baseURL' },
        'CONFIG_PATH_INVALID',
        'inside_array',
      ],
      [{ op: 'tombstone', fieldPath: 'endpoints.custom.0' }, 'CONFIG_PATH_INVALID', 'inside_array'],
      [
        { op: 'tombstone', fieldPath: 'modelSpecs.list.0.preset' },
        'CONFIG_PATH_INVALID',
        'inside_array',
      ],
    ];
    for (const [op, code, reason] of cases) {
      const { status, body } = await send(
        { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'ok' }, op] },
        nextParams(),
      );
      expect({ op, status, code: body.code, reason: body.reason, opIndex: body.opIndex }).toEqual({
        op,
        status: 400,
        code,
        reason,
        opIndex: 1,
      });
    }
  });

  it('lets unset remove what an older server stored outside configSchema, which nothing else may write', async () => {
    const params = nextParams();
    await seedDocument(
      params.principalId,
      { paths: { uploads: '/tmp/x' }, interface: { customWelcome: 'hi' } },
      ['config.version'],
    );

    const { status, body } = await send(
      {
        ops: [
          { op: 'unset', fieldPath: 'paths' },
          { op: 'unset', fieldPath: 'config' },
        ],
      },
      params,
    );

    expect(status).toBe(200);
    expect(body.applied.map((ref) => ref.opIndex)).toEqual([0, 1]);
    const stored = await storedDocument(params.principalId);
    expect(stored!.overrides).toEqual({ interface: { customWelcome: 'hi' } });
    expect(stored!.tombstones).toEqual([]);
  });

  it('hides a whole inherited array but refuses a tombstone inside one', async () => {
    const params = nextParams();
    const whole = await send({ ops: [{ op: 'tombstone', fieldPath: 'endpoints.custom' }] }, params);
    expect(whole.status).toBe(200);
    expect(whole.body.config?.tombstones).toEqual(['endpoints.custom']);

    const inside = await send(
      { ops: [{ op: 'tombstone', segments: ['mcpServers', 'yaml-stdio', 'args', '0'] }] },
      params,
    );
    expect(inside.body).toMatchObject({
      code: 'CONFIG_PATH_INVALID',
      reason: 'inside_array',
      opIndex: 0,
    });
    expect((await storedDocument(params.principalId))!.tombstones).toEqual(['endpoints.custom']);
  });

  it('refuses a record rename that reaches into a merged-by-key array by position', async () => {
    const params = nextParams();
    await send(
      {
        ops: [
          {
            op: 'upsertEntry',
            fieldPath: 'endpoints.custom',
            entry: endpoint('own', { headers: { 'X-Old': '1' } }),
          },
        ],
      },
      params,
    );

    const { status, body } = await send(
      {
        ops: [
          { op: 'rename', fieldPath: 'endpoints.custom.0.headers', from: 'X-Old', to: 'X-New' },
        ],
      },
      params,
    );

    expect(status).toBe(400);
    expect(body.issues).toEqual([{ path: 'endpoints.custom', code: 'indexed_merge_key_write' }]);
  });

  it('refuses a change the stored document cannot take, writing nothing', async () => {
    const params = nextParams();
    await send({ ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' }] }, params);
    const before = await storedDocument(params.principalId);

    const scalar = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome.nested', value: 1 }] },
      params,
    );
    expect(scalar.body).toMatchObject({
      code: 'CONFIG_PATH_INVALID',
      reason: 'scalar_parent',
      opIndex: 0,
    });

    const missing = await send(
      { ops: [{ op: 'rename', fieldPath: 'mcpServers', from: 'ghost', to: 'other' }] },
      params,
    );
    expect(missing.body).toMatchObject({
      code: 'CONFIG_ENTRY_INVALID',
      reason: 'entry_not_found',
      opIndex: 0,
    });
    expect(await storedDocument(params.principalId)).toEqual(before);
  });

  it('bounds the batch size and checks the body fields', async () => {
    const params = nextParams();
    const tooMany = Array.from({ length: 1001 }, (_, index) => ({
      op: 'unset',
      fieldPath: `x.k${index}`,
    }));
    expect((await send({ ops: tooMany }, params)).body.code).toBe('TOO_MANY_OPS');
    expect((await send({ ops: [] }, params)).body.code).toBe('OPS_REQUIRED');
    expect((await send({}, params)).body.code).toBe('OPS_REQUIRED');
    expect(
      (await send({ ops: [{ op: 'unset', fieldPath: 'x' }], priority: -1 }, params)).body.code,
    ).toBe('INVALID_PRIORITY');
    expect(
      (await send({ ops: [{ op: 'unset', fieldPath: 'x' }], dryRun: 'yes' }, params)).body.code,
    ).toBe('INVALID_DRY_RUN');
    expect(
      (await send({ ops: [{ op: 'unset', fieldPath: 'x' }] }, { ...params, principalType: 'x' }))
        .body.code,
    ).toBe('INVALID_PRINCIPAL_TYPE');
  });
});

describe('POST …/changes: access', () => {
  const sectionManager = (sections: string[]) =>
    createDeps({
      hasConfigCapability: async (_user, section, verb) =>
        section != null && sections.includes(section) && verb === 'manage',
      getReadableConfigSections: async () => ({ broad: false, sections: new Set<string>() }),
    });

  it('requires manage on every section a batch touches, skipped changes included', async () => {
    const params = nextParams();
    const denied = await send(
      {
        ops: [
          { op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' },
          { op: 'set', fieldPath: 'filters.blockedDomains', value: [] },
        ],
      },
      params,
      sectionManager(['interface']),
    );

    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'FORBIDDEN_SECTION', section: 'filters' });
    expect(denied.deps.writeConfigDocument).not.toHaveBeenCalled();
  });

  it('returns only the sections a section manager can read or just wrote, and keeps the priority', async () => {
    const params = nextParams();
    await send(
      {
        ops: [{ op: 'set', fieldPath: 'balance.startBalance', value: 5 }],
        priority: 30,
      },
      params,
    );

    const { status, body } = await send(
      {
        ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' }],
        priority: 99,
      },
      params,
      sectionManager(['interface']),
    );

    expect(status).toBe(200);
    expect(body.config?.overrides).toEqual({ interface: { customWelcome: 'hi' } });
    const stored = await storedDocument(params.principalId);
    expect(stored!.priority).toBe(30);
    expect(stored!.overrides.balance).toEqual({ startBalance: 5 });
  });

  it('lets only a broad manager change __base__ and the priority', async () => {
    const base = { principalType: 'role', principalId: '__base__' };
    const denied = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' }] },
      base,
      sectionManager(['interface']),
    );
    expect(denied.status).toBe(403);

    const params = nextParams();
    await send({ ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'x' }] }, params);
    const priorityOnly = await send(
      { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'x' }], priority: 42 },
      params,
    );
    expect(priorityOnly.body.written).toBe(true);
    expect((await storedDocument(params.principalId))!.priority).toBe(42);
  });

  it('records one audit entry naming paths and entries, never values', async () => {
    const params = nextParams();
    const recordAuditEntry = jest.fn(async () => undefined);
    await send(
      {
        ops: [
          { op: 'set', fieldPath: 'webSearch.serperApiKey', value: 'sk-audit-secret-000' },
          { op: 'upsertEntry', fieldPath: 'endpoints.custom', entry: endpoint('audited') },
          { op: 'tombstone', fieldPath: 'memory.agent' },
          { op: 'unset', fieldPath: 'balance.startBalance' },
        ],
      },
      params,
      createDeps({ recordAuditEntry }),
    );

    expect(recordAuditEntry).toHaveBeenCalledTimes(1);
    const [entry] = recordAuditEntry.mock.calls[0] as unknown as [
      { action: string; metadata: Record<string, unknown> },
    ];
    expect(entry.action).toBe('config.created');
    expect(entry.metadata).toMatchObject({
      operation: 'batch',
      changes: 3,
      set: 'webSearch.serperApiKey',
      upsertEntry: 'endpoints.custom["audited"]',
      tombstone: 'memory.agent',
    });
    expect(entry.metadata).not.toHaveProperty('unset');
    expect(JSON.stringify(entry)).not.toContain('sk-audit-secret-000');
  });
});

describe('PATCH /fields and POST …/changes: tombstones a write lifts', () => {
  const AGENT_SWITCH = { fieldPath: 'memory.agent.id', value: 'agent_other' };

  /** A role that hides the YAML agent id and configures its own provider and model instead. */
  const seedOwnAgent = (params: { principalType: string; principalId: string }) =>
    send(
      {
        ops: [
          { op: 'tombstone', fieldPath: 'memory.agent.id' },
          { op: 'set', fieldPath: 'memory.agent.provider', value: 'openAI' },
          { op: 'set', fieldPath: 'memory.agent.model', value: 'gpt-4o' },
        ],
      },
      params,
    );

  it('lets PATCH switch a union one field at a time, and /changes switch it in one batch', async () => {
    const patched = nextParams();
    await seedOwnAgent(patched);
    expect((await patchFields([AGENT_SWITCH], patched)).status).toBe(200);

    const batched = nextParams();
    await seedOwnAgent(batched);
    const alone = await send({ ops: [{ op: 'set', ...AGENT_SWITCH }] }, batched);
    expect(alone.status).toBe(400);
    expect(alone.body.issues).toEqual([
      { path: 'memory.agent.provider', code: 'union_dropped_key' },
      { path: 'memory.agent.model', code: 'union_dropped_key' },
    ]);

    const switched = await send(
      {
        ops: [
          { op: 'set', ...AGENT_SWITCH },
          { op: 'unset', fieldPath: 'memory.agent.provider' },
          { op: 'unset', fieldPath: 'memory.agent.model' },
        ],
      },
      batched,
    );
    expect(switched.status).toBe(200);
    const stored = await storedDocument(batched.principalId);
    expect(stored!.overrides).toEqual({ memory: { agent: { id: 'agent_other' } } });
    expect(stored!.tombstones).toEqual([]);
  });

  it('refuses a PATCH whose deeper write brings back a hidden value the stored fields conflict with', async () => {
    const params = nextParams();
    await seedDocument(
      params.principalId,
      { memory: { agent: { provider: 'openAI', model: 'gpt-4o' } } },
      ['memory.agent'],
    );
    const before = await storedDocument(params.principalId);

    const { status, body } = await patchFields(
      [{ fieldPath: 'memory.agent.enabled', value: true }],
      params,
    );

    expect(status).toBe(400);
    expect(body.issues).toEqual([
      { path: 'memory.agent.provider', code: 'union_dropped_key' },
      { path: 'memory.agent.model', code: 'union_dropped_key' },
    ]);
    expect(await storedDocument(params.principalId)).toEqual(before);
  });
});
