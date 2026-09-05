process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

// Loaded via dynamic import in beforeAll so the crypto module initializes
// after CREDS_KEY is set above (encryptV3 reads the key at module load).
let encryptV3: typeof import('@librechat/data-schemas').encryptV3;
let ConfigVersionConflictError: typeof import('@librechat/data-schemas').ConfigVersionConflictError;
let tenantStorage: typeof import('@librechat/data-schemas').tenantStorage;
let createAdminLangfuseHandlers: typeof import('./langfuse').createAdminLangfuseHandlers;
let getLangfuseDestinationId: typeof import('../langfuse/destinations').getLangfuseDestinationId;
const realFetch = global.fetch;

function projectResponse(projectId = 'project-1') {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: [{ id: projectId, name: 'Project' }] }),
  };
}

beforeAll(async () => {
  ({ encryptV3, ConfigVersionConflictError, tenantStorage } = await import(
    '@librechat/data-schemas'
  ));
  ({ createAdminLangfuseHandlers } = await import('./langfuse'));
  ({ getLangfuseDestinationId } = await import('../langfuse/destinations'));
});

beforeEach(() => {
  process.env.TENANT_ISOLATION_STRICT = 'true';
  process.env.LANGFUSE_FANOUT_ENABLED = 'true';
  process.env.LANGFUSE_FANOUT_COLLECTOR_URL = 'http://langfuse-fanout:4318';
  global.fetch = jest.fn().mockResolvedValue(projectResponse()) as unknown as typeof fetch;
});

afterEach(() => {
  delete process.env.LANGFUSE_FANOUT_ENABLED;
  delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
  delete process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL;
  delete process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_TRACING_ENABLED;
  delete process.env.LANGFUSE_SAMPLE_RATE;
  delete process.env.TENANT_ISOLATION_STRICT;
  global.fetch = realFetch;
});

function mockReq(overrides = {}) {
  const req = {
    user: { id: 'u1', role: 'ADMIN', tenantId: 't1' },
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
    Object.assign(req.body, { expectedTenantId: req.user?.tenantId ?? '' });
  }
  return req;
}

interface MockRes {
  statusCode: number;
  body: undefined | Record<string, unknown>;
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

function baseConfigDoc(langfuse: Record<string, unknown>) {
  return {
    _id: 'cfg1',
    principalType: 'role',
    principalId: '__base__',
    priority: 10,
    isActive: true,
    overrides: { langfuse },
    updatedAt: new Date('2026-06-29T00:00:00.000Z'),
  };
}

function createHandlers(overrides = {}) {
  const deps = {
    findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    mutateConfigWithRevision: jest.fn().mockImplementation(({ op }) =>
      Promise.resolve({
        changed: true,
        config: baseConfigDoc(rehydrate(op.fields)),
        revision: { id: 'rev1' },
      }),
    ),
    getMessages: jest.fn().mockResolvedValue([]),
    invalidateConfigCaches: jest.fn().mockResolvedValue(undefined),
    recordConnectionUpdate: jest.fn(),
    ...overrides,
  };
  const handlers = createAdminLangfuseHandlers(deps);
  return { handlers, deps };
}

/** Turn dot-path field entries into a nested langfuse object for the fake DB. */
function rehydrate(fields: Record<string, unknown>): Record<string, unknown> {
  const langfuse: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(fields)) {
    langfuse[path.replace(/^langfuse\./, '')] = value;
  }
  return langfuse;
}

