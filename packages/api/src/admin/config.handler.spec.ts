import { tenantStorage, RestoreValidationError } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.mock('@librechat/data-schemas', () => {
  process.env.CREDS_KEY =
    process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    encryptV3: jest.fn((value: string) => `v3:test:${value}`),
  };
});

import { createAdminConfigHandlers } from './config';

function mockReq(overrides = {}) {
  const req = {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Partial<ServerRequest> as ServerRequest;
  if (
    req.body != null &&
    typeof req.body === 'object' &&
    'expectedVersion' in req.body &&
    !('expectedTenantId' in req.body)
  ) {
    Object.assign(req.body, {
      expectedTenantId: req.user?.tenantId ?? '',
    });
  }
  return req;
}

interface MockRes {
  statusCode: number;
  body: undefined | { config?: unknown; error?: string; [key: string]: unknown };
  status: jest.Mock;
  json: jest.Mock;
}

function mockRes() {
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

function versionedBaseConfig(configVersion: number) {
  return {
    _id: 'c1',
    principalType: 'role',
    principalId: '__base__',
    priority: 0,
    overrides: {},
    configVersion,
  };
}

function createHandlers(overrides = {}) {
  const deps = {
    listAllConfigs: jest.fn().mockResolvedValue([]),
    findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    upsertConfig: jest.fn().mockResolvedValue({
      _id: 'c1',
      principalType: 'role',
      principalId: 'admin',
      overrides: {},
      configVersion: 1,
    }),
    patchConfigFields: jest
      .fn()
      .mockResolvedValue({ _id: 'c1', overrides: { registration: { enabled: false } } }),
    tombstoneConfigField: jest
      .fn()
      .mockResolvedValue({ _id: 'c1', tombstones: ['mcpServers.github'] }),
    unsetConfigField: jest.fn().mockResolvedValue({ _id: 'c1', overrides: {} }),
    deleteConfig: jest.fn().mockResolvedValue({ _id: 'c1' }),
    toggleConfigActive: jest.fn().mockResolvedValue({ _id: 'c1', isActive: false }),
    mutateConfigWithRevision: jest.fn().mockResolvedValue({
      changed: true,
      config: { _id: 'c1', configVersion: 6, overrides: { cache: true } },
      revision: { id: 'rev-1', status: 'final', configVersion: 5 },
    }),
    listConfigRevisions: jest.fn().mockResolvedValue([]),
    hasConfigCapability: jest.fn().mockResolvedValue(true),
    hasAnyConfigReadAccess: jest.fn().mockResolvedValue(true),
    hasCapability: jest.fn().mockResolvedValue(true),

    getAppConfig: jest.fn().mockResolvedValue({ interface: { modelSelect: true } }),
    ...overrides,
  };
  const handlers = createAdminConfigHandlers(deps);
  return { handlers, deps };
}

describe('createAdminConfigHandlers', () => {
  describe('listConfigs', () => {
    it('redacts secret fields from config list responses', async () => {
      const { handlers } = createHandlers({
        listAllConfigs: jest.fn().mockResolvedValue([
          {
            _id: 'c1',
            principalType: 'role',
            principalId: 'admin',
            overrides: {
              langfuse: {
                publicKey: 'pk-lf-1',
                secretKey: 'v3:encrypted',
                secretKeyPreview: 'sk-lf-...cret',
              },
            },
          },
        ]),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.listConfigs(req, res);

      expect(res.statusCode).toBe(200);
      const configs = res.body!.configs as Array<{
        overrides: { langfuse: Record<string, string> };
      }>;
      expect(configs[0].overrides.langfuse).toEqual({
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...cret',
      });
    });
  });

  describe('getConfig', () => {
    it('returns 403 before DB lookup when user lacks READ_CONFIGS', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasAnyConfigReadAccess: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('returns 404 when config does not exist', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({ params: { principalType: 'role', principalId: 'nonexistent' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(404);
    });

    it('returns config when authorized and exists', async () => {
      const config = {
        _id: 'c1',
        principalType: 'role',
        principalId: 'admin',
        overrides: { x: 1 },
      };
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(config),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.config).toEqual(config);
    });

    it('returns 400 for invalid principalType', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({ params: { principalType: 'invalid', principalId: 'x' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('rejects public principalType — not usable for config overrides', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({ params: { principalType: 'public', principalId: 'x' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('read handlers: section-scoped-only caller (no broad read:configs)', () => {
    function sectionOnlyDeps(section: string, overrides: Record<string, unknown> = {}) {
      return {
        hasConfigCapability: jest.fn(
          async (_user: unknown, s: string | null, verb = 'manage') =>
            verb === 'read' && s === section,
        ),
        hasAnyConfigReadAccess: jest.fn().mockResolvedValue(true),
        ...overrides,
      };
    }

    it('getConfig: returns 200 with only the held section, other sections stripped', async () => {
      const config = {
        _id: 'c1',
        principalType: 'role',
        principalId: 'admin',
        overrides: { memory: { charLimit: 500 }, endpoints: { allowedAddresses: ['10.0.0.1'] } },
        tombstones: ['memory.tokenLimit', 'endpoints.allowedAddresses'],
      };
      const { handlers } = createHandlers(
        sectionOnlyDeps('memory', { findConfigByPrincipal: jest.fn().mockResolvedValue(config) }),
      );
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.config as { overrides: Record<string, unknown>; tombstones: string[] };
      expect(body.overrides.memory).toEqual({ charLimit: 500 });
      expect(body.overrides.endpoints).toBeUndefined();
      expect(body.tombstones).toEqual(['memory.tokenLimit']);
    });

    it('listConfigs: strips non-held sections from every listed config', async () => {
      const configs = [
        { _id: 'c1', principalType: 'role', principalId: 'admin', overrides: { memory: {} } },
        {
          _id: 'c2',
          principalType: 'user',
          principalId: 'u1',
          overrides: { endpoints: {}, memory: { charLimit: 10 } },
        },
      ];
      const { handlers } = createHandlers(
        sectionOnlyDeps('memory', { listAllConfigs: jest.fn().mockResolvedValue(configs) }),
      );
      const req = mockReq();
      const res = mockRes();

      await handlers.listConfigs(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.configs as Array<{ overrides: Record<string, unknown> }>;
      expect(body[0].overrides).toEqual({ memory: {} });
      expect(body[1].overrides).toEqual({ memory: { charLimit: 10 } });
    });

    it('getBaseConfig: strips top-level sections and the nested config field to only the held section', async () => {
      const appConfig = {
        memory: { charLimit: 500 },
        endpoints: { allowedAddresses: ['10.0.0.1'] },
        fileStrategy: 's3',
        config: { memory: { charLimit: 500 }, endpoints: { allowedAddresses: ['10.0.0.1'] } },
        paths: { uploads: '/tmp' },
        availableTools: { foo: {} },
      };
      const { handlers } = createHandlers(
        sectionOnlyDeps('memory', { getAppConfig: jest.fn().mockResolvedValue(appConfig) }),
      );
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.config as Record<string, unknown>;
      expect(body.memory).toEqual({ charLimit: 500 });
      expect(body.endpoints).toBeUndefined();
      expect(body.fileStrategy).toBeUndefined();
      expect((body.config as Record<string, unknown>).memory).toEqual({ charLimit: 500 });
      expect((body.config as Record<string, unknown>).endpoints).toBeUndefined();
      expect(body.paths).toEqual({ uploads: '/tmp' });
      expect(body.availableTools).toBeUndefined();
    });

    it('getBaseConfig: strips dbOverrides sections the caller cannot read, same as the merged config', async () => {
      const findConfigByPrincipal = jest.fn().mockResolvedValue({
        _id: 'c1',
        principalType: 'role',
        principalId: '__base__',
        overrides: { memory: { charLimit: 500 }, endpoints: { allowedAddresses: ['10.0.0.1'] } },
        configVersion: 5,
      });
      const { handlers } = createHandlers(sectionOnlyDeps('memory', { findConfigByPrincipal }));
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const dbOverrides = res.body!.dbOverrides as Record<string, unknown>;
      expect(dbOverrides.memory).toEqual({ charLimit: 500 });
      expect(dbOverrides.endpoints).toBeUndefined();
    });

    it('getBaseConfig: strips availableTools when the caller holds neither of its source sections', async () => {
      const appConfig = {
        memory: { charLimit: 500 },
        filteredTools: ['dalle'],
        includedTools: ['google'],
        availableTools: { google: {} },
        paths: { uploads: '/tmp' },
      };
      const { handlers } = createHandlers(
        sectionOnlyDeps('memory', { getAppConfig: jest.fn().mockResolvedValue(appConfig) }),
      );
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.config as Record<string, unknown>;
      expect(body.availableTools).toBeUndefined();
      expect(body.filteredTools).toBeUndefined();
      expect(body.includedTools).toBeUndefined();
    });

    it.each(['filteredTools', 'includedTools'])(
      'getBaseConfig: returns availableTools to a caller holding read:configs:%s',
      async (section) => {
        const appConfig = {
          filteredTools: ['dalle'],
          includedTools: ['google'],
          availableTools: { google: {} },
          paths: { uploads: '/tmp' },
        };
        const { handlers } = createHandlers(
          sectionOnlyDeps(section, { getAppConfig: jest.fn().mockResolvedValue(appConfig) }),
        );
        const req = mockReq();
        const res = mockRes();

        await handlers.getBaseConfig(req, res);

        expect(res.statusCode).toBe(200);
        const body = res.body!.config as Record<string, unknown>;
        expect(body.availableTools).toEqual({ google: {} });
      },
    );

    it('getBaseConfig: returns fileStrategy only to a caller holding read:configs:fileStrategy', async () => {
      const appConfig = {
        fileStrategy: 's3',
        memory: { charLimit: 500 },
        paths: { uploads: '/tmp' },
        availableTools: {},
      };
      const { handlers } = createHandlers(
        sectionOnlyDeps('fileStrategy', { getAppConfig: jest.fn().mockResolvedValue(appConfig) }),
      );
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.config as Record<string, unknown>;
      expect(body.fileStrategy).toBe('s3');
      expect(body.memory).toBeUndefined();
    });

    it('getBaseConfig: normalizes renamed top-level fields to their canonical section before checking read access', async () => {
      // getAppConfig renames interface -> interfaceConfig, turnstile -> turnstileConfig,
      // and mcpServers -> mcpConfig in the resolved payload. A caller holding
      // read:configs:interface and read:configs:turnstile (but not mcpServers) must
      // still see interfaceConfig/turnstileConfig, since checking the raw field name
      // against a nonexistent "interfaceConfig"/"turnstileConfig" section would wrongly
      // strip them.
      const appConfig = {
        interfaceConfig: { modelSelect: true },
        turnstileConfig: { siteKey: 'abc' },
        mcpConfig: { docs: {} },
        paths: { uploads: '/tmp' },
        availableTools: {},
      };
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn(
          async (_user: unknown, s: string | null, verb = 'manage') =>
            verb === 'read' && (s === 'interface' || s === 'turnstile'),
        ),
        hasAnyConfigReadAccess: jest.fn().mockResolvedValue(true),
        getAppConfig: jest.fn().mockResolvedValue(appConfig),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const body = res.body!.config as Record<string, unknown>;
      expect(body.interfaceConfig).toEqual({ modelSelect: true });
      expect(body.turnstileConfig).toEqual({ siteKey: 'abc' });
      expect(body.mcpConfig).toBeUndefined();
    });
  });

  describe('upsertConfigOverrides', () => {
    it('returns 201 when creating a new config (configVersion === 1)', async () => {
      const { handlers } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { modelSelect: false } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
    });

    it('returns 200 when updating an existing config (configVersion > 1)', async () => {
      const { handlers } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 5 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { modelSelect: false } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
    });

    it('returns 400 when overrides is missing', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {},
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('rejects process-backed MCP servers in database overrides', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'user', principalId: 'u1' },
        body: {
          overrides: {
            mcpServers: {
              injected: { type: 'stdio', command: '/bin/sh', args: ['-c', 'id'] },
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Process-backed MCP servers can only be configured in librechat.yaml',
      });
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('rejects Langfuse header overrides, which cannot be encrypted at rest', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'user', principalId: 'u1' },
        body: {
          overrides: {
            langfuse: { enabled: true, headers: { 'X-Proxy-Token': 'leaked' } },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Langfuse request headers can only be configured in librechat.yaml',
      });
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it.each([
      ['nested dotted key', { langfuse: { 'headers.X-Proxy-Token': 'credential' } }],
      ['root dotted path', { 'langfuse.headers': { 'X-Proxy-Token': 'credential' } }],
      ['root dotted header path', { 'langfuse.headers.X-Proxy-Token': 'credential' }],
    ])('rejects Langfuse headers supplied as a %s', async (_label, overrides) => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.upsertConfigOverrides(
        mockReq({ params: { principalType: 'user', principalId: 'u1' }, body: { overrides } }),
        res,
      );

      /** `overrides` is a Mixed document written wholesale, so a dotted key
       *  persists verbatim and the nested-map redactor never walks it — the
       *  credential would come back in plaintext on the next read. */
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Langfuse request headers can only be configured in librechat.yaml',
      });
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('rejects process-backed MCP servers supplied through the runtime config alias', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'user', principalId: 'u1' },
        body: {
          overrides: {
            mcpConfig: {
              injected: { command: '/bin/sh', args: ['-c', 'id'] },
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('strips permission fields from interface overrides but keeps UI fields', async () => {
      const { handlers, deps } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            interface: { modelSelect: false, prompts: false, agents: { use: false } },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.interface).toEqual({ modelSelect: false });
    });

    it('collapses an explicit schedules disable to the boolean form in overrides', async () => {
      const { handlers, deps } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: { interface: { schedules: { use: false, maxPerUser: 2 } } },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.interface).toEqual({ schedules: false });
    });

    it('preserves skillSync sections in admin overrides', async () => {
      const { handlers, deps } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            skillSync: { github: { enabled: true } },
            interface: { modelSelect: false },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.skillSync).toEqual({ github: { enabled: true } });
      expect(savedOverrides.interface).toEqual({ modelSelect: false });
    });

    it('does not allow tenant-wide Langfuse settings through the generic config API', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            langfuse: {
              enabled: false,
              publicKey: 'pk-role',
            },
            'langfuse.secretKey': 'sk-role',
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'No actionable override sections provided' });
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    // Restoring a stored Langfuse section across a base-config replace is
    // base-principal-only and now only reachable through the atomic endpoint
    // (see config.atomic.spec.ts: "preserves dedicated base-principal
    // sections when resetting to defaults") — this legacy route rejects
    // __base__ before ever reaching that logic.

    it('encrypts custom endpoint API keys on full override writes and redacts responses', async () => {
      const { handlers, deps } = createHandlers({
        upsertConfig: jest.fn(async (_type, _id, _model, overrides) => ({
          _id: 'c1',
          configVersion: 1,
          overrides,
        })),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            endpoints: {
              custom: [
                {
                  name: 'OpenRouter',
                  apiKey: 'sk-or-secret-key',
                  baseURL: 'https://openrouter.ai/api/v1',
                },
                { name: 'EnvRef', apiKey: '${OPENROUTER_KEY}' },
              ],
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      const [saved, envRef] = savedOverrides.endpoints.custom as Array<Record<string, string>>;
      expect(saved.apiKey).toBe('v3:test:sk-or-secret-key');
      expect(saved.apiKeyPreview).toBe('sk-or-...-key');
      expect(envRef.apiKey).toBe('${OPENROUTER_KEY}');
      expect(envRef.apiKeyPreview).toBeUndefined();
      const responseConfig = res.body!.config as {
        overrides: { endpoints: { custom: Array<Record<string, string>> } };
      };
      expect(responseConfig.overrides.endpoints.custom[0].apiKey).toBeUndefined();
      expect(responseConfig.overrides.endpoints.custom[0].apiKeyPreview).toBe('sk-or-...-key');
      expect(responseConfig.overrides.endpoints.custom[1].apiKey).toBe('${OPENROUTER_KEY}');
    });

    it('rejects encrypted custom endpoint API key submissions on full override writes', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            endpoints: {
              custom: [{ name: 'A', apiKey: 'v3:attacker-controlled' }],
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });
    it('preserves UI sub-keys in composite permission fields like mcpServers', async () => {
      const { handlers, deps } = createHandlers({
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            interface: {
              mcpServers: {
                use: true,
                create: false,
                placeholder: 'Search MCP...',
                trustCheckbox: { label: 'Trust' },
              },
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      const mcp = (savedOverrides as Record<string, unknown>).interface as Record<string, unknown>;
      expect((mcp.mcpServers as Record<string, unknown>).placeholder).toBe('Search MCP...');
      expect((mcp.mcpServers as Record<string, unknown>).trustCheckbox).toEqual({ label: 'Trust' });
      expect((mcp.mcpServers as Record<string, unknown>).use).toBeUndefined();
      expect((mcp.mcpServers as Record<string, unknown>).create).toBeUndefined();
    });

    it('strips peoplePicker permission sub-keys in upsert', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            interface: { peoplePicker: { users: false, groups: true, roles: true } },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('returns 200 with message when only permission fields in interface', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { prompts: false, agents: false } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('rejects a whole-overrides replace targeting a stored identity duplicated across two existing entries', async () => {
      // This legacy whole-document route calls the same preserveConfigSecrets
      // machinery as the atomic endpoint and is equally exposed to silently
      // committing a save that strips a survivor's credentials when a
      // pre-existing stored duplicate is reduced to one entry.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 3,
          priority: 0,
          overrides: {
            endpoints: {
              custom: [
                { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-1' },
                { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-2' },
              ],
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            endpoints: { custom: [{ name: 'OpenRouter', baseURL: 'https://new' }] },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toMatch(/Ambiguous existing name in endpoints\.custom/);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });
  });

  describe('deleteConfigField', () => {
    it('reads fieldPath from query parameter', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.modelSelect' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(deps.unsetConfigField).toHaveBeenCalledWith('role', 'admin', 'interface.modelSelect');
    });

    it('allows deleting mcpServers UI sub-key paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.mcpServers.placeholder' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.unsetConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        'interface.mcpServers.placeholder',
      );
    });

    it('blocks deleting mcpServers permission sub-key paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.mcpServers.use' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });

    it('blocks deleting peoplePicker permission sub-key paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.peoplePicker.users' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });

    it('returns 200 no-op for interface permission field path', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.prompts' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });

    it('allows deleting skillSync field paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'skillSync.github.enabled' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.unsetConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        'skillSync.github.enabled',
      );
    });

    it('allows deleting interface UI field paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.modelSelect' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.unsetConfigField).toHaveBeenCalledWith('role', 'admin', 'interface.modelSelect');
    });

    it('ignores tenant-wide Langfuse deletes through the generic config API', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'langfuse.enabled' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'No actionable field path provided' });
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });

    it('rejects deletes of the displayed secret key', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'langfuse.secretKeyPreview' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });

    it('returns 400 when fieldPath query param is missing', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: {},
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body!.error).toContain('query parameter');
    });

    it('rejects unsafe field paths', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: '__proto__.polluted' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('tombstoneConfigField', () => {
    it('writes an explicit tombstone for a valid field path', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'mcpServers.github' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.tombstoneConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        'mcpServers.github',
        undefined,
      );
    });

    it('ignores tenant-wide Langfuse tombstones through the generic config API', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'langfuse.enabled' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'No actionable field path provided' });
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('rejects tombstones of the displayed secret key', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'langfuse.secretKeyPreview' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('blocks interface permission paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'interface.mcpServers.use' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('ignores tombstones for base-only filter policy', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'filters.messages.pii' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('blocks protected ancestor and alias tombstones', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'interface' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();

      const aliasReq = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'interfaceConfig.prompts' },
      });
      const aliasRes = mockRes();
      await handlers.tombstoneConfigField(aliasReq, aliasRes);
      expect(aliasRes.statusCode).toBe(200);
      expect(aliasRes.body!.message).toBeDefined();
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('rejects unsafe field paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: '__proto__.polluted' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });
  });

  describe('patchConfigField', () => {
    it('rejects malformed entries before mutation', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [null] },
      });
      const res = mockRes();
      await handlers.patchConfigField(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toBe('each entry must be an object with fieldPath and value');
      expect(deps.patchConfigFields).not.toHaveBeenCalled();

      const req2 = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'cache' }] },
      });
      const res2 = mockRes();
      await handlers.patchConfigField(req2, res2);
      expect(res2.statusCode).toBe(400);
      expect(res2.body?.error).toBe('each entry must include a value property');
    });

    it('returns 403 when user lacks capability for section', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'registration.enabled', value: false }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('strips interface permission field entries but keeps UI field entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            { fieldPath: 'interface.modelSelect', value: false },
            { fieldPath: 'interface.prompts', value: false },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['interface.modelSelect']).toBe(false);
      expect(patchedFields['interface.prompts']).toBeUndefined();
    });

    /** `use` is both a permission bit and the runtime disable for dual-purpose fields.
     *  Stripping it alone leaves an object, which `getLimits` reads as ENABLED — so an
     *  override meant to stop scheduled billing would start it. */
    it('collapses an explicit schedules disable to the boolean form in patches', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'interface.schedules', value: { use: false, maxPerUser: 2 } }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['interface.schedules']).toBe(false);
    });

    it('keeps a schedules object that only narrows limits', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'interface.schedules', value: { maxPerUser: 2 } }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['interface.schedules']).toEqual({ maxPerUser: 2 });
    });

    it('strips protected ancestor and alias field entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            { fieldPath: 'interface', value: null },
            { fieldPath: 'interfaceConfig.prompts', value: false },
            { fieldPath: 'interface.modelSelect', value: false },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields.interface).toBeUndefined();
      expect(patchedFields['interfaceConfig.prompts']).toBeUndefined();
      expect(patchedFields['interface.modelSelect']).toBe(false);
    });

    it('preserves skillSync field entries in patches', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            { fieldPath: 'skillSync.github.enabled', value: true },
            { fieldPath: 'interface.modelSelect', value: false },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['skillSync.github.enabled']).toBe(true);
      expect(patchedFields['interface.modelSelect']).toBe(false);
    });

    it('rejects process-backed MCP server field patches', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'user', principalId: 'u1' },
        body: {
          entries: [{ fieldPath: 'mcpServers.injected.command', value: '/bin/sh' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Process-backed MCP servers can only be configured in librechat.yaml',
      });
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects Langfuse header field patches, including a single header path', async () => {
      const { handlers, deps } = createHandlers();

      for (const fieldPath of ['langfuse.headers', 'langfuse.headers.X-Proxy-Token']) {
        const res = mockRes();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'user', principalId: 'u1' },
            body: { entries: [{ fieldPath, value: 'leaked' }] },
          }),
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
          error: 'Langfuse request headers can only be configured in librechat.yaml',
        });
      }
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects process-backed MCP field patches through the runtime config alias', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'user', principalId: 'u1' },
        body: {
          entries: [{ fieldPath: 'mcpConfig.injected.command', value: '/bin/sh' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects array-valued Langfuse secret ancestors', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            {
              fieldPath: 'langfuse',
              value: [{ secretKey: 'sk-lf-secret' }],
            },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('does not allow tenant-wide Langfuse patches through the generic config API', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.enabled', value: false }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'No actionable field entries provided' });
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects direct display secret key patch entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKeyPreview', value: 'spoofed' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects encrypted Langfuse secret values on patch entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKey', value: 'v3:attacker-controlled' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects patch entries below protected Langfuse secret paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKey.hidden', value: 'sk-lf-secret' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('rejects patch entries below protected Langfuse secretKeyPreview paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKeyPreview.hidden', value: 'spoofed' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('blocks peoplePicker permission sub-key paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'interface.peoplePicker.users', value: false }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('allows mcpServers UI sub-key paths but blocks permission sub-key paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            { fieldPath: 'interface.mcpServers.placeholder', value: 'Search...' },
            { fieldPath: 'interface.mcpServers.use', value: true },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['interface.mcpServers.placeholder']).toBe('Search...');
      expect(patchedFields['interface.mcpServers.use']).toBeUndefined();
    });

    it('returns 200 with message when all entries are permission fields', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.prompts', value: false }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.message).toBeDefined();
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated even if all entries are permission fields', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.prompts', value: false }] },
        user: undefined,
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when unauthorized even if all entries are permission fields', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.prompts', value: false }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('rejects entries with unsafe field paths (prototype pollution)', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: '__proto__.polluted', value: true }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
    });

    it('rejects a field patch targeting a stored identity duplicated across two existing entries', async () => {
      // This legacy dotted-field-patch route calls the same preservation
      // machinery as the atomic endpoint's fields mode and is equally
      // exposed to silently committing a save that strips a survivor's
      // credentials when a pre-existing stored duplicate is reduced to one.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 3,
          priority: 0,
          overrides: {
            endpoints: {
              custom: [
                { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-1' },
                { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-2' },
              ],
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            {
              fieldPath: 'endpoints.custom',
              value: [{ name: 'OpenRouter', baseURL: 'https://new' }],
            },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toMatch(/Ambiguous existing name in endpoints\.custom/);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });
  });

  describe('patchConfigField: section-scoped priority preservation', () => {
    it('ignores request-supplied priority when caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'memory.context', value: 'updated' }],
          priority: 999,
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.patchConfigFields.mock.calls[0];
      expect(priorityArg).toBeUndefined();
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('omits priority when no existing doc and caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'memory.context', value: 'updated' }],
          priority: 999,
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.patchConfigFields.mock.calls[0];
      expect(priorityArg).toBeUndefined();
    });

    it('honors request-supplied priority when caller holds broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'memory.context', value: 'updated' }],
          priority: 999,
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.patchConfigFields.mock.calls[0];
      expect(priorityArg).toBe(999);
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('preserves priority 0 when broad caller supplies it', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'memory.context', value: 'updated' }],
          priority: 0,
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.patchConfigFields.mock.calls[0];
      expect(priorityArg).toBe(0);
    });

    it('omits priority for section-scoped callers even when existing priority is 0', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'memory.context', value: 'updated' }],
          priority: 999,
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.patchConfigFields.mock.calls[0];
      expect(priorityArg).toBeUndefined();
    });
  });

  describe('tombstoneConfigField: section-scoped priority preservation', () => {
    it('ignores request-supplied priority when caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'memory.context', priority: 999 },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.tombstoneConfigField.mock.calls[0];
      expect(priorityArg).toBeUndefined();
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('omits priority when no existing doc and caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'memory.context', priority: 999 },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.tombstoneConfigField.mock.calls[0];
      expect(priorityArg).toBeUndefined();
    });

    it('honors request-supplied priority when caller holds broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'memory.context', priority: 999 },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.tombstoneConfigField.mock.calls[0];
      expect(priorityArg).toBe(999);
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });
  });

  describe('upsertConfigOverrides — Bug 2 regression', () => {
    it('returns 403 for empty overrides when user lacks MANAGE_CONFIGS', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {} },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('upsertConfigOverrides — empty-overrides scope creation', () => {
    it('creates config document when overrides is empty but priority is provided', async () => {
      const upsertConfig = jest.fn().mockResolvedValue({
        _id: 'c1',
        principalType: 'role',
        principalId: 'admin',
        overrides: {},
        configVersion: 1,
      });
      const { handlers } = createHandlers({ upsertConfig });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('config');
      expect(res.body?.config).toHaveProperty('_id', 'c1');
      expect(upsertConfig).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        {},
        5,
        undefined,
        expect.objectContaining({ expectEmpty: expect.any(Boolean) }),
      );
    });

    it('returns no-op message when overrides is empty and no priority is provided', async () => {
      const upsertConfig = jest.fn().mockResolvedValue(null);
      const { handlers } = createHandlers({ upsertConfig });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {} },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'No actionable override sections provided');
      expect(upsertConfig).not.toHaveBeenCalled();
    });

    it('calls general manage check exactly once when overrides is empty with priority', async () => {
      const hasConfigCapability = jest.fn().mockResolvedValue(true);
      const { handlers } = createHandlers({ hasConfigCapability });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 3 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(hasConfigCapability).toHaveBeenCalledTimes(1);
      expect(hasConfigCapability).toHaveBeenCalledWith(expect.anything(), null, 'manage');
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('config');
    });

    it('returns 403 for empty overrides with priority when user lacks MANAGE_CONFIGS', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('returns 401 for empty overrides with priority when unauthenticated', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
        user: undefined,
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Invariant tests: rules that must hold across ALL handlers ──────

  const MUTATION_HANDLERS: Array<{
    name: string;
    reqOverrides: Record<string, unknown>;
  }> = [
    {
      name: 'upsertConfigOverrides',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { modelSelect: false } } },
      },
    },
    {
      name: 'patchConfigField',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.modelSelect', value: false }] },
      },
    },
    {
      name: 'deleteConfigField',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.modelSelect' },
      },
    },
    {
      name: 'tombstoneConfigField',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'mcpServers.github' },
      },
    },
    {
      name: 'deleteConfigOverrides',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
      },
    },
    {
      name: 'toggleConfig',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        body: { isActive: false },
      },
    },
  ];

  describe('upsertConfigOverrides: scope-lifecycle auth (ASSIGN_CONFIGS)', () => {
    it('allows empty-overrides scope creation when caller has ASSIGN_CONFIGS only', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      expect(deps.upsertConfig).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        {},
        10,
        undefined,
        { expectEmpty: true, preservePriority: true },
      );
    });

    it('requests atomic priority preservation for ASSIGN_CONFIGS-only empty-overrides upsert', async () => {
      const findConfigByPrincipal = jest
        .fn()
        .mockResolvedValue({ _id: 'c1', priority: 7, overrides: {} });
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        findConfigByPrincipal,
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 999 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      expect(deps.upsertConfig).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        {},
        10,
        undefined,
        { expectEmpty: true, preservePriority: true },
      );
      expect(findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('rejects non-empty overrides for ASSIGN_CONFIGS-only caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { memory: { enabled: true } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('rejects empty-overrides scope creation when caller has neither grant', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });
  });

  describe('deleteConfigOverrides: accepts ASSIGN_CONFIGS', () => {
    it('allows delete when caller has ASSIGN_CONFIGS only', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.deleteConfig).toHaveBeenCalled();
    });

    it('rejects delete when caller has neither broad manage nor ASSIGN_CONFIGS', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.deleteConfig).not.toHaveBeenCalled();
    });
  });

  describe('toggleConfig: accepts ASSIGN_CONFIGS', () => {
    it('allows toggle when caller has ASSIGN_CONFIGS only', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.toggleConfigActive).toHaveBeenCalled();
    });

    it('rejects toggle when caller has neither broad manage nor ASSIGN_CONFIGS', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.toggleConfigActive).not.toHaveBeenCalled();
    });
  });

  describe('scope-lifecycle: parameterized assign:configs check', () => {
    it('allows upsert when caller holds assign:configs:<principalType>', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn(async (_user, cap) => cap === 'assign:configs:role'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      expect(deps.upsertConfig).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        {},
        10,
        undefined,
        { expectEmpty: true, preservePriority: true },
      );
    });

    it('rejects upsert when parameterized grant targets a different principalType', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn(async (_user, cap) => cap === 'assign:configs:user'),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('queries hasCapability with the principalType-parameterized form', async () => {
      const hasCap = jest.fn().mockResolvedValue(true);
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: hasCap,
      });
      const req = mockReq({
        params: { principalType: 'group', principalId: 'engineers' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      const queriedCapabilities = hasCap.mock.calls.map((call) => call[1]);
      expect(queriedCapabilities).toContain('assign:configs:group');
    });
  });

  describe('invariant: __base__ is rejected on every legacy mutation route, regardless of permissions', () => {
    // Legacy PUT/PATCH/DELETE routes never carry expectedVersion and never
    // write a revision. Base-config mutations must go through POST .../atomic
    // — the only path with CAS and revision history — so these routes reject
    // __base__ unconditionally, even for a broad-manage caller.

    it('upsert against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('delete against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
      });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.deleteConfig).not.toHaveBeenCalled();
    });

    it('toggle against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.toggleConfigActive).not.toHaveBeenCalled();
    });

    it('patch against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { entries: [{ fieldPath: 'memory.context', value: 'updated' }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('tombstone against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { fieldPath: 'memory.context' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.tombstoneConfigField).not.toHaveBeenCalled();
    });

    it('field delete against __base__ is rejected for a broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        query: { fieldPath: 'memory.context' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(409);
      expect(res.body?.error).toMatch(/\/atomic/);
      expect(deps.unsetConfigField).not.toHaveBeenCalled();
    });
  });

  describe('scope-lifecycle: atomic empty-state guard for assign-only callers', () => {
    it('empty-overrides upsert is rejected when atomic filter mismatches (existing doc not empty)', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        upsertConfig: jest.fn(async (_pt, _pi, _pm, _o, _p, _session, opts) => {
          return opts?.expectEmpty ? null : { _id: 'c1', configVersion: 1 };
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        { expectEmpty: true, preservePriority: true },
      );
    });

    it('delete is rejected with 403 when atomic filter mismatches and doc still exists', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        deleteConfig: jest.fn(async (_pt, _pi, _session, opts) => {
          return opts?.expectEmpty ? null : { _id: 'c1' };
        }),
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          _id: 'c1',
          overrides: { endpoints: { custom: true } },
        }),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.deleteConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { expectEmpty: true },
      );
    });

    it('toggle is rejected with 403 when atomic filter mismatches and doc still exists', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        toggleConfigActive: jest.fn(async (_pt, _pi, _isActive, _session, opts) => {
          return opts?.expectEmpty ? null : { _id: 'c1', isActive: false };
        }),
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          _id: 'c1',
          tombstones: ['endpoints.openai.apiKey'],
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.toggleConfigActive).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        { expectEmpty: true },
      );
    });

    it('delete returns 404 when atomic filter mismatches and doc does not exist', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        deleteConfig: jest.fn().mockResolvedValue(null),
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(404);
      expect(deps.findConfigByPrincipal).toHaveBeenCalled();
    });

    it('delete succeeds for assign-only caller when atomic filter matches', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
        deleteConfig: jest.fn().mockResolvedValue({ _id: 'c1', overrides: {} }),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.deleteConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { expectEmpty: true },
      );
    });

    it('broad-manage caller calls destructive op without expectEmpty option', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
        deleteConfig: jest.fn().mockResolvedValue({
          _id: 'c1',
          overrides: { endpoints: { custom: true } },
        }),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: 'admin' } });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.deleteConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
        { expectEmpty: false },
      );
    });
  });

  describe('AdminConfigDeps.hasCapability is optional', () => {
    it('factory accepts deps without hasCapability and falls back to broad-manage-only auth', async () => {
      const deps = {
        listAllConfigs: jest.fn().mockResolvedValue([]),
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 1 }),
        patchConfigFields: jest.fn(),
        tombstoneConfigField: jest.fn(),
        unsetConfigField: jest.fn(),
        deleteConfig: jest.fn().mockResolvedValue({ _id: 'c1' }),
        toggleConfigActive: jest.fn().mockResolvedValue({ _id: 'c1', isActive: false }),
        mutateConfigWithRevision: jest
          .fn()
          .mockResolvedValue({ config: null, revision: { id: 'rev1' } }),
        listConfigRevisions: jest.fn().mockResolvedValue([]),
        hasConfigCapability: jest.fn().mockResolvedValue(false),
      };
      const handlers = createAdminConfigHandlers(deps);
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });
  });

  describe('invariant: all mutation handlers return 401 without auth', () => {
    for (const { name, reqOverrides } of MUTATION_HANDLERS) {
      it(`${name} returns 401 when user is missing`, async () => {
        const { handlers } = createHandlers();
        const req = mockReq({ ...reqOverrides, user: undefined });
        const res = mockRes();

        await (handlers as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](
          req,
          res,
        );

        expect(res.statusCode).toBe(401);
      });
    }
  });

  describe('invariant: all mutation handlers return 403 without capability', () => {
    for (const { name, reqOverrides } of MUTATION_HANDLERS) {
      it(`${name} returns 403 when user lacks capability`, async () => {
        const { handlers } = createHandlers({
          hasConfigCapability: jest.fn().mockResolvedValue(false),
          hasCapability: jest.fn().mockResolvedValue(false),
        });
        const req = mockReq(reqOverrides);
        const res = mockRes();

        await (handlers as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](
          req,
          res,
        );

        expect(res.statusCode).toBe(403);
      });
    }
  });

  describe('invariant: all read handlers return 403 without capability', () => {
    const READ_HANDLERS: Array<{ name: string; reqOverrides: Record<string, unknown> }> = [
      { name: 'listConfigs', reqOverrides: {} },
      { name: 'getBaseConfig', reqOverrides: {} },
      {
        name: 'getConfig',
        reqOverrides: { params: { principalType: 'role', principalId: 'admin' } },
      },
    ];

    for (const { name, reqOverrides } of READ_HANDLERS) {
      it(`${name} returns 403 when user lacks capability`, async () => {
        const { handlers } = createHandlers({
          hasConfigCapability: jest.fn().mockResolvedValue(false),
          hasAnyConfigReadAccess: jest.fn().mockResolvedValue(false),
        });
        const req = mockReq(reqOverrides);
        const res = mockRes();

        await (handlers as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](
          req,
          res,
        );

        expect(res.statusCode).toBe(403);
      });
    }
  });

  describe('invariant: all read handlers return 401 without auth', () => {
    const READ_HANDLERS: Array<{ name: string; reqOverrides: Record<string, unknown> }> = [
      { name: 'listConfigs', reqOverrides: {} },
      { name: 'getBaseConfig', reqOverrides: {} },
      {
        name: 'getConfig',
        reqOverrides: { params: { principalType: 'role', principalId: 'admin' } },
      },
    ];

    for (const { name, reqOverrides } of READ_HANDLERS) {
      it(`${name} returns 401 when user is missing`, async () => {
        const { handlers } = createHandlers();
        const req = mockReq({ ...reqOverrides, user: undefined });
        const res = mockRes();

        await (handlers as Record<string, (...args: unknown[]) => Promise<unknown>>)[name](
          req,
          res,
        );

        expect(res.statusCode).toBe(401);
      });
    }
  });

  describe('listConfigRevisions', () => {
    it('lists only the effective request tenant through the data layer', async () => {
      const listConfigRevisions = jest.fn().mockResolvedValue([
        {
          id: 'rev-b',
          createdAt: '2026-09-04T00:00:00.000Z',
          cause: 'save',
          actorId: 'admin-b',
        },
      ]);
      const { handlers } = createHandlers({ listConfigRevisions });
      const req = mockReq({
        tenantId: 'tenant-b',
        user: { id: 'u1', role: 'ADMIN', tenantId: 'tenant-a' },
        params: { principalType: 'role', principalId: '__base__' },
      });
      const res = mockRes();

      await handlers.listConfigRevisions(req, res);

      expect(res.statusCode).toBe(200);
      expect(listConfigRevisions).toHaveBeenCalledWith({
        principalType: 'role',
        principalId: '__base__',
        tenantId: 'tenant-b',
      });
      expect(res.body).toMatchObject({
        effectiveTenantId: 'tenant-b',
        revisions: [{ id: 'rev-b' }],
      });
    });

    it('requires broad config-management access before reading history', async () => {
      const listConfigRevisions = jest.fn().mockResolvedValue([]);
      const { handlers } = createHandlers({
        listConfigRevisions,
        hasCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({ params: { principalType: 'role', principalId: '__base__' } });
      const res = mockRes();

      await handlers.listConfigRevisions(req, res);

      expect(res.statusCode).toBe(403);
      expect(listConfigRevisions).not.toHaveBeenCalled();
    });

    it('rejects revision history for non-base principals', async () => {
      const listConfigRevisions = jest.fn().mockResolvedValue([]);
      const { handlers } = createHandlers({ listConfigRevisions });
      const req = mockReq({ params: { principalType: 'role', principalId: 'ADMIN' } });
      const res = mockRes();

      await handlers.listConfigRevisions(req, res);

      expect(res.statusCode).toBe(400);
      expect(listConfigRevisions).not.toHaveBeenCalled();
    });
  });

  describe('getBaseConfig', () => {
    it('returns 403 when user lacks READ_CONFIGS', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasAnyConfigReadAccess: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(403);
    });

    it('returns the full AppConfig', async () => {
      const { handlers } = createHandlers();
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.config).toEqual({ interface: { modelSelect: true } });
    });

    it('redacts Langfuse secrets from top-level and raw nested base config', async () => {
      const { handlers } = createHandlers({
        getAppConfig: jest.fn().mockResolvedValue({
          langfuse: {
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            secretKeyPreview: 'sk-lf-...cret',
          },
          config: {
            langfuse: {
              publicKey: 'pk-lf-1',
              secretKey: 'sk-lf-raw-secret',
              secretKeyPreview: 'sk-lf-...cret',
            },
          },
        }),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      const responseConfig = res.body!.config as {
        langfuse: Record<string, string>;
        config: { langfuse: Record<string, string> };
      };
      expect(responseConfig.langfuse).toEqual({
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...cret',
      });
      expect(responseConfig.config.langfuse).toEqual({
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf-...cret',
      });
    });

    it('redacts plaintext and encrypted MCP secrets from the resolved mcpConfig alias', async () => {
      const { handlers } = createHandlers({
        getAppConfig: jest.fn().mockResolvedValue({
          mcpConfig: {
            yamlServer: {
              url: 'https://yaml.example.com/mcp',
              oauth: {
                token_url: 'https://yaml.example.com/oauth/token',
                client_secret: 'yaml-client-secret',
              },
              headers: { Authorization: 'Bearer yaml-token' },
            },
            storedServer: {
              url: 'https://stored.example.com/mcp',
              apiKey: { authorization_type: 'Bearer', key: 'v3:test:stored-api-key' },
              oauth_headers: { 'X-OAuth-Token': 'v3:test:stored-oauth-token' },
            },
          },
        }),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.config).toEqual({
        mcpConfig: {
          yamlServer: {
            url: 'https://yaml.example.com/mcp',
            oauth: { token_url: 'https://yaml.example.com/oauth/token' },
            headers: {},
          },
          storedServer: {
            url: 'https://stored.example.com/mcp',
            apiKey: { authorization_type: 'Bearer' },
            oauth_headers: {},
          },
        },
      });
    });

    it('forwards baseOnly=true to getAppConfig when query param is the literal string "true"', async () => {
      const getAppConfig = jest.fn().mockResolvedValue({ interface: { modelSelect: true } });
      const { handlers } = createHandlers({ getAppConfig });
      const req = mockReq({ query: { baseOnly: 'true' } });
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(getAppConfig).toHaveBeenCalledWith(expect.objectContaining({ baseOnly: true }));
    });

    it('forwards baseOnly=false when the query param is missing, non-"true", or an array', async () => {
      const cases: Array<Record<string, unknown>> = [
        {},
        { baseOnly: 'false' },
        { baseOnly: '1' },
        { baseOnly: ['true'] },
        { baseOnly: ['true', 'true'] },
        { baseOnly: { nested: 'true' } },
      ];

      for (const query of cases) {
        const getAppConfig = jest.fn().mockResolvedValue({ interface: { modelSelect: true } });
        const { handlers } = createHandlers({ getAppConfig });
        const req = mockReq({ query });
        const res = mockRes();

        await handlers.getBaseConfig(req, res);

        expect(res.statusCode).toBe(200);
        expect(getAppConfig).toHaveBeenCalledWith(expect.objectContaining({ baseOnly: false }));
      }
    });

    it('returns dbOverrides/dbConfigVersion from the raw base document alongside the merged config', async () => {
      const findConfigByPrincipal = jest.fn().mockResolvedValue({
        _id: 'c1',
        principalType: 'role',
        principalId: '__base__',
        overrides: { cache: true },
        configVersion: 5,
      });
      const { handlers, deps } = createHandlers({ findConfigByPrincipal });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.dbOverrides).toEqual({ cache: true });
      expect(res.body!.dbConfigVersion).toBe(5);
      expect(res.body!.dbIsActive).toBe(true);
      expect(findConfigByPrincipal).toHaveBeenCalledWith(
        'role',
        '__base__',
        expect.objectContaining({ includeInactive: true, tenantId: '' }),
      );
      expect(deps.getAppConfig).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '' }));
    });

    it('reports a null dbConfigVersion and no dbOverrides when no base document exists yet', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
      });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body!.dbConfigVersion).toBeNull();
      expect(res.body!.dbIsActive).toBeNull();
      expect(res.body!.dbOverrides).toBeUndefined();
    });

    it('omits dbOverrides/dbConfigVersion and skips the raw document read entirely when baseOnly', async () => {
      const findConfigByPrincipal = jest.fn().mockResolvedValue({
        _id: 'c1',
        overrides: { cache: true },
        configVersion: 5,
      });
      const { handlers } = createHandlers({ findConfigByPrincipal });
      const req = mockReq({ query: { baseOnly: 'true' } });
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).not.toHaveProperty('dbOverrides');
      expect(res.body).not.toHaveProperty('dbConfigVersion');
      expect(res.body).not.toHaveProperty('dbIsActive');
      expect(findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('bypasses the app-config cache when not baseOnly, but not when baseOnly', async () => {
      const getAppConfig = jest.fn().mockResolvedValue({ interface: { modelSelect: true } });
      const { handlers } = createHandlers({ getAppConfig });

      await handlers.getBaseConfig(mockReq(), mockRes());
      expect(getAppConfig).toHaveBeenLastCalledWith(expect.objectContaining({ refresh: true }));

      await handlers.getBaseConfig(mockReq({ query: { baseOnly: 'true' } }), mockRes());
      expect(getAppConfig).toHaveBeenLastCalledWith(expect.objectContaining({ refresh: false }));
    });

    it('fails closed instead of silently falling back to a YAML-only merge on error', async () => {
      const getAppConfig = jest.fn().mockRejectedValue(new Error('mongo blip'));
      const { handlers } = createHandlers({ getAppConfig });
      const req = mockReq();
      const res = mockRes();

      await handlers.getBaseConfig(req, res);

      expect(res.statusCode).toBe(500);
      expect(getAppConfig).toHaveBeenCalledWith(expect.objectContaining({ failClosed: true }));
    });
  });
});

