import { logger } from '@librechat/data-schemas';
import { ErrorTypes, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { IRole } from '@librechat/data-schemas';
import { authorizeAssistantRun } from './permissions';

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

const deny = (...types: PermissionTypes[]) =>
  roleWith(Object.fromEntries(types.map((type) => [type, { [Permissions.USE]: false }])));

const buildReq = () => ({ user: { id: 'user_1', role: 'USER' } }) as unknown as ServerRequest;

function setup(role: IRole, tools: Array<{ type: string }>) {
  const retrieve = jest.fn().mockResolvedValue({ id: 'asst_1', tools });
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return {
    retrieve,
    res,
    run: () =>
      authorizeAssistantRun({
        req: buildReq(),
        res,
        getRoleByName: jest.fn().mockResolvedValue(role),
        openai: { beta: { assistants: { retrieve } } },
        assistantId: 'asst_1',
      }),
  };
}

describe('authorizeAssistantRun', () => {
  afterEach(() => jest.restoreAllMocks());

  it('authorizes without reading the assistant or pinning tools when every grant is held', async () => {
    const { retrieve, res, run } = setup(roleWith(), [{ type: 'code_interpreter' }]);
    const body = { assistant_id: 'asst_1' };

    const authorization = await run();

    expect(authorization.refused).toBe(false);
    expect(authorization.applyToRunBody(body)).toBe(body);
    expect(retrieve).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('refuses with a 403 carrying the typed error the chat client localizes', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const { retrieve, res, run } = setup(deny(PermissionTypes.RUN_CODE), [
      { type: 'code_interpreter' },
      { type: 'function' },
    ]);

    const authorization = await run();

    expect(authorization.refused).toBe(true);
    expect(retrieve).toHaveBeenCalledWith('asst_1');
    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({
      error: ErrorTypes.ASSISTANT_TOOL_NOT_PERMITTED,
      deniedTools: ['code_interpreter'],
    });
    expect(JSON.parse(body.text)).toEqual({
      type: ErrorTypes.ASSISTANT_TOOL_NOT_PERMITTED,
      tools: ['code_interpreter'],
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  /** The provider runs whatever the assistant holds when the run is created, so
   *  a tool added after this check would otherwise execute for a denied role. */
  it('pins the run to the checked tools when the missing grant was not needed', async () => {
    const tools = [{ type: 'file_search' }, { type: 'function' }];
    const { res, run } = setup(deny(PermissionTypes.RUN_CODE), tools);

    const authorization = await run();

    expect(authorization.refused).toBe(false);
    expect(authorization.applyToRunBody({ assistant_id: 'asst_1', model: 'gpt-4o' })).toEqual({
      assistant_id: 'asst_1',
      model: 'gpt-4o',
      tools,
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('logs no denial for grants an assistant without native tools never needed', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const { run } = setup(
      deny(PermissionTypes.RUN_CODE, PermissionTypes.FILE_SEARCH, PermissionTypes.WEB_SEARCH),
      [{ type: 'function' }],
    );

    await expect(run()).resolves.toMatchObject({ refused: false });
    expect(warn).not.toHaveBeenCalled();
  });
});