describe('createAdminLangfuseHandlers', () => {
  describe('connection availability gate', () => {
    it('rejects connection reads when deployment fanout is disabled', async () => {
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Langfuse connection settings are not available' });
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('rejects connection updates when deployment fanout is disabled', async () => {
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({ body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' } }),
        res,
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Langfuse connection settings are not available' });
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('rejects connection settings when the fanout collector URL is missing', async () => {
      delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Langfuse connection settings are not available' });
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('rejects connection tests when deployment fanout is disabled', async () => {
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      global.fetch = jest.fn() as unknown as typeof fetch;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({ body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' } }),
        res,
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Langfuse connection settings are not available' });
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects connection settings when tenant fanout export is emergency-disabled', async () => {
      process.env.LANGFUSE_FANOUT_TENANT_EXPORT_DISABLED = 'true';
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Langfuse connection settings are not available' });
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('allows connection settings without fanout in single-tenant mode', async () => {
      delete process.env.TENANT_ISOLATION_STRICT;
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(200);
    });

    it('rejects single-tenant settings when environment credentials are configured', async () => {
      delete process.env.TENANT_ISOLATION_STRICT;
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
      process.env.LANGFUSE_PUBLIC_KEY = 'pk-env';
      process.env.LANGFUSE_SECRET_KEY = 'sk-env';
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });

    it('rejects settings when tracing is disabled', async () => {
      process.env.LANGFUSE_TRACING_ENABLED = 'false';
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(404);
      expect(deps.findConfigByPrincipal).not.toHaveBeenCalled();
    });
  });

  describe('getConnection', () => {
    it('reports not configured when no base config exists', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ configured: false, enabled: false });
      expect(res.body?.secretKey).toBeUndefined();
    });

    it('returns metadata only and never the secret key', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          baseConfigDoc({
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: encryptV3('sk-lf-secret'),
            secretKeyPreview: 'sk-lf...cret',
          }),
        ),
      });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.body).toMatchObject({
        configured: true,
        enabled: true,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKeyPreview: 'sk-lf...cret',
      });
      expect(res.body?.destinations).toEqual(
        expect.arrayContaining([{ key: 'eu', baseUrl: 'https://cloud.langfuse.com' }]),
      );
      expect(res.body?.secretKey).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('sk-lf-secret');
      expect(JSON.stringify(res.body)).not.toContain('v3:');
    });

    it('reports configured connections without an enabled field as disabled', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          baseConfigDoc({
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: encryptV3('sk-lf-secret'),
          }),
        ),
      });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.body).toMatchObject({ configured: true, enabled: false });
    });

    it('reports inactive base configs as effectively disabled with their real version', async () => {
      const findConfigByPrincipal = jest.fn().mockResolvedValue({
        ...baseConfigDoc({
          enabled: true,
          destination: 'eu',
          publicKey: 'pk-lf-1',
          secretKey: encryptV3('sk-lf-secret'),
        }),
        isActive: false,
        configVersion: 7,
      });
      const { handlers } = createHandlers({ findConfigByPrincipal });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(findConfigByPrincipal).toHaveBeenCalledWith('role', '__base__', {
        includeInactive: true,
        tenantId: 't1',
      });
      expect(res.body).toMatchObject({
        configured: true,
        enabled: false,
        configActive: false,
        configVersion: 7,
      });
    });

    it('scopes every base-config read to the explicit default tenant', async () => {
      for (const action of [
        'getConnection',
        'getSessionLink',
        'updateConnection',
        'testConnection',
      ] as const) {
        const { handlers, deps } = createHandlers();
        const user = { id: 'u1', role: 'ADMIN' };
        const res = mockRes();

        if (action === 'getConnection') {
          await handlers.getConnection(mockReq({ user }), res);
        } else if (action === 'getSessionLink') {
          await handlers.getSessionLink(
            mockReq({ user, params: { conversationId: 'conversation-1' } }),
            res,
          );
        } else if (action === 'updateConnection') {
          await handlers.updateConnection(
            mockReq({
              user,
              body: {
                enabled: true,
                destination: 'eu',
                publicKey: 'pk-lf-1',
                secretKey: 'sk-lf-secret',
                expectedVersion: null,
              },
            }),
            res,
          );
        } else {
          await handlers.testConnection(
            mockReq({ user, body: { destination: 'eu', publicKey: 'pk-lf-1' } }),
            res,
          );
        }

        expect(deps.findConfigByPrincipal).toHaveBeenCalledWith(
          'role',
          '__base__',
          expect.objectContaining({ tenantId: '' }),
        );
      }
    });

    it('reports configVersion 0, not null, for a legacy document with no version counter', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          ...baseConfigDoc({
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: encryptV3('sk-lf-secret'),
          }),
          configVersion: undefined,
        }),
      });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      // `null` must mean "no document at all" — a legacy document that
      // exists but predates the version counter has to report 0, matching
      // mutateConfigWithRevision's own CAS fallback, or the panel's next
      // `expectedVersion: null` write can never match the live document.
      expect(res.body).toMatchObject({ configVersion: 0 });
    });

    it('reports configVersion null only when no document exists at all', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(null),
      });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.body).toMatchObject({ configVersion: null });
    });
  });

  describe('getSessionLink', () => {
    const storedConnection = {
      enabled: true,
      destination: 'eu',
      projectId: 'project-1',
      publicKey: 'pk-lf-1',
      secretKey: 'encrypted-secret',
    };

    it('returns the session URL when this user has a sampled message for the project', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(baseConfigDoc(storedConnection)),
        getMessages: jest.fn().mockResolvedValue([{ _id: 'message-1' }]),
      });
      const res = mockRes();

      await handlers.getSessionLink(mockReq({ params: { conversationId: 'conversation-1' } }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        url: 'https://cloud.langfuse.com/project/project-1/sessions/conversation-1',
      });
      expect(deps.getMessages).toHaveBeenCalledWith(
        {
          user: 'u1',
          conversationId: 'conversation-1',
          langfuseSampled: true,
          langfuseDestinationIds: getLangfuseDestinationId(
            'https://cloud.langfuse.com',
            'project-1',
          ),
        },
        '_id',
        { sort: false, limit: 1 },
      );
    });

    it("links to the tenant project resolved from that tenant's API keys in fanout mode", async () => {
      let persistedConfig: ReturnType<typeof baseConfigDoc> | null = null;
      const findConfigByPrincipal = jest
        .fn()
        .mockImplementation(() => Promise.resolve(persistedConfig));
      const mutateConfigWithRevision = jest.fn().mockImplementation(({ op }) => {
        persistedConfig = baseConfigDoc(rehydrate(op.fields));
        return Promise.resolve({
          changed: true,
          config: persistedConfig,
          revision: { id: 'rev1' },
        });
      });
      const getMessages = jest.fn().mockResolvedValue([{ _id: 'message-1' }]);
      global.fetch = jest
        .fn()
        .mockResolvedValue(projectResponse('tenant-project-1')) as unknown as typeof fetch;
      const { handlers } = createHandlers({
        findConfigByPrincipal,
        mutateConfigWithRevision,
        getMessages,
      });

      const updateRes = mockRes();
      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-tenant',
            secretKey: 'sk-lf-tenant',
            expectedVersion: null,
          },
        }),
        updateRes,
      );

      expect(updateRes.statusCode).toBe(200);
      const [projectsUrl, projectsInit] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      expect(projectsUrl).toBe('https://cloud.langfuse.com/api/public/projects');
      expect(
        Buffer.from(projectsInit.headers.Authorization.replace('Basic ', ''), 'base64').toString(),
      ).toBe('pk-lf-tenant:sk-lf-tenant');
      expect(mutateConfigWithRevision.mock.calls[0][0].op.fields['langfuse.projectId']).toBe(
        'tenant-project-1',
      );

      const linkRes = mockRes();
      await handlers.getSessionLink(
        mockReq({ params: { conversationId: 'conversation-1' } }),
        linkRes,
      );

      expect(linkRes.body).toEqual({
        url: 'https://cloud.langfuse.com/project/tenant-project-1/sessions/conversation-1',
      });
      expect(getMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          langfuseDestinationIds: getLangfuseDestinationId(
            'https://cloud.langfuse.com',
            'tenant-project-1',
          ),
        }),
        '_id',
        { sort: false, limit: 1 },
      );
    });

    it('preserves a destination base path in the session URL', async () => {
      process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL = 'https://langfuse.example/base/path';
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(baseConfigDoc(storedConnection)),
        getMessages: jest.fn().mockResolvedValue([{ _id: 'message-1' }]),
      });
      const res = mockRes();

      await handlers.getSessionLink(mockReq({ params: { conversationId: 'conversation-1' } }), res);

      expect(res.body).toEqual({
        url: 'https://langfuse.example/base/path/project/project-1/sessions/conversation-1',
      });
    });

    it('returns 401 when the authenticated user is missing', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.getSessionLink(
        mockReq({ user: undefined, params: { conversationId: 'conversation-1' } }),
        res,
      );

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Authentication required' });
    });

    it('does not link a conversation without a sampled message for the current project', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(baseConfigDoc(storedConnection)),
      });
      const res = mockRes();

      await handlers.getSessionLink(mockReq({ params: { conversationId: 'conversation-1' } }), res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ url: null });
      expect(deps.getMessages).toHaveBeenCalledTimes(1);
    });

    it('does not query messages when the saved connection is disabled', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(baseConfigDoc({ ...storedConnection, enabled: false })),
      });
      const res = mockRes();

      await handlers.getSessionLink(mockReq({ params: { conversationId: 'conversation-1' } }), res);

      expect(res.body).toEqual({ url: null });
      expect(deps.getMessages).not.toHaveBeenCalled();
    });
  });

  describe('updateConnection', () => {
    it('requires an expectedVersion', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'expectedVersion must be a non-negative integer or null',
      });
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it.each([-1, 1.5, 'not-a-number', NaN, undefined])(
      'rejects an invalid expectedVersion (%p)',
      async (expectedVersion) => {
        const { handlers, deps } = createHandlers();
        const res = mockRes();
        await handlers.updateConnection(
          mockReq({
            body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk', expectedVersion },
          }),
          res,
        );
        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
          error: 'expectedVersion must be a non-negative integer or null',
        });
        expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
      },
    );

    it('requires destination', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { publicKey: 'pk', expectedVersion: null } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('requires publicKey', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { destination: 'eu', expectedVersion: null } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown destination', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({
          body: { destination: 'mars', publicKey: 'pk', secretKey: 'sk', expectedVersion: null },
        }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects encrypted secret values from clients', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({
          body: {
            destination: 'eu',
            publicKey: 'pk',
            secretKey: encryptV3('sk'),
            expectedVersion: null,
          },
        }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('requires a secret key on first-time configuration', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { destination: 'eu', publicKey: 'pk', expectedVersion: null } }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('stores the secret through the shared config secret helper and never returns the secret', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      const fields = deps.mutateConfigWithRevision.mock.calls[0][0].op.fields;
      expect(fields['langfuse.secretKey']).toMatch(/^v3:/);
      expect(fields['langfuse.secretKey']).not.toContain('sk-lf-secret');
      expect(fields['langfuse.secretKeyPreview']).toBe('sk-lf-...cret');
      expect(fields['langfuse.enabled']).toBe(true);
      expect(fields['langfuse.destination']).toBe('eu');
      expect(fields['langfuse.publicKey']).toBe('pk-lf-1');
      expect(fields['langfuse.projectId']).toBe('project-1');
      expect(res.body?.secretKey).toBeUndefined();
      expect(deps.invalidateConfigCaches).toHaveBeenCalledWith('t1');
      expect(deps.recordConnectionUpdate).toHaveBeenCalledWith({
        event_name: 'librechat.langfuse.connection.changed',
        tenant_id: 't1',
        configured: true,
        enabled: true,
        destination: 'eu',
        change: 'created',
        changes: ['created'],
        verification_result: 'success',
      });
      expect(JSON.stringify(deps.recordConnectionUpdate.mock.calls)).not.toContain('sk-lf-secret');
      expect(JSON.stringify(deps.recordConnectionUpdate.mock.calls)).not.toContain('pk-lf-1');
    });

    it('passes an explicit trusted opt-in for the protected langfuse section, or the write is silently discarded', async () => {
      // `langfuse` is a base-principal-protected section — mutateConfigWithRevision
      // preserves/strips it back to the current value on every call UNLESS the
      // caller passes trustedBasePrincipalSections. Without this, the atomic
      // write still succeeds and bumps configVersion, but the connection change
      // never actually persists.
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].trustedBasePrincipalSections).toEqual([
        'langfuse',
      ]);
    });

    it('requires a new secret when connection fields change', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(baseConfigDoc({ secretKey: encryptV3('sk-lf-secret') })),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: { enabled: false, destination: 'us', publicKey: 'pk-2', expectedVersion: 0 },
        }),
        res,
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'secretKey is required when changing the destination or publicKey',
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('returns 409 before validating a stale request against rotated credentials', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          ...baseConfigDoc({
            destination: 'us',
            publicKey: 'pk-new',
            secretKey: encryptV3('sk-new'),
          }),
          configVersion: 2,
        }),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: false,
            destination: 'eu',
            publicKey: 'pk-old',
            expectedVersion: 1,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 2 });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('verifies changed connection fields with the submitted secret', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          baseConfigDoc({
            destination: 'eu',
            publicKey: 'pk-1',
            secretKey: encryptV3('sk-lf-secret'),
          }),
        ),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'us',
            publicKey: 'pk-2',
            secretKey: 'sk-lf-replacement',
            expectedVersion: 0,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      const fields = deps.mutateConfigWithRevision.mock.calls[0][0].op.fields;
      expect(fields['langfuse.destination']).toBe('us');
      expect(fields['langfuse.publicKey']).toBe('pk-2');
      expect(fields['langfuse.projectId']).toBe('project-1');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      expect(url).toBe('https://us.cloud.langfuse.com/api/public/projects');
      expect(
        Buffer.from(init.headers.Authorization.replace('Basic ', ''), 'base64').toString(),
      ).toBe('pk-2:sk-lf-replacement');
    });

    it('rejects changed credentials before persisting when Langfuse verification fails', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-invalid',
            secretKey: 'sk-invalid',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Langfuse rejected these keys. Check the destination and keys',
      });
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
      expect(deps.recordConnectionUpdate).not.toHaveBeenCalled();
    });

    it('rejects credentials when Langfuse does not return a stable project identity', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: [] }),
      }) as unknown as typeof fetch;
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'Langfuse did not return a project identity' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('does not re-verify a pure enable or disable update', async () => {
      const stored = {
        enabled: false,
        destination: 'eu',
        publicKey: 'pk-lf-1',
        secretKey: encryptV3('sk-lf-secret'),
        projectId: 'project-1',
      };
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(baseConfigDoc(stored)),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: { enabled: true, destination: 'eu', publicKey: 'pk-lf-1', expectedVersion: 0 },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deps.mutateConfigWithRevision).toHaveBeenCalledTimes(1);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].op.fields['langfuse.enabled']).toBe(
        true,
      );
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].op.fields['langfuse.projectId']).toBe(
        'project-1',
      );
      expect(deps.recordConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't1',
          change: 'enabled',
          changes: ['enabled'],
          verification_result: 'skipped',
        }),
      );
    });

    it('allows an existing connection to be disabled after its destination is removed', async () => {
      const stored = {
        enabled: true,
        destination: 'removed-destination',
        publicKey: 'pk-lf-1',
        secretKey: encryptV3('sk-lf-secret'),
      };
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(baseConfigDoc(stored)),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: false,
            destination: 'removed-destination',
            publicKey: 'pk-lf-1',
            expectedVersion: 0,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deps.mutateConfigWithRevision).toHaveBeenCalledTimes(1);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].op.fields).toMatchObject({
        'langfuse.enabled': false,
        'langfuse.destination': 'removed-destination',
        'langfuse.publicKey': 'pk-lf-1',
      });
    });

    it('rejects enabling an inactive base config', async () => {
      const inactiveExisting = {
        ...baseConfigDoc({
          enabled: false,
          destination: 'eu',
          publicKey: 'pk-lf-1',
          secretKey: encryptV3('sk-lf-secret'),
        }),
        isActive: false,
      };
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(inactiveExisting),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            expectedVersion: 0,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({
        error: 'The base configuration is inactive; activate it before enabling Langfuse',
      });
      expect(global.fetch).not.toHaveBeenCalled();
      expect(deps.mutateConfigWithRevision).not.toHaveBeenCalled();
    });

    it('updates an inactive connection without bypassing lifecycle authorization', async () => {
      const inactiveUpdated = {
        ...baseConfigDoc({
          enabled: false,
          destination: 'eu',
          publicKey: 'pk-lf-1',
          secretKey: encryptV3('sk-lf-secret'),
        }),
        isActive: false,
      };
      const inactiveExisting = {
        ...inactiveUpdated,
        isActive: false,
        priority: 42,
      };
      const mutateConfigWithRevision = jest
        .fn()
        .mockResolvedValue({ changed: true, config: inactiveUpdated, revision: { id: 'rev1' } });
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(inactiveExisting),
        mutateConfigWithRevision,
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: false,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            expectedVersion: 0,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(deps.findConfigByPrincipal).toHaveBeenCalledWith('role', '__base__', {
        includeInactive: true,
        tenantId: 't1',
      });
      const [params] = mutateConfigWithRevision.mock.calls[0];
      expect(params.op.priority).toBe(42);
      expect(params.op).not.toHaveProperty('isActive');
      expect(params.op.fields['langfuse.enabled']).toBe(false);
      expect(res.body).toMatchObject({ configured: true, enabled: false, configActive: false });
    });

    it('forwards the client-supplied expectedVersion to the atomic mutation', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          ...baseConfigDoc({}),
          configVersion: 7,
        }),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: 7,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].expectedVersion).toBe(7);
    });

    it('uses the ALS-resolved request tenant, not the user claim, for the actor, audit event, and cache invalidation', async () => {
      const invalidateConfigCaches = jest.fn().mockResolvedValue(undefined);
      const { handlers, deps } = createHandlers({ invalidateConfigCaches });
      const req = mockReq({
        user: { id: 'u1', role: 'ADMIN', tenantId: 'user-claim-tenant' },
        body: {
          enabled: true,
          destination: 'eu',
          publicKey: 'pk-lf-1',
          secretKey: 'sk-lf-secret',
          expectedVersion: null,
          expectedTenantId: 'als-resolved-tenant',
        },
      });
      const res = mockRes();

      // The tenant middleware resolves a DIFFERENT effective tenant into ALS
      // than the user's own tenantId claim — e.g. after normalization. Every
      // tenant-scoped operation in this request must agree on ALS, not the
      // claim, or the config write and its revision end up scoped to
      // different tenants.
      await tenantStorage.run({ tenantId: 'als-resolved-tenant' }, async () => {
        await handlers.updateConnection(req, res);
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
      expect(deps.recordConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'als-resolved-tenant' }),
      );
      expect(invalidateConfigCaches).toHaveBeenCalledWith('als-resolved-tenant');
    });

    it('falls back to the user tenant claim when ALS has no resolved tenant', async () => {
      const invalidateConfigCaches = jest.fn().mockResolvedValue(undefined);
      const { handlers, deps } = createHandlers({ invalidateConfigCaches });
      const req = mockReq({
        user: { id: 'u1', role: 'ADMIN', tenantId: 'user-claim-tenant' },
        body: {
          enabled: true,
          destination: 'eu',
          publicKey: 'pk-lf-1',
          secretKey: 'sk-lf-secret',
          expectedVersion: null,
        },
      });
      const res = mockRes();

      await handlers.updateConnection(req, res);

      expect(res.statusCode).toBe(200);
      expect(deps.mutateConfigWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({ tenantId: 'user-claim-tenant' }),
        }),
      );
      expect(invalidateConfigCaches).toHaveBeenCalledWith('user-claim-tenant');
    });

    it('creates a first-ever base document at priority 0, not the default role-profile priority', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].op.priority).toBe(0);
    });

    it('preserves an existing base document priority instead of overwriting it', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          ...baseConfigDoc({}),
          priority: 42,
        }),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: 0,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(deps.mutateConfigWithRevision.mock.calls[0][0].op.priority).toBe(42);
    });

    it('returns 409 with the current version when the atomic mutation reports a stale expectedVersion', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue({
          ...baseConfigDoc({}),
          configVersion: 3,
        }),
        mutateConfigWithRevision: jest.fn().mockRejectedValue(new ConfigVersionConflictError(9)),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: 3,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: 'Config version conflict', currentVersion: 9 });
    });

    it('returns 503 when MongoDB transactions are unavailable', async () => {
      const transactionError = Object.assign(
        new Error('Atomic config mutations require MongoDB replica-set transaction support'),
        { name: 'TransactionRequiredError' },
      );
      const { handlers } = createHandlers({
        mutateConfigWithRevision: jest.fn().mockRejectedValue(transactionError),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            destination: 'eu',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
            expectedVersion: null,
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: transactionError.message });
    });
  });

  describe('testConnection', () => {
    it('requires destination and publicKey', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.testConnection(mockReq({ body: { destination: 'eu' } }), res);
      expect(res.statusCode).toBe(400);
    });

    it('rejects an unknown destination', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.testConnection(
        mockReq({ body: { destination: 'mars', publicKey: 'pk', secretKey: 'sk' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects encrypted secret values from clients', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.testConnection(
        mockReq({ body: { destination: 'eu', publicKey: 'pk', secretKey: encryptV3('sk') } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns success when Langfuse responds ok', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({ success: true });
      const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      expect(url).toBe('https://cloud.langfuse.com/api/public/projects');
      expect(init.headers.Authorization).toMatch(/^Basic /);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const [publicUrl, publicInit] = (global.fetch as unknown as jest.Mock).mock.calls[1];
      expect(publicUrl).toBe('https://cloud.langfuse.com/api/public/ingestion');
      expect(publicInit.method).toBe('POST');
      expect(publicInit.headers.Authorization).toBe('Bearer pk');
      expect(publicInit.headers['X-Langfuse-Public-Key']).toBe('pk');
      expect(publicInit.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(publicInit.body)).toEqual({ batch: [] });
      expect(publicInit.signal).toBe(init.signal);
    });

    it('returns a timeout failure when Langfuse verification exceeds its deadline', async () => {
      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockRejectedValueOnce(timeoutError) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({
        success: false,
        errorCode: 'timeout',
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects an invalid public key even when the secret key is valid', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: false, status: 401 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk-invalid', secretKey: 'sk-valid' },
        }),
        res,
      );

      expect(res.body).toEqual({
        success: false,
        errorCode: 'invalid_credentials',
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns a key-specific failure when Langfuse rejects the credentials', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({
        success: false,
        errorCode: 'invalid_credentials',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('returns an incident-oriented failure when Langfuse returns a server error', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({
        success: false,
        errorCode: 'server_error',
      });
    });

    it.each([
      [403, 'access_denied'],
      [429, 'rate_limited'],
      [400, 'unexpected_response'],
    ])('maps Langfuse status %i to %s', async (status, errorCode) => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({ success: false, errorCode });
    });

    it('falls back to the stored secret only for the unchanged connection', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          baseConfigDoc({
            destination: 'eu',
            publicKey: 'pk',
            secretKey: encryptV3('sk-stored'),
          }),
        ),
      });
      const res = mockRes();

      await handlers.testConnection(mockReq({ body: { destination: 'eu', publicKey: 'pk' } }), res);

      expect(res.body).toEqual({ success: true });
      const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      const decoded = Buffer.from(
        init.headers.Authorization.replace('Basic ', ''),
        'base64',
      ).toString();
      expect(decoded).toBe('pk:sk-stored');
    });

    it('does not reuse the stored secret for a changed connection test', async () => {
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          baseConfigDoc({
            destination: 'eu',
            publicKey: 'pk-old',
            secretKey: encryptV3('sk-stored'),
          }),
        ),
      });
      const res = mockRes();

      await handlers.testConnection(
        mockReq({ body: { destination: 'us', publicKey: 'pk-new' } }),
        res,
      );

      expect(res.body).toEqual({ success: false, errorCode: 'missing_secret' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends the deployment headers on both verification requests', async () => {
      /** Single-tenant topology with one configured Langfuse origin — the
       *  self-hosted-behind-a-proxy case — so the header map is unambiguous. */
      delete process.env.TENANT_ISOLATION_STRICT;
      delete process.env.LANGFUSE_FANOUT_ENABLED;
      delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
      process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL = 'https://eu.langfuse.internal';
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
          config: { langfuse: { headers: { 'CF-Access-Client-Id': 'proxy-client' } } },
        }),
        res,
      );

      expect(res.body).toEqual({ success: true });
      const [, projectsInit] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      expect(projectsInit.headers['CF-Access-Client-Id']).toBe('proxy-client');
      expect(projectsInit.headers.Authorization).toMatch(/^Basic /);
      const [, ingestionInit] = (global.fetch as unknown as jest.Mock).mock.calls[1];
      expect(ingestionInit.headers['CF-Access-Client-Id']).toBe('proxy-client');
      expect(ingestionInit.headers.Authorization).toBe('Bearer pk');
      delete process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL;
    });

    it('withholds deployment headers when several Langfuse origins are configured', async () => {
      /** The collector from `beforeEach` plus an explicit tenant URL: the map
       *  does not say which of them it authenticates to, so neither gets it. */
      process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL = 'https://eu.langfuse.internal';
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
          config: { langfuse: { headers: { 'CF-Access-Client-Id': 'ambiguous-token' } } },
        }),
        res,
      );

      expect(JSON.stringify((global.fetch as unknown as jest.Mock).mock.calls)).not.toContain(
        'ambiguous-token',
      );
      delete process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL;
    });

    it('withholds deployment headers when verifying an unconfigured destination', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(projectResponse())
        .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
          config: { langfuse: { headers: { 'CF-Access-Client-Id': 'internal-gateway' } } },
        }),
        res,
      );

      /** `eu` here is the built-in Langfuse Cloud default; an admin selecting it
       *  must not ship the internal gateway credential to that origin. */
      const calls = (global.fetch as unknown as jest.Mock).mock.calls;
      expect(JSON.stringify(calls)).not.toContain('internal-gateway');
    });

    it.each(['Authorization', 'authorization'])(
      'keeps the Langfuse authorization when a deployment %s header collides',
      async (headerName) => {
        global.fetch = jest
          .fn()
          .mockResolvedValueOnce(projectResponse())
          .mockResolvedValueOnce({ ok: true, status: 207 }) as unknown as typeof fetch;
        const { handlers } = createHandlers();
        const res = mockRes();

        delete process.env.TENANT_ISOLATION_STRICT;
        delete process.env.LANGFUSE_FANOUT_ENABLED;
        delete process.env.LANGFUSE_FANOUT_COLLECTOR_URL;
        process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL = 'https://eu.langfuse.internal';
        await handlers.testConnection(
          mockReq({
            body: { destination: 'eu', publicKey: 'pk', secretKey: 'sk' },
            config: { langfuse: { headers: { [headerName]: 'Bearer proxy-token' } } },
          }),
          res,
        );
        delete process.env.LANGFUSE_FANOUT_TENANT_EU_BASE_URL;

        const [, projectsInit] = (global.fetch as unknown as jest.Mock).mock.calls[0];
        const headers = projectsInit.headers as Record<string, string>;
        /** A surviving case variant would be appended by fetch rather than
         *  replaced, sending both credentials in one combined value. */
        expect(
          Object.keys(headers).filter((key) => key.toLowerCase() === 'authorization'),
        ).toHaveLength(1);
        expect(Object.values(headers)).not.toContain('Bearer proxy-token');
        expect(Object.values(headers).some((value) => value.startsWith('Basic '))).toBe(true);
      },
    );
  });
});