describe('mutateConfigAtomic', () => {
  it('requires expectedVersion', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: { entries: [{ fieldPath: 'cache', value: true }], cause: 'save' },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('requires expectedTenantId before database access', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        expectedTenantId: undefined,
        entries: [{ fieldPath: 'cache', value: true }],
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('expectedTenantId is required');
    expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects a stale tenant fence before database access', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      user: { id: 'u1', role: 'ADMIN', tenantId: 'tenant-b' },
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        expectedTenantId: 'tenant-a',
        entries: [{ fieldPath: 'cache', value: true }],
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'Tenant context changed',
      expectedTenantId: 'tenant-a',
      currentTenantId: 'tenant-b',
    });
    expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('reactivates the base config through the atomic CAS/revision path', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        ...versionedBaseConfig(4),
        isActive: false,
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: { expectedVersion: 4, isActive: true },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 4,
        cause: 'save',
        op: { kind: 'active', isActive: true },
      }),
    );
  });

  it('rejects a non-object request body', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: 'not-an-object',
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('request body must be a JSON object');
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects malformed entries before mutation', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [null],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('each entry must be an object with fieldPath and value');
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects malformed resetPaths before mutation', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'cache', value: true }],
        resetPaths: 'cache',
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('resetPaths must be an array');
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects malformed operation properties before mode detection', async () => {
    const { handlers, deps } = createHandlers();
    const cases = [
      {
        body: {
          expectedVersion: 0,
          entries: [{ fieldPath: 'cache', value: true }],
          overrides: 'invalid',
        },
        error: 'overrides must be an object',
      },
      {
        body: {
          expectedVersion: 0,
          entries: [{ fieldPath: 'cache', value: true }],
          deleteDocument: 'true',
        },
        error: 'deleteDocument must be a boolean',
      },
      {
        body: {
          expectedVersion: 0,
          entries: [{ fieldPath: 'cache', value: true }],
          restoreRevisionId: 123,
        },
        error: 'restoreRevisionId must be a non-empty string',
      },
    ] as const;

    for (const testCase of cases) {
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: testCase.body,
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toBe(testCase.error);
    }

    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('returns 404 when the restore revision is missing', async () => {
    const { handlers, deps } = createHandlers({
      mutateConfigWithRevision: jest.fn().mockRejectedValue(
        Object.assign(new Error('Revision not found'), {
          name: 'ConfigRevisionNotFoundError',
          revisionId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        restoreRevisionId: '11111111-1111-4111-8111-111111111111',
        cause: 'restore',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Revision not found' });
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledTimes(1);
  });

  it('rejects field entries without an explicit value property', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'cache' }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('each entry must include a value property');
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('accepts falsy entry values instead of dropping them', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [
          { fieldPath: 'cache', value: false },
          { fieldPath: 'secureImageLinks', value: false },
        ],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: { cache: false, secureImageLinks: false },
        }),
      }),
    );
  });

  it('rejects an entry value that fails librechat.yaml schema validation', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'interface.schedules.maxPerUser', value: -1 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/maxPerUser/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects unknown entry and reset paths before reading or writing configuration', async () => {
    const { handlers, deps } = createHandlers();

    for (const body of [
      {
        expectedVersion: 0,
        entries: [{ fieldPath: 'definitelyUnknownAdminConfigKey.value', value: true }],
        cause: 'save',
      },
      {
        expectedVersion: 0,
        resetPaths: ['interface.definitelyUnknownAdminConfigKey'],
        cause: 'reset',
      },
    ]) {
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body,
      });
      const res = mockRes();

      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toMatch(/Unknown config field path/);
    }

    expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('accepts a field patch inside a discriminated-union config object', async () => {
    const existing = {
      ...versionedBaseConfig(0),
      overrides: {
        summarization: {
          trigger: { type: 'token_ratio', value: 0.5 },
        },
      },
    };
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(existing),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'summarization.trigger.value', value: 0.75 }],
        cause: 'save',
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: { 'summarization.trigger.value': 0.75 },
        }),
      }),
    );
  });

  it('rejects replace-mode overrides that fail librechat.yaml schema validation', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        overrides: { interface: { schedules: { maxPerUser: -1 } } },
        cause: 'import',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/maxPerUser/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects unknown root and nested keys in replace mode', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });

    for (const overrides of [
      { definitelyUnknownAdminConfigKey: { enabled: true } },
      { interface: { definitelyUnknownAdminConfigKey: true } },
    ]) {
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { expectedVersion: 0, overrides, cause: 'import' },
      });
      const res = mockRes();

      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toMatch(/Invalid config overrides|Unknown config field path/);
    }

    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('returns 409 before validating replace mode against a newer document', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 6,
        priority: 0,
        overrides: {},
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        overrides: { interface: { schedules: { maxPerUser: -1 } } },
        cause: 'import',
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 6 });
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('returns 409 before validating field values against a newer document', async () => {
    const getAppConfig = jest.fn();
    const { handlers, deps } = createHandlers({
      getAppConfig,
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 6,
        priority: 0,
        overrides: {},
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'interface.schedules.maxPerUser', value: -1 }],
        cause: 'save',
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 6 });
    expect(getAppConfig).not.toHaveBeenCalled();
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('accepts a schema-valid entry value at the same path a negative value would reject', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'interface.schedules.maxPerUser', value: 3 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: { 'interface.schedules.maxPerUser': 3 },
        }),
      }),
    );
  });

  it('validates a sparse field patch against the resolved section, not DB overrides alone', async () => {
    // cloudfront.domain is required by the schema whenever cloudfront is
    // present, but it has never been set as a DB override — only YAML
    // provides it. A patch touching just urlExpiry must resolve against the
    // YAML baseline too, or this fails purely because the DB has no
    // standalone `domain` override.
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        cloudfront: { domain: 'https://cdn.example.com', urlExpiry: 3600 },
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: { 'cloudfront.urlExpiry': 7200 },
        }),
      }),
    );
  });

  it('still rejects an invalid sparse patch even once the YAML baseline fills in required siblings', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        cloudfront: { domain: 'https://cdn.example.com', urlExpiry: 3600 },
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'cloudfront.urlExpiry', value: -5 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/urlExpiry/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('reveals the YAML value again when resetting a DB-overridden sibling required by the section', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        cloudfront: { domain: 'https://cdn.example.com', urlExpiry: 3600 },
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        overrides: { cloudfront: { domain: 'https://old-cdn.example.com', cookieExpiry: 900 } },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        resetPaths: ['cloudfront.domain'],
        entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    // Resetting the DB's cloudfront.domain override falls back to YAML's
    // domain, which still satisfies the required field — must not reject.
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalled();
  });

  it('rejects a descendant patch when a same-request whole-section reset deletes a DB field required for it', async () => {
    // resetPaths: ['cloudfront'] deletes the ENTIRE DB cloudfront override
    // before urlExpiry is applied — the old DB domain the mutation is about
    // to erase must not be used to satisfy the schema's required domain.
    // YAML itself has no cloudfront section at all here, so the resolved
    // post-mutation state is just `{ urlExpiry: 7200 }`, missing domain.
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({}),
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        overrides: { cloudfront: { domain: 'https://old-cdn.example.com', cookieExpiry: 900 } },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        resetPaths: ['cloudfront'],
        entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe(
      'resetPaths and entries must not overlap: cloudfront and cloudfront.urlExpiry',
    );
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects a descendant patch after a same-request whole-section reset even when YAML satisfies the section', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({
        cloudfront: { domain: 'https://cdn.example.com', urlExpiry: 3600 },
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        overrides: { cloudfront: { domain: 'https://old-cdn.example.com', cookieExpiry: 900 } },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        resetPaths: ['cloudfront'],
        entries: [{ fieldPath: 'cloudfront.urlExpiry', value: 7200 }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe(
      'resetPaths and entries must not overlap: cloudfront and cloudfront.urlExpiry',
    );
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects overlapping field entries when the ancestor appears first', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({}),
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        overrides: {
          cloudfront: {
            domain: 'https://cdn.example.com',
            imageSigning: 'cookies',
            cookieDomain: '.example.com',
            requireSignedAccess: true,
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        entries: [
          {
            fieldPath: 'cloudfront',
            value: { domain: 'https://cdn.example.com', imageSigning: 'none' },
          },
          { fieldPath: 'cloudfront.requireSignedAccess', value: true },
        ],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe(
      'Overlapping fieldPath entries are not allowed: cloudfront and cloudfront.requireSignedAccess',
    );
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects overlapping field entries when the descendant appears first', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({}),
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [
          { fieldPath: 'cloudfront.cookieDomain', value: '.example.com' },
          {
            fieldPath: 'cloudfront',
            value: {
              domain: 'https://cdn.example.com',
              imageSigning: 'cookies',
              requireSignedAccess: true,
            },
          },
        ],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe(
      'Overlapping fieldPath entries are not allowed: cloudfront.cookieDomain and cloudfront',
    );
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects a same-request reset covered by an ancestor field entry', async () => {
    const { handlers, deps } = createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({}),
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        overrides: {
          cloudfront: { domain: 'https://old-cdn.example.com', cookieExpiry: 900 },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        resetPaths: ['cloudfront.cookieExpiry'],
        entries: [
          { fieldPath: 'cloudfront', value: { domain: 'https://cdn.example.com', urlExpiry: -5 } },
        ],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe(
      'resetPaths and entries must not overlap: cloudfront.cookieExpiry and cloudfront',
    );
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'scalar secret',
      resetPath: 'ocr.apiKey',
      fieldPath: 'ocr',
      value: { strategy: 'azure' },
    },
    {
      label: 'record secret container',
      resetPath: 'endpoints.openAI.headers',
      fieldPath: 'endpoints.openAI',
      value: { models: { default: ['gpt-4o'] } },
    },
    {
      label: 'array secret container',
      resetPath: 'endpoints.custom',
      fieldPath: 'endpoints.custom',
      value: [],
    },
    {
      label: 'MCP secret container',
      resetPath: 'mcpServers.Jira.oauth',
      fieldPath: 'mcpServers.Jira',
      value: { url: 'https://mcp.example.com/jira' },
    },
  ])(
    'rejects overlapping reset/patch input for a $label',
    async ({ resetPath, fieldPath, value }) => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(3)),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 3,
          resetPaths: [resetPath],
          entries: [{ fieldPath, value }],
          cause: 'save',
        },
      });
      const res = mockRes();

      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body?.error).toBe(
        `resetPaths and entries must not overlap: ${resetPath} and ${fieldPath}`,
      );
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    },
  );

  it('preserves an existing encrypted custom-endpoint apiKey when the submitted array entry omits it', async () => {
    // The panel must never resend the stored ciphertext (the API rejects
    // submitted encrypted values) — it omits apiKey/apiKeyPreview entirely
    // for an unchanged entry instead, and this atomic write has to restore
    // them from the existing document by the entry's stable name identity,
    // the same way the legacy patch endpoint already does.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                apiKey: 'v3:test:sk-or-secret-key',
                apiKeyPreview: 'sk-or-...-key',
                baseURL: 'https://openrouter.ai/api/v1',
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v2' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'endpoints.custom': [
              {
                name: 'OpenRouter',
                baseURL: 'https://openrouter.ai/api/v2',
                apiKey: 'v3:test:sk-or-secret-key',
                apiKeyPreview: 'sk-or-...-key',
              },
            ],
          },
        }),
      }),
    );
  });

  it('restores existing encrypted custom-endpoint headers by entry identity when only an unrelated property (baseURL) changes', async () => {
    // Companion to the apiKey case above, for a record-secret container
    // nested inside the same array entry: the panel's redacted read leaves
    // `headers` present as `{}` rather than omitted, and ObjectEntryCard.tsx
    // now drops it from what it submits whenever it is still plain-object
    // shaped (never touched via its KeyValueField) — so editing only
    // baseURL must resubmit the entry with headers omitted, and this atomic
    // write has to restore the real ciphertext by the entry's stable name
    // identity, the same way the apiKey scalar already does.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                baseURL: 'https://openrouter.ai/api/v1',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v2' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'endpoints.custom': [
              {
                name: 'OpenRouter',
                baseURL: 'https://openrouter.ai/api/v2',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        }),
      }),
    );
  });

  it('deletes only the header explicitly removed from a partial headers map, keeping the rest by entry identity', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                headers: {
                  Authorization: 'v3:test:old-token',
                  'X-Custom': 'v3:test:old-custom-value',
                },
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', headers: { Authorization: 'Bearer new-token' } }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const entry = call.op.fields['endpoints.custom'][0];
    expect(entry.headers.Authorization).toMatch(/^v3:/);
    expect(entry.headers['X-Custom']).toBeUndefined();
    expect(Object.keys(entry.headers)).toEqual(['Authorization']);
  });

  it('leaves a deliberately emptied headers map alone, never restoring stale ciphertext onto it', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', headers: {} }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'endpoints.custom': [{ name: 'OpenRouter', headers: {} }],
          },
        }),
      }),
    );
  });

  it("restores a custom endpoint's encrypted apiKey and headers by __previousIdentity when its name is renamed", async () => {
    // Renaming is a plain field edit on `name`, which also doubles as the
    // preservation identity key. Without the panel's __previousIdentity hint,
    // the renamed entry has no existing entry to match against by identity
    // and silently loses its credentials — this proves the hint closes that
    // gap through the real mutateConfigAtomic handler, not just the unit.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                apiKey: 'v3:test:sk-or-secret-key',
                apiKeyPreview: 'sk-or-...-key',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter EU', __previousIdentity: 'OpenRouter' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'endpoints.custom': [
              {
                name: 'OpenRouter EU',
                apiKey: 'v3:test:sk-or-secret-key',
                apiKeyPreview: 'sk-or-...-key',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        }),
      }),
    );
  });

  it("restores an Azure OpenAI group's encrypted apiKey and additionalHeaders by __previousIdentity when its group is renamed", async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 4,
        priority: 0,
        overrides: {
          endpoints: {
            azureOpenAI: {
              groups: [
                {
                  group: 'prod',
                  apiKey: 'v3:test:sk-azure-secret',
                  apiKeyPreview: 'sk-azu...cret',
                  additionalHeaders: { 'X-Region': 'v3:test:us-east' },
                },
              ],
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 4,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.azureOpenAI.groups',
            value: [{ group: 'prod-eu', models: { 'gpt-4': true }, __previousIdentity: 'prod' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'endpoints.azureOpenAI.groups': [
              {
                group: 'prod-eu',
                models: { 'gpt-4': true },
                apiKey: 'v3:test:sk-azure-secret',
                apiKeyPreview: 'sk-azu...cret',
                additionalHeaders: { 'X-Region': 'v3:test:us-east' },
              },
            ],
          },
        }),
      }),
    );
  });

  it('encrypts a plaintext group apiKey submitted via the endpoints.azureOpenAI ancestor patch', async () => {
    // endpoints.azureOpenAI is an ancestor of the array-secret path
    // endpoints.azureOpenAI.groups but carries no scalar secret field of its
    // own — a patch scoped to this exact ancestor previously bypassed both
    // encryption and preservation, persisting apiKey as plaintext.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 2,
        priority: 0,
        overrides: {},
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 2,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.azureOpenAI',
            value: {
              groups: [{ group: 'prod', models: { 'gpt-4': true }, apiKey: 'sk-plaintext-secret' }],
            },
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const patched = call.op.fields['endpoints.azureOpenAI'];
    expect(patched.groups[0].apiKey).toMatch(/^v3:test:/);
    expect(patched.groups[0].apiKey).not.toBe('sk-plaintext-secret');
  });

  it("does not resurrect a deleted entry's credentials onto a brand-new entry reusing its freed name", async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              {
                name: 'OpenRouter',
                apiKey: 'v3:test:sk-or-secret-key',
                headers: { Authorization: 'v3:test:gateway-token' },
              },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            // The panel deleted the old OpenRouter and created a brand-new
            // endpoint that happens to reuse the same name, stamping the
            // explicit __previousIdentity: null marker at creation.
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', __previousIdentity: null }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const entry = call.op.fields['endpoints.custom'][0];
    expect(entry.apiKey).toBeUndefined();
    expect(entry.headers).toBeUndefined();
    expect(entry).not.toHaveProperty('__previousIdentity');
  });

  it("strips __previousIdentity on a brand-new config document's first save, and does not strand credentials on the next save", async () => {
    // findConfigByPrincipal resolving to null (no document has ever been
    // saved for this principal) previously short-circuited
    // preserveConfigSecrets before preserveArraySecrets could strip the
    // hint, letting it persist verbatim. Reproduces the full lifecycle: a
    // first save creating a new endpoint, then a second, unrelated edit
    // submitting the entry exactly as a redacted read would have returned
    // it (real apiKey omitted, whatever survived redaction resubmitted
    // as-is) — the second save must still find and restore the apiKey the
    // first save encrypted.
    const firstSave = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    });
    const firstReq = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: null,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', apiKey: 'sk-gateway-key', __previousIdentity: null }],
          },
        ],
      },
    });
    const firstRes = mockRes();
    await firstSave.handlers.mutateConfigAtomic(firstReq, firstRes);

    expect(firstRes.statusCode).toBe(200);
    const firstEntry =
      firstSave.deps.mutateConfigWithRevision.mock.calls[0][0].op.fields['endpoints.custom'][0];
    expect(firstEntry).not.toHaveProperty('__previousIdentity');
    expect(firstEntry.apiKey).toMatch(/^v3:/);

    // Second save: the stored document now exists and holds exactly what the
    // first save persisted. The panel submits an unrelated edit (baseURL
    // only) with the entry shaped as a redacted read would return it.
    const secondSave = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 1,
        priority: 0,
        overrides: { endpoints: { custom: [firstEntry] } },
      }),
    });
    const secondReq = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 1,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', baseURL: 'https://new' }],
          },
        ],
      },
    });
    const secondRes = mockRes();
    await secondSave.handlers.mutateConfigAtomic(secondReq, secondRes);

    expect(secondRes.statusCode).toBe(200);
    const secondEntry =
      secondSave.deps.mutateConfigWithRevision.mock.calls[0][0].op.fields['endpoints.custom'][0];
    expect(secondEntry.apiKey).toBe(firstEntry.apiKey);
    expect(secondEntry.baseURL).toBe('https://new');
  });

  it('rejects the mutation with a 400 when a submission targets a stored identity duplicated across two existing entries', async () => {
    // The stored duplicate predates unique-identity enforcement. Deleting
    // one of the two ambiguous "OpenRouter" entries and leaving the other
    // untouched would otherwise succeed while silently restoring nothing —
    // no way to tell which of the two credentials the survivor should keep.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-1' },
              { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-2' },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter', baseURL: 'https://new' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/Ambiguous existing name in endpoints\.custom/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('allows deleting every entry sharing a duplicated stored identity', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-1' },
              { name: 'OpenRouter', apiKey: 'v3:test:sk-secret-2' },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [{ fieldPath: 'endpoints.custom', value: [] }],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalled();
  });

  it('rejects the mutation with a 400 when the panel submits two custom endpoints with the same name', async () => {
    // Duplicate identities are unrecoverable ambiguity for credential
    // preservation (preserveArraySecrets fails closed and restores nothing
    // for either), but silently committing a save that strips an existing
    // entry's credentials is a bad failure mode for what's normally just an
    // admin mistake — reject before anything mutates instead.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [{ name: 'OpenRouter', apiKey: 'v3:test:sk-or-secret-key' }],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            value: [{ name: 'OpenRouter' }, { name: 'OpenRouter', baseURL: 'https://dup' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/Duplicate name in endpoints\.custom/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it("restores the surviving renamed entry's own credentials, not the deleted entry's, on a rename-onto-a-deleted-identity", async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 3,
        priority: 0,
        overrides: {
          endpoints: {
            custom: [
              { name: 'A', apiKey: 'v3:test:sk-a-secret' },
              { name: 'B', apiKey: 'v3:test:sk-b-secret' },
            ],
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 3,
        cause: 'save',
        entries: [
          {
            fieldPath: 'endpoints.custom',
            // B deleted; A renamed to B in the same save.
            value: [{ name: 'B', __previousIdentity: 'A' }],
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    expect(call.op.fields['endpoints.custom'][0].apiKey).toBe('v3:test:sk-a-secret');
  });

  it('preserves an existing encrypted mcpServers oauth.client_secret when the panel resubmits the whole oauth object without it', async () => {
    // Matches the admin panel's real submission shape traced by review: it
    // never receives real ciphertext for oauth.client_secret (reads are
    // redacted), so editing any other oauth sub-field (e.g. token_url)
    // resubmits the whole "oauth" object at fieldPath `mcpServers.<name>.oauth`
    // with client_secret entirely absent, not a leaf-level dotted patch.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 7,
        priority: 0,
        overrides: {
          mcpServers: {
            Jira: {
              url: 'https://mcp.example.com/jira',
              oauth: {
                client_id: 'jira-client-id',
                client_secret: 'v3:test:oauth-secret-value',
                authorization_url: 'https://mcp.example.com/oauth/authorize',
                token_url: 'https://old',
              },
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 7,
        cause: 'save',
        entries: [
          {
            fieldPath: 'mcpServers.Jira.oauth',
            value: {
              client_id: 'jira-client-id',
              authorization_url: 'https://mcp.example.com/oauth/authorize',
              token_url: 'https://new',
            },
          },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          fields: {
            'mcpServers.Jira.oauth': {
              client_id: 'jira-client-id',
              authorization_url: 'https://mcp.example.com/oauth/authorize',
              token_url: 'https://new',
              client_secret: 'v3:test:oauth-secret-value',
            },
          },
        }),
      }),
    );
  });

  it('rejects a direct leaf-dotted write to mcpServers.<name>.oauth.client_secret instead of persisting it in plaintext', async () => {
    const { handlers } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        cause: 'save',
        entries: [{ fieldPath: 'mcpServers.Jira.oauth.client_secret', value: 'sk-new-secret' }],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error:
        'Cannot write mcpServers secret fields by dotted leaf path: mcpServers.Jira.oauth.client_secret. Write the mcpServers.Jira.oauth object instead',
    });
  });

  it('does not restore a header omitted from a partial headers map the panel resubmits — deleting one credential must actually delete it', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 4,
        priority: 0,
        overrides: {
          endpoints: {
            openAI: {
              headers: {
                Authorization: 'v3:test:old-auth-token',
                'X-Custom': 'v3:test:old-custom-value',
              },
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 4,
        cause: 'save',
        entries: [
          { fieldPath: 'endpoints.openAI.headers', value: { Authorization: 'new-auth-token' } },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const submittedHeaders = call.op.fields['endpoints.openAI.headers'];
    expect(Object.keys(submittedHeaders)).toEqual(['Authorization']);
    expect(submittedHeaders['X-Custom']).toBeUndefined();
  });

  it('does not restore a header omitted from a partial mcpServers headers map resubmitted with no __previousIdentity hint at all', async () => {
    // Same contract as the endpoints.openAI.headers case above, but through
    // the mcpServers rename/create hint mechanism (resolveMcpSecretOrigins)
    // instead of restoreOmittedRecordSecretContainers — an ordinary edit with
    // no hint must never fall back to bare current-name matching for
    // headers/oauth_headers, or a deleted credential comes right back.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 5,
        priority: 0,
        overrides: {
          mcpServers: {
            Jira: {
              url: 'https://mcp.example.com/jira',
              headers: {
                Authorization: 'v3:test:old-auth-token',
                'X-Custom': 'v3:test:old-custom-value',
              },
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'save',
        entries: [
          { fieldPath: 'mcpServers.Jira.headers', value: { Authorization: 'new-auth-token' } },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const submittedHeaders = call.op.fields['mcpServers.Jira.headers'];
    expect(Object.keys(submittedHeaders)).toEqual(['Authorization']);
    expect(submittedHeaders['X-Custom']).toBeUndefined();
  });

  it('restores an mcpServers headers secret via __previousIdentity through the real encrypt-then-preserve pipeline order (Finding 1 regression)', async () => {
    // The real mutateConfigAtomic/patchConfigField pipeline runs
    // encryptConfigSecretFields BEFORE preservePatchedConfigSecretFields. The
    // generic headers/oauth_headers bulk-encryptor can't distinguish the
    // __previousIdentity hint from a real header value by shape alone, so if
    // it ever encrypts that sibling key, the hint is ciphertext by the time
    // resolveMcpSecretOrigins reads it and the rename silently loses its
    // credential. This exercises the FULL real call order (not just the
    // secrets.ts unit), so a regression in either function's chain shows up
    // here.
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 9,
        priority: 0,
        overrides: {
          mcpServers: {
            Jira: {
              url: 'https://mcp.example.com/jira',
              headers: { Authorization: 'v3:test:gateway-token' },
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 9,
        cause: 'save',
        // A real rename deletes the old entry in the same request (the
        // admin panel's handleRename resets every one of its leaf paths) —
        // that deletion is what makes "Jira" a genuine vacate rather than a
        // still-alive origin a hint could otherwise be cloning from
        // (Finding 2).
        resetPaths: ['mcpServers.Jira'],
        entries: [
          { fieldPath: 'mcpServers.JiraEU.url', value: 'https://mcp.example.com/jira-eu' },
          { fieldPath: 'mcpServers.JiraEU.headers', value: { __previousIdentity: 'Jira' } },
        ],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    const headers = call.op.fields['mcpServers.JiraEU.headers'];
    expect(headers.Authorization).toBe('v3:test:gateway-token');
    expect(headers).not.toHaveProperty('__previousIdentity');
  });

  describe('mcpServers __previousIdentity hint batch-collision detection (Finding 7)', () => {
    it("does not clone a still-present, unrenamed server's secret onto a new destination claiming it as origin in the same save", async () => {
      // Repro #1: server "A" is NOT being renamed away — a separate entry in
      // this same batch edits mcpServers.A.oauth directly (an ordinary edit,
      // no hint) — while a brand-new/renamed destination "C" claims "A" as
      // its __previousIdentity origin. A never vacated, so this is a clone,
      // not a move, and must be rejected. A's own bare-current-name
      // restoration (an unrelated, ordinary edit) must still work normally.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 6,
          cause: 'save',
          entries: [
            { fieldPath: 'mcpServers.C.url', value: 'https://mcp.example.com/c' },
            { fieldPath: 'mcpServers.C.oauth', value: { __previousIdentity: 'A' } },
            {
              fieldPath: 'mcpServers.A.oauth',
              value: {
                client_id: 'a-client-id',
                authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                token_url: 'https://mcp.example.com/a/oauth/token-v2',
              },
            },
          ],
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(200);
      const call = deps.mutateConfigWithRevision.mock.calls[0][0];
      expect(call.op.fields['mcpServers.C.oauth'].client_secret).toBeUndefined();
      expect(call.op.fields['mcpServers.C.oauth']).not.toHaveProperty('__previousIdentity');
      // A's own ordinary (no-hint) edit still restores A's own secret.
      expect(call.op.fields['mcpServers.A.oauth'].client_secret).toBe('v3:test:secret-A');
    });

    it('does not let two different destination servers both restore the same origin secret in the same save', async () => {
      // Repro #2: destinations "C" and "D" both claim __previousIdentity "A"
      // in the same batch. A stored server's credentials can flow to at most
      // one destination — with two claimants, neither may restore from it.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 6,
          cause: 'save',
          entries: [
            { fieldPath: 'mcpServers.C.url', value: 'https://mcp.example.com/c' },
            { fieldPath: 'mcpServers.C.oauth', value: { __previousIdentity: 'A' } },
            { fieldPath: 'mcpServers.D.url', value: 'https://mcp.example.com/d' },
            { fieldPath: 'mcpServers.D.oauth', value: { __previousIdentity: 'A' } },
          ],
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(200);
      const call = deps.mutateConfigWithRevision.mock.calls[0][0];
      expect(call.op.fields['mcpServers.C.oauth'].client_secret).toBeUndefined();
      expect(call.op.fields['mcpServers.D.oauth'].client_secret).toBeUndefined();
    });

    it("does not assemble one destination's entry from two unrelated servers' hidden credentials when its own sub-objects disagree on origin", async () => {
      // Repro #3: destination "C"'s oauth sub-object hints origin "A" while
      // its headers sub-object hints origin "B" in the same save. A single
      // destination's sub-objects must agree on one origin story — when they
      // don't, neither claim is honored.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
              B: {
                url: 'https://mcp.example.com/b',
                headers: { Authorization: 'v3:test:token-B' },
              },
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 6,
          cause: 'save',
          entries: [
            { fieldPath: 'mcpServers.C.url', value: 'https://mcp.example.com/c' },
            { fieldPath: 'mcpServers.C.oauth', value: { __previousIdentity: 'A' } },
            { fieldPath: 'mcpServers.C.headers', value: { __previousIdentity: 'B' } },
          ],
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(200);
      const call = deps.mutateConfigWithRevision.mock.calls[0][0];
      expect(call.op.fields['mcpServers.C.oauth'].client_secret).toBeUndefined();
      expect(call.op.fields['mcpServers.C.headers'].Authorization).toBeUndefined();
    });

    it("does not clone a still-present origin's secret when the batch never mentions that origin at all (Finding 2 — the untouched-origin gap)", async () => {
      // Unlike repro #1 above (which edits mcpServers.A.oauth directly, giving
      // the old validator an artificial signal that A is "in the batch"), this
      // save touches ONLY C — A sits untouched in the existing document. A
      // hint claiming A as origin must still be rejected: A never vacated,
      // it's simply not part of this save at all.
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 6,
          cause: 'save',
          entries: [
            { fieldPath: 'mcpServers.C.url', value: 'https://mcp.example.com/c' },
            { fieldPath: 'mcpServers.C.oauth', value: { __previousIdentity: 'A' } },
          ],
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(200);
      const call = deps.mutateConfigWithRevision.mock.calls[0][0];
      expect(call.op.fields['mcpServers.C.oauth'].client_secret).toBeUndefined();
    });

    it('lets a rename through when its claimed origin is genuinely removed via resetPaths in the same save (Finding 2 — legitimate move still works)', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 6,
          cause: 'save',
          resetPaths: ['mcpServers.A'],
          entries: [
            { fieldPath: 'mcpServers.C.url', value: 'https://mcp.example.com/c' },
            {
              fieldPath: 'mcpServers.C.oauth',
              // Mirrors the real admin-panel rename flow: the whole
              // sub-object moves as one write, non-secret siblings included,
              // with only the secret leaf itself omitted/redacted.
              value: {
                client_id: 'a-client-id',
                authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                token_url: 'https://mcp.example.com/a/oauth/token',
                __previousIdentity: 'A',
              },
            },
          ],
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);

      expect(res.statusCode).toBe(200);
      const call = deps.mutateConfigWithRevision.mock.calls[0][0];
      expect(call.op.fields['mcpServers.C.oauth'].client_secret).toBe('v3:test:secret-A');
    });
  });

  describe('mcpServers __previousIdentity hint batch-collision detection on whole-document routes (Finding 2)', () => {
    it('does not clone a still-present origin secret via upsertConfigOverrides (legacy whole-document upsert)', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          configVersion: 6,
          priority: 0,
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  client_secret: 'v3:test:secret-A',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
            },
          },
        }),
        upsertConfig: jest.fn().mockResolvedValue({ _id: 'c1', configVersion: 7 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            mcpServers: {
              A: {
                url: 'https://mcp.example.com/a',
                oauth: {
                  client_id: 'a-client-id',
                  authorization_url: 'https://mcp.example.com/a/oauth/authorize',
                  token_url: 'https://mcp.example.com/a/oauth/token',
                },
              },
              C: {
                url: 'https://mcp.example.com/c',
                oauth: { __previousIdentity: 'A' },
              },
            },
          },
        },
      });
      const res = mockRes();
      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3] as Record<string, unknown>;
      const mcpServers = savedOverrides.mcpServers as Record<string, Record<string, unknown>>;
      const cOauth = mcpServers.C.oauth as Record<string, unknown>;
      expect(cOauth.client_secret).toBeUndefined();
      // A's own resubmission (still present, unrenamed) keeps its own secret.
      expect((mcpServers.A.oauth as Record<string, unknown>).client_secret).toBe(
        'v3:test:secret-A',
      );
    });
  });

  it('clears every header when the panel resubmits an explicit empty headers map', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue({
        configVersion: 4,
        priority: 0,
        overrides: {
          endpoints: {
            openAI: {
              headers: {
                Authorization: 'v3:test:old-auth-token',
                'X-Custom': 'v3:test:old-custom-value',
              },
            },
          },
        },
      }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 4,
        cause: 'save',
        entries: [{ fieldPath: 'endpoints.openAI.headers', value: {} }],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const call = deps.mutateConfigWithRevision.mock.calls[0][0];
    expect(call.op.fields['endpoints.openAI.headers']).toEqual({});
  });

  it('rejects an entry path with no corresponding librechat.yaml schema field', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(0)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: [{ fieldPath: 'notARealTopLevelSection.foo', value: 'anything' }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/Unknown config field path/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects process-backed MCP fields before an atomic mutation', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'mcpServers.injected.command', value: '/bin/sh' }],
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Process-backed MCP servers can only be configured in librechat.yaml',
    });
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects Langfuse request headers before an atomic mutation', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'langfuse.headers.X-Proxy-Token', value: 'secret' }],
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Langfuse request headers can only be configured in librechat.yaml',
    });
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('encrypts atomic secret fields and redacts config and revision responses', async () => {
    const secret = 'sk-atomic-secret';
    const mutateConfigWithRevision = jest.fn(async ({ op }) => {
      const fields = op.kind === 'fields' ? op.fields : {};
      const overrides = {
        ocr: {
          apiKey: fields['ocr.apiKey'],
          apiKeyPreview: fields['ocr.apiKeyPreview'],
        },
      };
      return {
        changed: true,
        config: { _id: 'c1', configVersion: 6, overrides },
        revision: { id: 'rev-1', status: 'final', configVersion: 5, overrides },
      };
    });
    const { handlers, deps } = createHandlers({
      mutateConfigWithRevision,
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'ocr.apiKey', value: secret }],
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    const mutation = deps.mutateConfigWithRevision.mock.calls[0][0];
    expect(mutation.op).toEqual(
      expect.objectContaining({
        kind: 'fields',
        fields: expect.objectContaining({
          'ocr.apiKey': `v3:test:${secret}`,
          'ocr.apiKeyPreview': expect.any(String),
        }),
      }),
    );
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(JSON.stringify(res.body)).not.toContain('v3:test:');
    expect(res.body?.config).toEqual(
      expect.objectContaining({
        overrides: { ocr: { apiKeyPreview: expect.any(String) } },
      }),
    );
    expect(res.body?.revision).toEqual(
      expect.objectContaining({
        overrides: { ocr: { apiKeyPreview: expect.any(String) } },
      }),
    );
  });

  it('scopes the fields-mode secret-preservation read to the default tenant instead of omitting it', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'cache', value: true }],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    // A default-tenant caller (user.tenantId undefined) must still scope the
    // read to the default tenant — omitting the option entirely would let it
    // match another tenant's role/__base__ document (findConfigByPrincipal
    // treats a missing tenantId option as "no tenant filter at all").
    expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
      'role',
      '__base__',
      expect.objectContaining({ tenantId: '' }),
    );
  });

  it('scopes the fields-mode secret-preservation read to the caller explicit tenant', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      user: { id: 'u1', role: 'ADMIN', tenantId: 'tenant-a', _id: { toString: () => 'u1' } },
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'cache', value: true }],
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
      'role',
      '__base__',
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });

  it('rejects a single oversized deeply nested reset path', async () => {
    const { handlers, deps } = createHandlers();
    const deepResetPath = Array.from({ length: 33 }, (_, index) => `seg${index}`).join('.');
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        resetPaths: [deepResetPath],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toMatch(/maximum depth of 32 segments/);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects oversized combined entries and resetPaths', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 0,
        entries: Array.from({ length: 51 }, (_, index) => ({
          fieldPath: `field${index}`,
          value: true,
        })),
        resetPaths: Array.from({ length: 50 }, (_, index) => `reset${index}`),
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('combined entries and resetPaths exceed maximum of 100');
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('returns 409 on version conflict', async () => {
    const { handlers } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
      mutateConfigWithRevision: jest.fn().mockRejectedValue(
        Object.assign(new Error('Config version conflict'), {
          name: 'ConfigVersionConflictError',
          currentVersion: 7,
        }),
      ),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        entries: [{ fieldPath: 'cache', value: true }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 7 });
  });

  it('applies fields mutation then invalidates caches', async () => {
    const invalidateConfigCaches = jest.fn().mockResolvedValue(undefined);
    const { handlers, deps } = createHandlers({
      invalidateConfigCaches,
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        resetPaths: ['registration.allowedDomains'],
        entries: [{ fieldPath: 'cache', value: true }],
        cause: 'save',
        priority: 0,
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 5,
        cause: 'save',
        op: expect.objectContaining({
          kind: 'fields',
          resetPaths: ['registration.allowedDomains'],
          fields: { cache: true },
        }),
      }),
    );
    expect(invalidateConfigCaches).toHaveBeenCalled();
    expect(res.body).toEqual({
      changed: true,
      config: { _id: 'c1', configVersion: 6, overrides: { cache: true } },
      revision: { id: 'rev-1', status: 'final', configVersion: 5 },
    });
  });

  it('uses the ALS-resolved request tenant, not the user claim, for pre-reads, actor, and cache invalidation', async () => {
    const invalidateConfigCaches = jest.fn().mockResolvedValue(undefined);
    const findConfigByPrincipal = jest.fn().mockResolvedValue(versionedBaseConfig(5));
    const { handlers, deps } = createHandlers({ invalidateConfigCaches, findConfigByPrincipal });
    const req = mockReq({
      user: {
        id: 'u1',
        role: 'ADMIN',
        tenantId: 'user-claim-tenant',
        _id: { toString: () => 'u1' },
      },
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        expectedTenantId: 'als-resolved-tenant',
        entries: [{ fieldPath: 'cache', value: true }],
        cause: 'save',
      },
    });
    const res = mockRes();

    // The tenant middleware resolves a DIFFERENT effective tenant into ALS
    // than the user's own tenantId claim — e.g. after normalization. Every
    // tenant-scoped operation in this request must agree on ALS, not the claim,
    // or the config write and its revision end up scoped to different tenants.
    await tenantStorage.run({ tenantId: 'als-resolved-tenant' }, async () => {
      await handlers.mutateConfigAtomic(req, res);
    });

    expect(res.statusCode).toBe(200);
    expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
      'role',
      '__base__',
      expect.objectContaining({ tenantId: 'als-resolved-tenant' }),
    );
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ tenantId: 'als-resolved-tenant' }),
      }),
    );
    expect(invalidateConfigCaches).toHaveBeenCalledWith('als-resolved-tenant');
  });

  it('authorizes against the effective request tenant it writes in, not the user claim', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      user: {
        id: 'u1',
        role: 'ADMIN',
        tenantId: 'user-claim-tenant',
        _id: { toString: () => 'u1' },
      },
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        expectedTenantId: 'als-resolved-tenant',
        entries: [{ fieldPath: 'cache', value: true }],
        cause: 'save',
      },
    });
    const res = mockRes();

    await tenantStorage.run({ tenantId: 'als-resolved-tenant' }, async () => {
      await handlers.mutateConfigAtomic(req, res);
    });

    expect(res.statusCode).toBe(200);
    // Checking grants in `user-claim-tenant` while writing into
    // `als-resolved-tenant` would authorize a tenant that never receives the
    // config or its revision.
    expect(deps.hasConfigCapability).toHaveBeenCalled();
    for (const [capabilityUser] of deps.hasConfigCapability.mock.calls) {
      expect(capabilityUser).toMatchObject({ tenantId: 'als-resolved-tenant' });
    }
  });

  it('strips protected ancestor and alias entries/reset paths in atomic fields mode', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        resetPaths: ['interface', 'interfaceConfig.prompts', 'registration.allowedDomains'],
        entries: [
          { fieldPath: 'interface', value: null },
          { fieldPath: 'interfaceConfig.prompts', value: false },
          { fieldPath: 'cache', value: true },
        ],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          resetPaths: ['registration.allowedDomains'],
          fields: { cache: true },
        }),
      }),
    );
  });

  it('allows actionable fields when blocked reset paths are stripped before section grants', async () => {
    const { handlers, deps } = createHandlers({
      hasConfigCapability: jest.fn().mockImplementation((_user, section: string | null) => {
        if (section == null) {
          return Promise.resolve(false);
        }
        return Promise.resolve(section === 'registration');
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        resetPaths: ['interface'],
        entries: [{ fieldPath: 'registration.allowedDomains', value: [] }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          resetPaths: [],
          fields: { 'registration.allowedDomains': [] },
        }),
      }),
    );
    expect(res.body).toEqual({ changed: true, configVersion: 6, revisionId: 'rev-1' });
    expect(res.body).not.toHaveProperty('config');
    expect(res.body).not.toHaveProperty('revision');
  });

  it('creates a new base config at priority 0 for a section-scoped caller, not DEFAULT_PRIORITY', async () => {
    const { handlers, deps } = createHandlers({
      hasConfigCapability: jest.fn().mockImplementation((_user, section: string | null) => {
        if (section == null) {
          return Promise.resolve(false);
        }
        return Promise.resolve(section === 'registration');
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        // No priority sent — a section-scoped caller's priority is discarded
        // regardless, so this isolates the DEFAULT for a brand-new __base__
        // document from whatever the caller happened to submit.
        expectedVersion: null,
        entries: [{ fieldPath: 'registration.allowedDomains', value: [] }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'fields',
          priority: 0,
        }),
      }),
    );
  });

  it('creates a new base config at priority 0 when a broad caller omits priority in fields mode', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: null,
        entries: [{ fieldPath: 'registration.allowedDomains', value: [] }],
        cause: 'save',
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({ kind: 'fields', priority: 0 }),
      }),
    );
  });

  it('creates a new base config at priority 0 when a broad caller omits priority in replace mode', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: null,
        overrides: { registration: { allowedDomains: [] } },
        cause: 'import',
      },
    });
    const res = mockRes();

    await handlers.mutateConfigAtomic(req, res);

    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({ kind: 'replace', priority: 0 }),
      }),
    );
  });

  it('returns 403 for protected-only no-op atomic fields requests without section grants', async () => {
    const { handlers, deps } = createHandlers({
      hasConfigCapability: jest.fn().mockResolvedValue(false),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        resetPaths: ['interface'],
        entries: [{ fieldPath: 'interfaceConfig.prompts', value: false }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(403);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('returns 409 on stale expectedVersion for protected-only no-op with broad manage', async () => {
    const { handlers, deps } = createHandlers({
      hasConfigCapability: jest.fn().mockImplementation((_user, section: string | null) => {
        if (section == null) {
          return Promise.resolve(true);
        }
        return Promise.resolve(false);
      }),
      findConfigByPrincipal: jest.fn().mockResolvedValue({ configVersion: 3, priority: 10 }),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 1,
        resetPaths: ['interface'],
        entries: [{ fieldPath: 'interfaceConfig.prompts', value: false }],
        cause: 'save',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 3 });
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('rejects non-base principals', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'group', principalId: 'g1' },
      body: { expectedVersion: 1, entries: [{ fieldPath: 'cache', value: true }], cause: 'save' },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(400);
    expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
  });

  it('strips interface permission fields from atomic replace overrides', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'import',
        overrides: {
          cache: true,
          interface: { prompts: false, modelSelect: true },
        },
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'replace',
          overrides: { cache: true, interface: { modelSelect: true } },
        }),
      }),
    );
  });

  it('strips non-object interface and internal aliases from atomic replace overrides', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'import',
        overrides: {
          cache: true,
          interface: null,
          interfaceConfig: { prompts: false },
        },
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: expect.objectContaining({
          kind: 'replace',
          overrides: { cache: true },
        }),
      }),
    );
  });

  it('scopes the replace-mode secret-preservation read to the default tenant instead of omitting it', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'import',
        overrides: { cache: true },
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    // Same scoping requirement as the fields-mode read: a default-tenant
    // caller must not leave the tenantId option out entirely, or the
    // secret-preservation read could match another tenant's __base__ doc.
    expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
      'role',
      '__base__',
      expect.objectContaining({ tenantId: '' }),
    );
  });

  it('scopes the replace-mode secret-preservation read to the caller explicit tenant', async () => {
    const { handlers, deps } = createHandlers({
      findConfigByPrincipal: jest.fn().mockResolvedValue(versionedBaseConfig(5)),
    });
    const req = mockReq({
      user: { id: 'u1', role: 'ADMIN', tenantId: 'tenant-a', _id: { toString: () => 'u1' } },
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'import',
        overrides: { cache: true },
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
      'role',
      '__base__',
      expect.objectContaining({ tenantId: 'tenant-a' }),
    );
  });

  it('forwards restoreRevisionId as a restore operation', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'restore',
        restoreRevisionId: '11111111-1111-4111-8111-111111111111',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        op: { kind: 'restore', revisionId: '11111111-1111-4111-8111-111111111111' },
        cause: 'restore',
      }),
    );
  });

  it('derives cause from the mutation mode instead of the client label', async () => {
    const { handlers, deps } = createHandlers();
    const req = mockReq({
      params: { principalType: 'role', principalId: '__base__' },
      body: {
        expectedVersion: 5,
        cause: 'save',
        restoreRevisionId: '11111111-1111-4111-8111-111111111111',
      },
    });
    const res = mockRes();
    await handlers.mutateConfigAtomic(req, res);
    expect(res.statusCode).toBe(200);
    expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
      expect.objectContaining({ cause: 'restore' }),
    );
  });

  describe('restore validation', () => {
    async function captureValidateRestoredOverrides(): Promise<
      (overrides: Record<string, unknown>) => string | null
    > {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 5,
          restoreRevisionId: '11111111-1111-4111-8111-111111111111',
        },
      });
      await handlers.mutateConfigAtomic(req, mockRes());
      const call = deps.mutateConfigWithRevision.mock.calls[0][0] as {
        validateRestoredOverrides: (overrides: Record<string, unknown>) => string | null;
      };
      return call.validateRestoredOverrides;
    }

    it('passes a validateRestoredOverrides callback that rejects a legacy process-backed MCP server', async () => {
      const validate = await captureValidateRestoredOverrides();
      expect(validate({ mcpServers: { filesystem: { type: 'stdio' } } })).toBe(
        'Process-backed MCP servers can only be configured in librechat.yaml',
      );
    });

    it('passes a validateRestoredOverrides callback that rejects protected Langfuse headers', async () => {
      const validate = await captureValidateRestoredOverrides();
      expect(validate({ langfuse: { headers: { 'X-Token': 'secret' } } })).toBe(
        'Langfuse request headers can only be configured in librechat.yaml',
      );
    });

    it('passes a validateRestoredOverrides callback that rejects schema-invalid content', async () => {
      const validate = await captureValidateRestoredOverrides();
      expect(validate({ interface: { schedules: { maxPerUser: -1 } } })).toMatch(/maxPerUser/);
    });

    it('passes a validateRestoredOverrides callback that accepts valid content', async () => {
      const validate = await captureValidateRestoredOverrides();
      expect(validate({ cache: true })).toBeNull();
    });

    it('returns 400 when the atomic mutation reports a restore validation failure', async () => {
      const { handlers } = createHandlers({
        mutateConfigWithRevision: jest
          .fn()
          .mockRejectedValue(new RestoreValidationError('Invalid config overrides: bad value')),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: {
          expectedVersion: 5,
          restoreRevisionId: '11111111-1111-4111-8111-111111111111',
        },
      });
      const res = mockRes();
      await handlers.mutateConfigAtomic(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid config overrides: bad value' });
    });
  });
});
