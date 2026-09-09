import { MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH } from 'librechat-data-provider';
import type { Response } from 'express';
import { createProjectHandlers } from './handlers';

const projectId = '507f1f77bcf86cd799439011';

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 'owner', tenantId: 'tenant-a' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as never;
}

function response() {
  const result = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: jest.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return res;
    }),
    json: jest.fn((body: unknown) => {
      result.body = body;
      return res;
    }),
  } as unknown as Response;
  return { res, result };
}

function setup(overrides: Partial<Parameters<typeof createProjectHandlers>[0]> = {}) {
  const deps = {
    listChatProjects: jest.fn(),
    createChatProject: jest.fn().mockResolvedValue({ _id: projectId }),
    getChatProject: jest.fn().mockResolvedValue({ _id: projectId, file_ids: [] }),
    updateChatProject: jest.fn().mockResolvedValue({ _id: projectId }),
    deleteChatProject: jest.fn().mockResolvedValue({ deletedCount: 1, modifiedCount: 1 }),
    assignConversationToProject: jest.fn(),
    addChatProjectFile: jest.fn(),
    removeChatProjectFile: jest.fn(),
    getFiles: jest.fn().mockResolvedValue([]),
    getAvailableProjectFiles: jest.fn().mockResolvedValue({ files: [], nextCursor: null }),
    ...overrides,
  };
  return { handlers: createProjectHandlers(deps), deps };
}

describe('ChatProject handlers', () => {
  it.each([
    ['non-string', 42],
    ['oversized', 'x'.repeat(MAX_CHAT_PROJECT_INSTRUCTIONS_LENGTH + 1)],
  ])('rejects %s instructions on create before persistence', async (_label, instructions) => {
    const { handlers, deps } = setup();
    const { res, result } = response();
    await handlers.createProject(request({ body: { name: 'Project', instructions } }), res);
    expect(result.statusCode).toBe(400);
    expect(deps.createChatProject).not.toHaveBeenCalled();
  });

  it('rejects invalid update instructions before persistence', async () => {
    const { handlers, deps } = setup();
    const { res, result } = response();
    await handlers.updateProject(
      request({ params: { projectId }, body: { instructions: null } }),
      res,
    );
    expect(result.statusCode).toBe(400);
    expect(deps.updateChatProject).not.toHaveBeenCalled();
  });

  it('surfaces atomic resource errors without pretending the attach succeeded', async () => {
    const { handlers } = setup({
      addChatProjectFile: jest.fn().mockRejectedValue(new Error('Project file limit reached')),
    });
    const { res, result } = response();
    await handlers.addProjectFile(
      request({ params: { projectId }, body: { file_id: 'file-1' } }),
      res,
    );
    expect(result.statusCode).toBe(409);
    expect(result.body).toEqual({ error: 'Project file limit reached' });
  });

  it('keeps missing resource references as unavailable placeholders', async () => {
    const { handlers } = setup({
      getChatProject: jest.fn().mockResolvedValue({ _id: projectId, file_ids: ['gone'] }),
    });
    const { res, result } = response();
    await handlers.listProjectFiles(request({ params: { projectId } }), res);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual([{ file_id: 'gone', availability: 'unavailable' }]);
  });

  it('excludes extracted text from available-file metadata', async () => {
    const file = {
      file_id: 'candidate',
      filename: 'candidate.txt',
      filepath: '/uploads/candidate.txt',
      object: 'file',
      type: 'text/plain',
      bytes: 10,
      usage: 0,
      embedded: true,
      context: 'message_attachment',
      user: 'owner',
      tenantId: 'tenant-a',
      text: 'must not be returned',
    };
    const { handlers } = setup({
      getChatProject: jest.fn().mockResolvedValue({
        _id: projectId,
        tenantId: 'tenant-a',
        file_ids: ['attached'],
      }),
      getAvailableProjectFiles: jest.fn().mockResolvedValue({
        files: [file],
        nextCursor: 'next',
      }),
    });
    const { res, result } = response();

    await handlers.listAvailableProjectFiles(
      request({
        params: { projectId },
        query: { limit: '2', cursor: projectId, search: 'candidate' },
      }),
      res,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ files: [{ file_id: 'candidate' }] });
    expect(result.body).not.toHaveProperty('files.0.text');
  });

  it.each([{ limit: '0' }, { limit: '51' }, { limit: '1.5' }, { limit: 'nope' }])(
    'rejects invalid available-file limit %# before project access',
    async (query) => {
      const { handlers, deps } = setup();
      const { res, result } = response();
      await handlers.listAvailableProjectFiles(request({ params: { projectId }, query }), res);
      expect(result.statusCode).toBe(400);
      expect(deps.getChatProject).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed available-file cursors before project access', async () => {
    const { handlers, deps } = setup();
    const { res, result } = response();
    await handlers.listAvailableProjectFiles(
      request({ params: { projectId }, query: { cursor: 'malformed' } }),
      res,
    );
    expect(result.statusCode).toBe(400);
    expect(deps.getChatProject).not.toHaveBeenCalled();
  });
  it('denies available-file metadata for a foreign tenant', async () => {
    const { handlers, deps } = setup({
      getChatProject: jest.fn().mockResolvedValue({
        _id: projectId,
        tenantId: 'tenant-b',
        file_ids: [],
      }),
    });
    const { res, result } = response();
    await handlers.listAvailableProjectFiles(request({ params: { projectId } }), res);
    expect(result.statusCode).toBe(404);
    expect(deps.getAvailableProjectFiles).not.toHaveBeenCalled();
  });
});
