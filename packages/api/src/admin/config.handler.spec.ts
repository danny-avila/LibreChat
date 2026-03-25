import { createAdminConfigHandlers } from './config';

function mockReq(overrides = {}) {
  return {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      res.body = data;
      return res;
    }),
  };
  return res;
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
      .mockResolvedValue({ _id: 'c1', overrides: { interface: { endpointsMenu: false } } }),
    unsetConfigField: jest.fn().mockResolvedValue({ _id: 'c1', overrides: {} }),
    deleteConfig: jest.fn().mockResolvedValue({ _id: 'c1' }),
    toggleConfigActive: jest.fn().mockResolvedValue({ _id: 'c1', isActive: false }),
    hasConfigCapability: jest.fn().mockResolvedValue(true),
    markConfigsDirty: jest.fn().mockResolvedValue(undefined),
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
      expect(res.body.config).toEqual(config);
    });

    it('returns 400 for invalid principalType', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({ params: { principalType: 'invalid', principalId: 'x' } });
      const res = mockRes();

      await handlers.getConfig(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('upsertConfigOverrides', () => {
    it('returns 201 when creating a new config', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { endpointsMenu: false } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(201);
    });

    it('returns 200 when updating an existing config', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({ _id: 'existing' }),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { interface: { endpointsMenu: false } } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(res.statusCode).toBe(200);
    });

    it('calls markConfigsDirty after upsert', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { overrides: { x: 1 } },
      });
      const res = mockRes();

      await handlers.upsertConfigOverrides(req, res);

      expect(deps.markConfigsDirty).toHaveBeenCalled();
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

    it('returns 400 when fieldPath query param is missing', async () => {
      const { handlers } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        query: {},
      });
      const res = mockRes();

      await handlers.deleteConfigField(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('query parameter');
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
    it('calls markConfigsDirty after patch', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.endpointsMenu', value: false }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(deps.markConfigsDirty).toHaveBeenCalled();
    });

    it('returns 403 when user lacks capability for section', async () => {
      const { handlers } = createHandlers({
        hasConfigCapability: jest.fn().mockResolvedValue(false),
      });
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { entries: [{ fieldPath: 'interface.endpointsMenu', value: false }] },
      });
      const res = mockRes();

      await handlers.patchConfigField(req, res);

      expect(res.statusCode).toBe(403);
    });
  });

  describe('deleteConfigOverrides', () => {
    it('calls markConfigsDirty after delete', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
      });
      const res = mockRes();

      await handlers.deleteConfigOverrides(req, res);

      expect(deps.markConfigsDirty).toHaveBeenCalled();
    });
  });

  describe('toggleConfig', () => {
    it('calls markConfigsDirty after toggle', async () => {
      const { handlers, deps } = createHandlers();
      const req = mockReq({
        params: { principalType: 'role', principalId: 'admin' },
        body: { isActive: false },
      });
      const res = mockRes();

      await handlers.toggleConfig(req, res);

      expect(deps.markConfigsDirty).toHaveBeenCalled();
    });
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
      expect(res.body.config).toEqual({ interface: { endpointsMenu: true } });
    });
  });
});
