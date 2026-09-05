import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { FileSources, PrincipalType, PrincipalModel, configSchema } from 'librechat-data-provider';
import type { AppConfig, IConfig, IUser, ConfigRevisionSnapshot } from '@librechat/data-schemas';
import type { MCPOptions } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

type DataSchemas = typeof import('@librechat/data-schemas');
type AdminConfigHandlers = ReturnType<typeof import('./config').createAdminConfigHandlers>;

interface MutationResponse {
  statusCode: number;
  body?: { error?: string; config?: IConfig; revision?: ConfigRevisionSnapshot };
}

describe('atomic config handlers — real revision transactions', () => {
  let replSet: MongoMemoryReplSet;
  let methods: ReturnType<DataSchemas['createMethods']>;
  let handlers: AdminConfigHandlers;
  let mergeConfigOverrides: DataSchemas['mergeConfigOverrides'];
  let processMCPEnv: typeof import('../utils/env').processMCPEnv;
  let resolveHeaders: typeof import('../utils/env').resolveHeaders;
  let yamlBaseline: AppConfig;

  beforeAll(async () => {
    const dataSchemas = await import('@librechat/data-schemas');
    const { createAdminConfigHandlers } = await import('./config');
    ({ mergeConfigOverrides } = dataSchemas);
    ({ processMCPEnv, resolveHeaders } = await import('../utils/env'));
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    // Only the Config indexes are needed; avoid creating every model's indexes
    // while the disposable replica set is executing transaction tests.
    await mongoose.connect(replSet.getUri(), { autoIndex: false, autoCreate: false });
    dataSchemas.createModels(mongoose);
    methods = dataSchemas.createMethods(mongoose);
    await dataSchemas.ensureConfigIndexes(mongoose);
    handlers = createAdminConfigHandlers({
      listAllConfigs: methods.listAllConfigs,
      findConfigByPrincipal: methods.findConfigByPrincipal,
      upsertConfig: methods.upsertConfig,
      patchConfigFields: methods.patchConfigFields,
      tombstoneConfigField: methods.tombstoneConfigField,
      unsetConfigField: methods.unsetConfigField,
      deleteConfig: methods.deleteConfig,
      toggleConfigActive: methods.toggleConfigActive,
      mutateConfigWithRevision: methods.mutateConfigWithRevision,
      listConfigRevisions: methods.listConfigRevisions,
      hasConfigCapability: async () => true,
      hasCapability: async () => true,
      getAppConfig: async () => yamlBaseline,
    });
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });

  beforeEach(async () => {
    await mongoose.models.Config.deleteMany({});
    await mongoose.connection.collection('admin_config_revisions').deleteMany({});
    await mongoose.connection.collection('admin_config_version_epochs').deleteMany({});
    yamlBaseline = {
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      cloudfront: configSchema.shape.cloudfront.parse({
        domain: 'https://cdn.example.com',
        urlExpiry: 3600,
      }),
    };
  });

  async function mutate(
    expectedVersion: number | null,
    body: Record<string, unknown>,
  ): Promise<MutationResponse> {
    const user = new (mongoose.models.User as mongoose.Model<IUser>)({ role: 'ADMIN' });
    const req = {
      user,
      params: { principalType: 'role', principalId: '__base__' },
      body: { ...body, expectedVersion, expectedTenantId: '' },
    } as Partial<ServerRequest> as ServerRequest;
    const result: MutationResponse = { statusCode: 200 };
    const res = {
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(value: MutationResponse['body']) {
        result.body = value;
        return this;
      },
    } as Response;
    await handlers.mutateConfigAtomic(req, res);
    return result;
  }

  async function current(): Promise<IConfig> {
    const config = await methods.findConfigByPrincipal(PrincipalType.ROLE, '__base__', {
      includeInactive: true,
      tenantId: '',
    });
    expect(config).not.toBeNull();
    return config!;
  }

  async function revisions(): Promise<number> {
    return mongoose.connection.collection('admin_config_revisions').countDocuments({});
  }

  it('persists header templates encrypted without changing their runtime meaning', async () => {
    const result = await mutate(null, {
      entries: [
        {
          fieldPath: 'endpoints.openAI',
          value: { headers: { 'X-User': '{{LIBRECHAT_USER_ID}}' } },
        },
        {
          fieldPath: 'mcpServers.remote',
          value: {
            type: 'streamable-http',
            url: 'https://mcp.example.com',
            headers: { Authorization: 'Bearer {{MCP_API_KEY}}' },
          },
        },
      ],
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(JSON.stringify(saved.overrides)).not.toContain('{{');
    expect(JSON.stringify(result.body)).not.toContain('v3:');
    const runtime = mergeConfigOverrides(yamlBaseline, [saved]);
    expect(
      resolveHeaders({
        headers: runtime.endpoints?.openAI?.headers,
        user: { id: 'user-42' },
        stripUnresolved: true,
      }),
    ).toEqual({ 'X-User': 'user-42' });
    const resolved = processMCPEnv({
      options: runtime.mcpConfig!.remote as MCPOptions,
      customUserVars: { MCP_API_KEY: 'test-token' },
    });
    expect('headers' in resolved && resolved.headers).toEqual({
      Authorization: 'Bearer test-token',
    });
  });

  async function seedTombstones(tombstones: string[]): Promise<void> {
    yamlBaseline.mcpConfig = {
      remote: { type: 'streamable-http', url: 'https://yaml.example.com' },
    };
    await mongoose.models.Config.create({
      principalType: PrincipalType.ROLE,
      principalModel: PrincipalModel.ROLE,
      principalId: '__base__',
      tenantId: null,
      priority: 0,
      isActive: true,
      configVersion: 0,
      overrides: {},
      tombstones,
    });
  }

  it('allows a reset-only no-op for an absent optional section', async () => {
    const result = await mutate(null, { resetPaths: ['mcpServers.remote'] });
    expect(result.statusCode).toBe(200);
    expect(await mongoose.models.Config.countDocuments({})).toBe(0);
    expect(await revisions()).toBe(0);
  });

  it.each([false, true])(
    'validates newly appended custom endpoints by identity (unknown key: %s)',
    async (unknownKey) => {
      const yamlEndpoints = configSchema.shape.endpoints.parse({
        custom: [
          {
            name: 'yaml-endpoint',
            apiKey: 'user_provided',
            baseURL: 'https://yaml.example.com',
            models: { default: ['model'] },
          },
        ],
      });
      yamlBaseline.endpoints = { custom: yamlEndpoints?.custom };
      const result = await mutate(null, {
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [
              {
                name: 'new-endpoint',
                apiKey: 'user_provided',
                baseURL: 'https://new.example.com',
                models: { default: ['model'] },
                headers: { 'X-User': '{{LIBRECHAT_USER_ID}}' },
                ...(unknownKey ? { unsupportedOption: true } : {}),
              },
            ],
          },
        ],
      });
      expect(result.statusCode).toBe(unknownKey ? 400 : 200);
      if (unknownKey) {
        expect(result.body?.error).toMatch(/endpoints.custom.0.unsupportedOption/);
        expect(await mongoose.models.Config.countDocuments({})).toBe(0);
        expect(await revisions()).toBe(0);
        return;
      }
      const runtime = mergeConfigOverrides(yamlBaseline, [await current()]);
      expect(runtime.endpoints?.custom?.map((endpoint) => endpoint.name)).toEqual([
        'yaml-endpoint',
        'new-endpoint',
      ]);
    },
  );

  it.each(['mcpServers', 'mcpServers.remote.url'])(
    'rejects a sparse field patch when retained %s tombstone hides a required YAML value',
    async (tombstone) => {
      await seedTombstones([tombstone]);
      const before = await current();
      const result = await mutate(0, {
        entries: [{ fieldPath: 'mcpServers.remote.type', value: 'streamable-http' }],
      });
      expect(result.statusCode).toBe(400);
      expect(result.body?.error).toMatch(/mcpServers/);
      const saved = await current();
      expect(saved.overrides).toEqual(before.overrides);
      expect(saved.tombstones).toEqual([tombstone]);
      expect(saved.configVersion).toBe(0);
      expect(await revisions()).toBe(0);
    },
  );

  it('allows a complete server beneath a retained whole-section tombstone', async () => {
    await seedTombstones(['mcpServers']);
    const result = await mutate(0, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: { type: 'streamable-http', url: 'https://new.example.com' },
        },
      ],
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(saved.tombstones).toEqual(['mcpServers']);
    expect(mergeConfigOverrides(yamlBaseline, [saved]).mcpConfig?.remote).toEqual({
      type: 'streamable-http',
      url: 'https://new.example.com',
    });
  });

  it('allows a sparse patch when a sibling reset clears the blocking tombstone', async () => {
    await seedTombstones(['mcpServers.remote.url']);
    const result = await mutate(0, {
      entries: [{ fieldPath: 'mcpServers.remote.type', value: 'streamable-http' }],
      resetPaths: ['mcpServers.remote.url'],
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(saved.tombstones).toEqual([]);
    expect(mergeConfigOverrides(yamlBaseline, [saved]).mcpConfig?.remote).toEqual({
      type: 'streamable-http',
      url: 'https://yaml.example.com',
    });
  });

  it('rejects an object replacement while a descendant tombstone still hides its required URL', async () => {
    await seedTombstones(['mcpServers.remote.url']);
    const result = await mutate(0, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: { type: 'streamable-http' },
        },
      ],
    });
    // Setting the parent currently retains descendant tombstones. The runtime
    // therefore cannot inherit the URL, even though the object is replaced.
    expect(result.statusCode).toBe(400);
    expect(await revisions()).toBe(0);
  });

  it('rejects a nested object replacement that drops a required DB-only child without writing', async () => {
    const initial = await mutate(null, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: { type: 'streamable-http', url: 'https://mcp.example.com' },
        },
      ],
    });
    expect(initial.statusCode).toBe(200);
    const before = await revisions();
    const result = await mutate(initial.body!.config!.configVersion, {
      entries: [{ fieldPath: 'mcpServers.remote', value: { type: 'streamable-http' } }],
    });
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toMatch(/mcpServers/);
    expect((await current()).overrides.mcpServers?.remote).toMatchObject({
      url: 'https://mcp.example.com',
    });
    expect((await current()).configVersion).toBe(initial.body!.config!.configVersion);
    expect(await revisions()).toBe(before);
  });

  it('resolves omitted children from YAML, not from the replaced DB object', async () => {
    yamlBaseline.mcpConfig = {
      remote: { type: 'streamable-http', url: 'https://yaml.example.com' },
    };
    const initial = await mutate(null, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: { type: 'streamable-http', url: 'https://old.example.com', timeout: 9000 },
        },
      ],
    });
    const result = await mutate(initial.body!.config!.configVersion, {
      entries: [{ fieldPath: 'mcpServers.remote', value: { type: 'streamable-http' } }],
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(saved.overrides.mcpServers?.remote).toEqual({ type: 'streamable-http' });
    expect(mergeConfigOverrides(yamlBaseline, [saved]).mcpConfig?.remote).toEqual({
      type: 'streamable-http',
      url: 'https://yaml.example.com',
    });
  });

  it('restores a sparse snapshot against YAML without materializing inherited values', async () => {
    const first = await mutate(null, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
    });
    const second = await mutate(first.body!.config!.configVersion, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 9000 }],
    });
    const result = await mutate(second.body!.config!.configVersion, {
      restoreRevisionId: second.body!.revision!.id,
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(saved.overrides).toEqual({ cloudfront: { urlExpiry: 7200 } });
    expect(mergeConfigOverrides(yamlBaseline, [saved]).cloudfront).toMatchObject({
      domain: 'https://cdn.example.com',
      urlExpiry: 7200,
    });
    expect(await revisions()).toBe(3);
  });

  it('rejects a sparse restore if the required YAML value has disappeared, without writing', async () => {
    const first = await mutate(null, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
    });
    const second = await mutate(first.body!.config!.configVersion, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 9000 }],
    });
    delete yamlBaseline.cloudfront;
    const result = await mutate(second.body!.config!.configVersion, {
      restoreRevisionId: second.body!.revision!.id,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toMatch(/domain/);
    expect((await current()).overrides).toEqual({ cloudfront: { urlExpiry: 9000 } });
    expect((await current()).configVersion).toBe(second.body!.config!.configVersion);
    expect(await revisions()).toBe(2);
  });

  it('includes the snapshot tombstones when validating inherited required fields', async () => {
    const first = await mutate(null, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
    });
    const second = await mutate(first.body!.config!.configVersion, {
      entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 9000 }],
    });
    await mongoose.connection
      .collection('admin_config_revisions')
      .updateOne(
        { id: second.body!.revision!.id },
        { $set: { tombstones: ['cloudfront.domain'] } },
      );
    const result = await mutate(second.body!.config!.configVersion, {
      restoreRevisionId: second.body!.revision!.id,
    });
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toMatch(/domain/);
    expect(await revisions()).toBe(2);
  });

  it('saves the panel whole-entry recreation without restoring removed options or credentials', async () => {
    const initial = await mutate(null, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: {
            type: 'sse',
            url: 'https://old.example.com',
            timeout: 9000,
            oauth: {
              client_id: 'old-client',
              client_secret: 'old-secret',
              authorization_url: 'https://old.example.com/authorize',
              token_url: 'https://old.example.com/token',
            },
            headers: { Authorization: 'old-header' },
            oauth_headers: { Authorization: 'old-oauth-header' },
            apiKey: { source: 'admin', authorization_type: 'bearer', key: 'old-api-key' },
          },
        },
      ],
    });
    expect(initial.statusCode).toBe(200);
    const result = await mutate(initial.body!.config!.configVersion, {
      entries: [
        {
          fieldPath: 'mcpServers.remote',
          value: {
            type: 'sse',
            url: 'https://new.example.com',
            oauth: { client_id: 'new-client', __previousIdentity: null },
            headers: { __previousIdentity: null },
            oauth_headers: { __previousIdentity: null },
          },
        },
      ],
    });
    expect(result.statusCode).toBe(200);
    const saved = await current();
    expect(saved.overrides.mcpServers?.remote).toEqual({
      type: 'sse',
      url: 'https://new.example.com',
      oauth: { client_id: 'new-client' },
      headers: {},
      oauth_headers: {},
    });
    expect(configSchema.partial().safeParse(saved.overrides).success).toBe(true);
    expect(await revisions()).toBe(2);
  });

  it.each([true, false])(
    'rejects entries plus resets plus isActive=%s without writing',
    async (isActive) => {
      const initial = await mutate(null, { entries: [{ fieldPath: 'cache', value: true }] });
      const result = await mutate(initial.body!.config!.configVersion, {
        entries: [{ fieldPath: 'cache', value: false }],
        resetPaths: ['cloudfront'],
        isActive,
      });
      expect(result.statusCode).toBe(400);
      expect(result.body?.error).toBe('isActive cannot be combined with other mutations');
      expect((await current()).overrides).toEqual({ cache: true });
      expect((await current()).isActive).toBe(true);
      expect((await current()).configVersion).toBe(initial.body!.config!.configVersion);
      expect(await revisions()).toBe(1);
    },
  );
});
