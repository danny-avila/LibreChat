import { createProjectHandlers } from './handlers';
import type { Response } from 'express';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const projectId = '507f1f77bcf86cd799439011';
const userId = 'user-1';

const buildResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const buildDeps = (overrides: Partial<Parameters<typeof createProjectHandlers>[0]> = {}) =>
  ({
    listChatProjects: jest.fn(),
    createChatProject: jest.fn(),
    getChatProject: jest.fn(),
    updateChatProject: jest.fn(),
    deleteChatProject: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    assignConversationToProject: jest.fn(),
    deleteProjectMemories: jest.fn().mockResolvedValue(0),
    ...overrides,
  }) as unknown as Parameters<typeof createProjectHandlers>[0];

describe('deleteProject memory cascade', () => {
  it('deletes the project partition after the project itself', async () => {
    const deps = buildDeps();
    const handlers = createProjectHandlers(deps);
    const res = buildResponse();

    await handlers.deleteProject({ user: { id: userId }, params: { projectId } } as never, res);

    expect(deps.deleteProjectMemories).toHaveBeenCalledWith({
      userId,
      chatProjectId: projectId,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not cascade when no project was deleted', async () => {
    const deps = buildDeps({
      deleteChatProject: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    } as never);
    const handlers = createProjectHandlers(deps);
    const res = buildResponse();

    await handlers.deleteProject({ user: { id: userId }, params: { projectId } } as never, res);

    expect(deps.deleteProjectMemories).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('still reports success when the cascade fails', async () => {
    const deps = buildDeps({
      deleteProjectMemories: jest.fn().mockRejectedValue(new Error('mongo down')),
    } as never);
    const handlers = createProjectHandlers(deps);
    const res = buildResponse();

    await handlers.deleteProject({ user: { id: userId }, params: { projectId } } as never, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
