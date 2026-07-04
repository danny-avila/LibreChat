process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

// Loaded via dynamic import in beforeAll so the crypto module initializes
// after CREDS_KEY is set above (encryptV3 reads the key at module load).
let encryptV3: typeof import('@librechat/data-schemas').encryptV3;
let createAdminLangfuseHandlers: typeof import('./langfuse').createAdminLangfuseHandlers;

beforeAll(async () => {
  ({ encryptV3 } = await import('@librechat/data-schemas'));
  ({ createAdminLangfuseHandlers } = await import('./langfuse'));
});

function mockReq(overrides = {}) {
  return {
    user: { id: 'u1', role: 'ADMIN', tenantId: 't1' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Partial<ServerRequest> as ServerRequest;
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
    overrides: { langfuse },
    updatedAt: new Date('2026-06-29T00:00:00.000Z'),
  };
}

function createHandlers(overrides = {}) {
  const deps = {
    findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    patchConfigFields: jest
      .fn()
      .mockImplementation((_pt, _pid, _pm, fields) =>
        Promise.resolve(baseConfigDoc(rehydrate(fields))),
      ),
    invalidateConfigCaches: jest.fn().mockResolvedValue(undefined),
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
            baseUrl: 'https://cloud.langfuse.com',
            publicKey: 'pk-lf-1',
            secretKey: encryptV3('sk-lf-secret'),
            secretKeyFingerprint: 'abc123def456',
          }),
        ),
      });
      const res = mockRes();

      await handlers.getConnection(mockReq(), res);

      expect(res.body).toMatchObject({
        configured: true,
        enabled: true,
        baseUrl: 'https://cloud.langfuse.com',
        publicKey: 'pk-lf-1',
        secretKeyFingerprint: 'abc123def456',
      });
      expect(res.body?.secretKey).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('sk-lf-secret');
      expect(JSON.stringify(res.body)).not.toContain('v3:');
    });
  });

  describe('updateConnection', () => {
    it('requires baseUrl', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(mockReq({ body: { publicKey: 'pk' } }), res);
      expect(res.statusCode).toBe(400);
    });

    it('requires publicKey', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { baseUrl: 'https://cloud.langfuse.com' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid baseUrl', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { baseUrl: 'not-a-url', publicKey: 'pk', secretKey: 'sk' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('requires a secret key on first-time configuration', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();
      await handlers.updateConnection(
        mockReq({ body: { baseUrl: 'https://cloud.langfuse.com', publicKey: 'pk' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
      expect(deps.patchConfigFields).not.toHaveBeenCalled();
    });

    it('encrypts the secret key, stores a fingerprint, and never returns the secret', async () => {
      const { handlers, deps } = createHandlers();
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: {
            enabled: true,
            baseUrl: 'https://cloud.langfuse.com',
            publicKey: 'pk-lf-1',
            secretKey: 'sk-lf-secret',
          },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      const fields = deps.patchConfigFields.mock.calls[0][3];
      expect(fields['langfuse.secretKey']).toMatch(/^v3:/);
      expect(fields['langfuse.secretKey']).not.toContain('sk-lf-secret');
      expect(fields['langfuse.secretKeyFingerprint']).toMatch(/^[a-f0-9]{12}$/);
      expect(fields['langfuse.enabled']).toBe(true);
      expect(fields['langfuse.publicKey']).toBe('pk-lf-1');
      expect(res.body?.secretKey).toBeUndefined();
      expect(deps.invalidateConfigCaches).toHaveBeenCalledWith('t1');
    });

    it('allows updating metadata without resupplying the secret when one is stored', async () => {
      const { handlers, deps } = createHandlers({
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(baseConfigDoc({ secretKey: encryptV3('sk-lf-secret') })),
      });
      const res = mockRes();

      await handlers.updateConnection(
        mockReq({
          body: { enabled: false, baseUrl: 'https://us.cloud.langfuse.com', publicKey: 'pk-2' },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      const fields = deps.patchConfigFields.mock.calls[0][3];
      expect(fields['langfuse.secretKey']).toBeUndefined();
      expect(fields['langfuse.publicKey']).toBe('pk-2');
    });
  });

  describe('testConnection', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it('requires baseUrl and publicKey', async () => {
      const { handlers } = createHandlers();
      const res = mockRes();
      await handlers.testConnection(
        mockReq({ body: { baseUrl: 'https://cloud.langfuse.com' } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    });

    it('returns success when Langfuse responds ok', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { baseUrl: 'https://cloud.langfuse.com', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body).toEqual({ success: true });
      const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      expect(url).toBe('https://cloud.langfuse.com/api/public/projects');
      expect(init.headers.Authorization).toMatch(/^Basic /);
    });

    it('returns failure with status when Langfuse rejects the credentials', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
      const { handlers } = createHandlers();
      const res = mockRes();

      await handlers.testConnection(
        mockReq({
          body: { baseUrl: 'https://cloud.langfuse.com', publicKey: 'pk', secretKey: 'sk' },
        }),
        res,
      );

      expect(res.body?.success).toBe(false);
      expect(res.body?.message).toContain('401');
    });

    it('falls back to the stored (decrypted) secret when none is supplied', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
      const { handlers } = createHandlers({
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(baseConfigDoc({ secretKey: encryptV3('sk-stored') })),
      });
      const res = mockRes();

      await handlers.testConnection(
        mockReq({ body: { baseUrl: 'https://cloud.langfuse.com', publicKey: 'pk' } }),
        res,
      );

      expect(res.body).toEqual({ success: true });
      const [, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
      const decoded = Buffer.from(
        init.headers.Authorization.replace('Basic ', ''),
        'base64',
      ).toString();
      expect(decoded).toBe('pk:sk-stored');
    });
  });
});
