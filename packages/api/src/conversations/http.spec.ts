import express from 'express';
import request from 'supertest';
import { Readable } from 'stream';
import type { ConversationImportHandlerDeps } from './http';
import { ConversationImportError, createConversationImportOperation } from './import';
import { createConversationImportHandler, createConversationTagAccess } from './http';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function createUpload(): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'upload.json',
    encoding: '7bit',
    mimetype: 'application/json',
    size: 1,
    stream: Readable.from([]),
    destination: '/tmp',
    filename: 'upload.json',
    path: '/tmp/upload.json',
    buffer: Buffer.alloc(0),
  };
}

async function runHandler(
  body: object,
  deps: ConversationImportHandlerDeps,
  principal = { id: 'owner', role: 'USER' },
): Promise<request.Response> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.file = createUpload();
    req.user = principal;
    Object.assign(req, { config: {} });
    next();
  });
  app.post('/', createConversationImportHandler(deps));
  return request(app).post('/').send(body);
}

describe('conversation management import HTTP handler', () => {
  it('rejects request-level ownership and unknown controls and removes the upload', async () => {
    const deps = {
      importConversations: jest.fn().mockResolvedValue(undefined),
      cleanupUpload: jest.fn().mockResolvedValue(undefined),
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { BOOKMARKS: { USE: true } },
      }),
    };

    const result = await runHandler({ user: 'forged', tenantId: 'foreign' }, deps);

    expect(result.status).toBe(400);
    expect(result.body).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'invalid_request' }),
      }),
    );
    expect(deps.importConversations).not.toHaveBeenCalled();
    expect(deps.cleanupUpload).toHaveBeenCalledWith('/tmp/upload.json');
  });

  it('still rejects the request if cleanup of invalid fields fails', async () => {
    const deps = {
      importConversations: jest.fn().mockResolvedValue(undefined),
      cleanupUpload: jest.fn().mockRejectedValue(new Error('unlink failed')),
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { BOOKMARKS: { USE: true } },
      }),
    };

    const result = await runHandler({ owner: 'forged' }, deps);

    expect(result.status).toBe(400);
    expect(deps.importConversations).not.toHaveBeenCalled();
  });

  it('passes a file-only request to the strict LibreChat import operation', async () => {
    const deps = {
      importConversations: jest.fn().mockResolvedValue(undefined),
      cleanupUpload: jest.fn().mockResolvedValue(undefined),
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { BOOKMARKS: { USE: true } },
      }),
    };

    const result = await runHandler({}, deps);

    expect(result.status).toBe(201);
    expect(deps.importConversations).toHaveBeenCalledWith(
      expect.objectContaining({
        filepath: '/tmp/upload.json',
        requestUserId: 'owner',
        format: 'librechat',
        allowTags: true,
      }),
    );
    expect(deps.cleanupUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['management', { id: 'management-owner', role: 'MANAGEMENT_NO_BOOKMARKS' }],
    ['remote OIDC', { id: 'oidc-owner', role: 'OIDC_NO_BOOKMARKS' }],
  ])(
    'rejects tagged imports for a denied %s principal before importer execution',
    async (_source, principal) => {
      const unlinkFile = jest.fn().mockResolvedValue(undefined);
      const getImporter = jest.fn();
      const importConversations = createConversationImportOperation({
        statFile: jest.fn().mockResolvedValue({ size: 256 }),
        readFile: jest.fn().mockResolvedValue(
          JSON.stringify({
            conversationId: 'source-conversation',
            options: { endpoint: 'openAI', tags: ['restricted'] },
            messages: [],
          }),
        ),
        unlinkFile,
        getImporter,
        createBuilder: jest.fn(),
      });
      const deps = {
        importConversations,
        cleanupUpload: jest.fn().mockResolvedValue(undefined),
        getRoleByName: jest.fn().mockResolvedValue({
          permissions: { BOOKMARKS: { USE: false } },
        }),
      };

      const result = await runHandler({}, deps, principal);

      expect(result.status).toBe(403);
      expect(result.body).toEqual({
        error: { code: 'permission_denied', message: 'Permission denied' },
      });
      expect(getImporter).not.toHaveBeenCalled();
      expect(unlinkFile).toHaveBeenCalledWith('/tmp/upload.json');
      expect(deps.getRoleByName).toHaveBeenCalledWith(principal.role);
    },
  );

  it('allows an untagged import when the principal lacks bookmark access', async () => {
    const importer = jest.fn().mockResolvedValue(undefined);
    const importConversations = createConversationImportOperation({
      statFile: jest.fn().mockResolvedValue({ size: 256 }),
      readFile: jest.fn().mockResolvedValue(
        JSON.stringify({
          conversationId: 'source-conversation',
          options: { endpoint: 'openAI' },
          messages: [],
        }),
      ),
      unlinkFile: jest.fn().mockResolvedValue(undefined),
      getImporter: jest.fn().mockReturnValue(importer),
      createBuilder: jest.fn(),
    });
    const deps = {
      importConversations,
      cleanupUpload: jest.fn().mockResolvedValue(undefined),
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { BOOKMARKS: { USE: false } },
      }),
    };

    const result = await runHandler({}, deps);

    expect(result.status).toBe(201);
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('returns invalid_request before importer execution for malformed message values', async () => {
    const getImporter = jest.fn();
    const importConversations = createConversationImportOperation({
      statFile: jest.fn().mockResolvedValue({ size: 256 }),
      readFile: jest.fn().mockResolvedValue(
        JSON.stringify({
          conversationId: 'source-conversation',
          options: { endpoint: 'openAI' },
          messages: [
            {
              messageId: 'message-a',
              conversationId: 'source-conversation',
              parentMessageId: null,
              text: 'hello',
              isCreatedByUser: true,
              createdAt: 'not-a-date',
            },
          ],
        }),
      ),
      unlinkFile: jest.fn().mockResolvedValue(undefined),
      getImporter,
      createBuilder: jest.fn(),
    });
    const result = await runHandler(
      {},
      {
        importConversations,
        cleanupUpload: jest.fn().mockResolvedValue(undefined),
        getRoleByName: jest.fn().mockResolvedValue({
          permissions: { BOOKMARKS: { USE: true } },
        }),
      },
    );

    expect(result.status).toBe(400);
    expect(result.body).toEqual({
      error: { code: 'invalid_request', message: 'Invalid request' },
    });
    expect(getImporter).not.toHaveBeenCalled();
  });

  it('preserves the import error status while retaining the public error envelope', async () => {
    const deps = {
      importConversations: jest
        .fn()
        .mockRejectedValue(new ConversationImportError('oversized', { statusCode: 413 })),
      cleanupUpload: jest.fn().mockResolvedValue(undefined),
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { BOOKMARKS: { USE: true } },
      }),
    };

    const result = await runHandler({}, deps);

    expect(result.status).toBe(413);
    expect(result.body).toEqual({
      error: { code: 'invalid_request', message: 'Invalid request' },
    });
  });
});

