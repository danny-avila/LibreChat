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
  return {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Partial<ServerRequest> as ServerRequest;
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
    hasConfigCapability: jest.fn().mockResolvedValue(true),
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
                displaySecretKey: 'sk-lf-...cret',
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
        displaySecretKey: 'sk-lf-...cret',
      });
    });
  });

  describe('getConfig', () => {
    it('returns 403 before DB lookup when user lacks READ_CONFIGS', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
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

    it('encrypts Langfuse secret keys on full override writes', async () => {
      process.env.CREDS_KEY =
        process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
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
            langfuse: {
              publicKey: 'pk-lf-1',
              secretKey: 'sk-lf-secret',
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.langfuse.secretKey).toMatch(/^v3:/);
      expect(savedOverrides.langfuse.secretKey).not.toBe('sk-lf-secret');
      expect(savedOverrides.langfuse.displaySecretKey).toBe('sk-lf-...cret');
      const responseConfig = res.body!.config as {
        overrides: { langfuse: Record<string, string> };
      };
      expect(responseConfig.overrides.langfuse).toEqual({
        publicKey: 'pk-lf-1',
        displaySecretKey: savedOverrides.langfuse.displaySecretKey,
      });
    });

    it('preserves existing encrypted Langfuse secrets on full override writes when omitted', async () => {
      const existing = {
        _id: 'c1',
        priority: 7,
        overrides: {
          langfuse: {
            publicKey: 'pk-old',
            secretKey: 'v3:test:sk-old',
            displaySecretKey: 'sk-old...-old',
          },
        },
      };
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(existing),
        upsertConfig: jest.fn(async (_type, _id, _model, overrides) => ({
          _id: 'c1',
          configVersion: 2,
          overrides,
        })),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            langfuse: {
              publicKey: 'pk-new',
              destination: 'eu',
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.langfuse).toEqual({
        publicKey: 'pk-new',
        destination: 'eu',
        secretKey: 'v3:test:sk-old',
        displaySecretKey: 'sk-old...-old',
      });
      const responseConfig = res.body!.config as {
        overrides: { langfuse: Record<string, string> };
      };
      expect(responseConfig.overrides.langfuse).toEqual({
        publicKey: 'pk-new',
        destination: 'eu',
        displaySecretKey: 'sk-old...-old',
      });
    });

    it('clears existing Langfuse secrets on full override writes when explicitly empty', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          _id: 'c1',
          overrides: {
            langfuse: {
              secretKey: 'v3:test:sk-old',
              displaySecretKey: 'sk-old...-old',
            },
          },
        }),
        upsertConfig: jest.fn(async (_type, _id, _model, overrides) => ({
          _id: 'c1',
          configVersion: 2,
          overrides,
        })),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            langfuse: {
              publicKey: 'pk-new',
              secretKey: '',
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.langfuse).toEqual({
        publicKey: 'pk-new',
        secretKey: '',
        displaySecretKey: '',
      });
    });

    it('rejects encrypted Langfuse secret values on full override writes', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          overrides: {
            langfuse: {
              publicKey: 'pk-lf-1',
              secretKey: 'v3:attacker-controlled',
            },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(400);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('does not persist literal dotted Langfuse secret keys on full override writes', async () => {
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
            'langfuse.secretKey': 'sk-lf-secret',
            'langfuse.displaySecretKey': 'spoofed',
            langfuse: { publicKey: 'pk-lf-1' },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides).not.toHaveProperty('langfuse.secretKey');
      expect(savedOverrides).not.toHaveProperty('langfuse.displaySecretKey');
      expect(savedOverrides.langfuse).toEqual({ publicKey: 'pk-lf-1' });
      const responseConfig = res.body!.config as {
        overrides: { langfuse: Record<string, string> };
      };
      expect(responseConfig.overrides).toEqual({
        langfuse: { publicKey: 'pk-lf-1' },
      });
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

    it('also deletes the display secret key companion when deleting a secret field', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'langfuse.secretKey' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.unsetConfigField).toHaveBeenCalledWith('role', 'admin', 'langfuse.secretKey');
      expect(deps.unsetConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        'langfuse.displaySecretKey',
      );
    });

    it('rejects deletes of the displayed secret key', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'langfuse.displaySecretKey' },
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
        10,
      );
    });

    it('uses the existing config priority when priority is omitted', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({ _id: 'c1', priority: 42 }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'mcpServers.github' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(deps.tombstoneConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        'mcpServers.github',
        42,
      );
    });

    it('also tombstones the display secret key companion when tombstoning a secret field', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'langfuse.secretKey' },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.tombstoneConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        'langfuse.secretKey',
        10,
      );
      expect(deps.tombstoneConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        expect.anything(),
        'langfuse.displaySecretKey',
        10,
      );
    });

    it('rejects tombstones of the displayed secret key', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'langfuse.displaySecretKey' },
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

    it('clears stale Langfuse display secret keys when clearing a secret', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKey', value: '' }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['langfuse.secretKey']).toBe('');
      expect(patchedFields['langfuse.displaySecretKey']).toBe('');
    });

    it('encrypts Langfuse secret keys inside object-valued patch entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            {
              fieldPath: 'langfuse',
              value: {
                publicKey: 'pk-lf-1',
                secretKey: 'sk-lf-secret',
              },
            },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields.langfuse.secretKey).toMatch(/^v3:/);
      expect(patchedFields.langfuse.secretKey).not.toBe('sk-lf-secret');
      expect(patchedFields.langfuse.displaySecretKey).toBe('sk-lf-...cret');
    });

    it('preserves existing encrypted Langfuse secrets on object-valued patch entries when omitted', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          _id: 'c1',
          priority: 7,
          overrides: {
            langfuse: {
              publicKey: 'pk-old',
              secretKey: 'v3:test:sk-old',
              displaySecretKey: 'sk-old...-old',
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          priority: 12,
          entries: [
            {
              fieldPath: 'langfuse',
              value: {
                publicKey: 'pk-new',
                destination: 'eu',
              },
            },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields.langfuse).toEqual({
        publicKey: 'pk-new',
        destination: 'eu',
        secretKey: 'v3:test:sk-old',
        displaySecretKey: 'sk-old...-old',
      });
      expect(deps.findConfigByPrincipal).toHaveBeenCalled();
    });

    it('clears existing Langfuse secrets on object-valued patch entries when explicitly empty', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          _id: 'c1',
          priority: 7,
          overrides: {
            langfuse: {
              secretKey: 'v3:test:sk-old',
              displaySecretKey: 'sk-old...-old',
            },
          },
        }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [
            {
              fieldPath: 'langfuse',
              value: {
                publicKey: 'pk-new',
                secretKey: '',
              },
            },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields.langfuse).toEqual({
        publicKey: 'pk-new',
        secretKey: '',
        displaySecretKey: '',
      });
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

    it('does not store non-string values at Langfuse secret paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.secretKey', value: { hidden: 'sk-lf-secret' } }],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['langfuse.secretKey']).toBe('');
      expect(patchedFields['langfuse.displaySecretKey']).toBe('');
    });

    it('rejects direct display secret key patch entries', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.displaySecretKey', value: 'spoofed' }],
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

    it('rejects patch entries below protected Langfuse displaySecretKey paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: {
          entries: [{ fieldPath: 'langfuse.displaySecretKey.hidden', value: 'spoofed' }],
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
  });

  describe('patchConfigField: section-scoped priority preservation', () => {
    it('ignores request-supplied priority when caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue({ _id: 'c1', priority: 7, overrides: {} }),
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
      expect(priorityArg).toBe(7);
    });

    it('falls back to default priority when no existing doc and caller lacks broad manage', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
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
      expect(priorityArg).toBe(10);
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

    it('preserves existing priority 0 for section-scoped callers', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue({ _id: 'c1', priority: 0, overrides: {} }),
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
      expect(priorityArg).toBe(0);
    });
  });

  describe('tombstoneConfigField: section-scoped priority preservation', () => {
    it('ignores request-supplied priority when caller lacks broad manage:configs', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue({ _id: 'c1', priority: 7, overrides: {} }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'memory.context', priority: 999 },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.tombstoneConfigField.mock.calls[0];
      expect(priorityArg).toBe(7);
    });

    it('falls back to default priority when no existing doc and caller lacks broad manage', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn(async (_user, section) => section === 'memory'),
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { fieldPath: 'memory.context', priority: 999 },
      });
      const res = mockRes();

      await handlers.tombstoneConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const [, , , , priorityArg] = deps.tombstoneConfigField.mock.calls[0];
      expect(priorityArg).toBe(10);
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

  describe('scope-lifecycle: __base__ short-circuit', () => {
    it('upsert against __base__ returns 403 for assign-only caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.upsertConfig).not.toHaveBeenCalled();
    });

    it('delete against __base__ returns 403 for assign-only caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
      });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.deleteConfig).not.toHaveBeenCalled();
    });

    it('toggle against __base__ returns 403 for assign-only caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
        hasCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(res.statusCode).toBe(403);
      expect(deps.toggleConfigActive).not.toHaveBeenCalled();
    });

    it('upsert against __base__ succeeds for broad-manage caller', async () => {
      const { handlers, deps } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(true),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: '__base__' },
        body: { overrides: {}, priority: 5 },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      expect(deps.upsertConfig).toHaveBeenCalled();
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

  describe('getBaseConfig', () => {
    it('returns 403 when user lacks READ_CONFIGS', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
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
            displaySecretKey: 'sk-lf-...cret',
          },
          config: {
            langfuse: {
              publicKey: 'pk-lf-1',
              secretKey: 'sk-lf-raw-secret',
              displaySecretKey: 'sk-lf-...cret',
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
        displaySecretKey: 'sk-lf-...cret',
      });
      expect(responseConfig.config.langfuse).toEqual({
        publicKey: 'pk-lf-1',
        displaySecretKey: 'sk-lf-...cret',
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
  });
});
