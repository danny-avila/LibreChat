import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { IRole } from '@librechat/data-schemas';
import {
  AssistantToolPermissionError,
  isAssistantToolPermissionError,
  assertAssistantRunToolsPermitted,
} from './permissions';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const roleWith = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'USER',
    permissions: {
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      [PermissionTypes.WEB_SEARCH]: { [Permissions.USE]: true },
      ...overrides,
    },
  }) as unknown as IRole;

const buildReq = () => ({ user: { id: 'user_1', role: 'USER' } }) as unknown as ServerRequest;

const clientReturning = (tools: Array<{ type: string }>) => {
  const retrieve = jest.fn().mockResolvedValue({ id: 'asst_1', tools });
  return { openai: { beta: { assistants: { retrieve } } }, retrieve };
};

describe('assertAssistantRunToolsPermitted', () => {
  it('permits the run without retrieving the assistant when the role holds every grant', async () => {
    const { openai, retrieve } = clientReturning([{ type: 'code_interpreter' }]);

    await expect(
      assertAssistantRunToolsPermitted({
        req: buildReq(),
        getRoleByName: jest.fn().mockResolvedValue(roleWith()),
        openai,
        assistantId: 'asst_1',
      }),
    ).resolves.toBeUndefined();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('refuses with a 403 naming the denied tool the assistant stores', async () => {
    const { openai, retrieve } = clientReturning([
      { type: 'code_interpreter' },
      { type: 'function' },
    ]);

    const error = await assertAssistantRunToolsPermitted({
      req: buildReq(),
      getRoleByName: jest
        .fn()
        .mockResolvedValue(roleWith({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } })),
      openai,
      assistantId: 'asst_1',
    }).catch((caught: unknown) => caught);

    expect(retrieve).toHaveBeenCalledWith('asst_1');
    expect(isAssistantToolPermissionError(error)).toBe(true);
    expect(error).toMatchObject({
      statusCode: 403,
      body: {
        error: 'assistant_tool_not_permitted',
        deniedTools: ['code_interpreter'],
        text: 'This assistant uses Code Interpreter, which your role is not permitted to use.',
      },
    });
  });

  it('permits an assistant that stores none of the denied tools', async () => {
    const { openai } = clientReturning([{ type: 'file_search' }]);

    await expect(
      assertAssistantRunToolsPermitted({
        req: buildReq(),
        getRoleByName: jest
          .fn()
          .mockResolvedValue(
            roleWith({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }),
          ),
        openai,
        assistantId: 'asst_1',
      }),
    ).resolves.toBeUndefined();
  });

  /** v1 stores `retrieval` where v2 stores `file_search`; both are one capability. */
  it('names File Search once when both file tool spellings are denied', () => {
    const error = new AssistantToolPermissionError(['file_search', 'retrieval']);

    expect(error.body.text).toBe(
      'This assistant uses File Search, which your role is not permitted to use.',
    );
    expect(error.body.deniedTools).toEqual(['file_search', 'retrieval']);
  });

  it('does not treat an unrelated error as a permission refusal', () => {
    expect(isAssistantToolPermissionError(new Error('provider unavailable'))).toBe(false);
  });
});