describe('conversation tag access envelope', () => {
  it.each([
    { allowed: false, body: { tags: ['red'] }, status: 403, code: 'permission_denied' },
    { allowed: true, body: { tags: ['red'] }, status: 200, code: undefined },
    { allowed: false, body: { title: 'Hello' }, status: 200, code: undefined },
    { allowed: 'error', body: { tags: ['red'] }, status: 500, code: 'internal_error' },
  ])('maps access outcome $allowed for $body', async ({ allowed, body, status, code }) => {
    const getRoleByName = jest.fn();
    if (allowed === 'error') getRoleByName.mockRejectedValue(new Error('role unavailable'));
    else getRoleByName.mockResolvedValue({ permissions: { BOOKMARKS: { USE: allowed } } });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'owner', role: 'USER' };
      next();
    });
    app.patch('/', createConversationTagAccess({ getRoleByName }), (_req, res) => {
      res.json({ saved: true });
    });
    const result = await request(app).patch('/').send(body);
    expect(result.status).toBe(status);
    if (code) expect(result.body.error.code).toBe(code);
    if (status === 403)
      expect(result.body).toEqual({
        error: { code: 'permission_denied', message: 'Permission denied' },
      });
    if ('title' in body) expect(getRoleByName).not.toHaveBeenCalled();
  });
});
