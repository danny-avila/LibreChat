import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
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
    unsetConfigField: jest.fn().mockResolvedValue({ _id: 'c1', overrides: {} }),
    deleteConfig: jest.fn().mockResolvedValue({ _id: 'c1' }),
    toggleConfigActive: jest.fn().mockResolvedValue({ _id: 'c1', isActive: false }),
    hasConfigCapability: jest.fn().mockResolvedValue(true),

    getAppConfig: jest.fn().mockResolvedValue({ interface: { endpointsMenu: true } }),
    ...overrides,
  };
  const handlers = createAdminConfigHandlers(deps);
  return { handlers, deps };
}

describe('createAdminConfigHandlers', () => {
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
        body: { overrides: { interface: { endpointsMenu: false } } },
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
        body: { overrides: { interface: { endpointsMenu: false } } },
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
            interface: { endpointsMenu: false, prompts: false, agents: { use: false } },
          },
        },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
      const savedOverrides = deps.upsertConfig.mock.calls[0][3];
      expect(savedOverrides.interface).toEqual({ endpointsMenu: false });
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
        query: { fieldPath: 'interface.endpointsMenu' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(deps.unsetConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        'interface.endpointsMenu',
      );
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

    it('allows deleting interface UI field paths', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.endpointsMenu' },
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.unsetConfigField).toHaveBeenCalledWith(
        'role',
        'admin',
        'interface.endpointsMenu',
      );
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
            { fieldPath: 'interface.endpointsMenu', value: false },
            { fieldPath: 'interface.prompts', value: false },
          ],
        },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(200);
      const patchedFields = deps.patchConfigFields.mock.calls[0][3];
      expect(patchedFields['interface.endpointsMenu']).toBe(false);
      expect(patchedFields['interface.prompts']).toBeUndefined();
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

  describe('upsertConfigOverrides — Bug 2 regression', () => {
    it('returns 403 for empty overrides when user lacks MANAGE_CONFIGS', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
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
      expect(upsertConfig).toHaveBeenCalledWith('role', 'admin', expect.anything(), {}, 5);
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
        body: { overrides: { interface: { endpointsMenu: false } } },
      },
    },
    {
      name: 'patchConfigField',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.endpointsMenu', value: false }] },
      },
    },
    {
      name: 'deleteConfigField',
      reqOverrides: {
        params: { principalType: 'role', principalId: 'admin' },
        query: { fieldPath: 'interface.endpointsMenu' },
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
      expect(res.body!.config).toEqual({ interface: { endpointsMenu: true } });
    });
  });
});
