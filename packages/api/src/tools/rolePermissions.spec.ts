import { Tools, Permissions, EToolResources, PermissionTypes } from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { IRole } from '@librechat/data-schemas';
import {
  toolRolePermissions,
  checkToolRolePermission,
  resolveToolRolePermissions,
  toolResourceRolePermissions,
  assistantToolRolePermissions,
  resolveAssistantToolPermissions,
  checkToolResourceUploadPermission,
} from './rolePermissions';

const buildRole = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'USER',
    permissions: {
      [PermissionTypes.FILE_SEARCH]: { [Permissions.USE]: true },
      [PermissionTypes.RUN_CODE]: { [Permissions.USE]: true },
      ...overrides,
    },
  }) as unknown as IRole;

const buildReq = () => ({ user: { id: 'user_1', role: 'USER' } }) as unknown as ServerRequest;

describe('tool role permission maps', () => {
  it('covers both role-gated agent tools', () => {
    expect(toolRolePermissions[Tools.file_search]).toBe(PermissionTypes.FILE_SEARCH);
    expect(toolRolePermissions[Tools.execute_code]).toBe(PermissionTypes.RUN_CODE);
  });

  /** The Assistants builder uploads under `code_interpreter`, not `execute_code`,
   *  so leaving it out reopens the upload half of the RUN_CODE door. */
  it('maps every code-bearing tool resource to RUN_CODE', () => {
    expect(toolResourceRolePermissions[EToolResources.execute_code]).toBe(PermissionTypes.RUN_CODE);
    expect(toolResourceRolePermissions[EToolResources.code_interpreter]).toBe(
      PermissionTypes.RUN_CODE,
    );
    expect(toolResourceRolePermissions[EToolResources.file_search]).toBe(
      PermissionTypes.FILE_SEARCH,
    );
  });

  it('maps native assistant tool types', () => {
    expect(assistantToolRolePermissions['code_interpreter']).toBe(PermissionTypes.RUN_CODE);
    expect(assistantToolRolePermissions['file_search']).toBe(PermissionTypes.FILE_SEARCH);
  });
});

describe('checkToolRolePermission', () => {
  it('grants when the role carries the permission', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());

    await expect(
      checkToolRolePermission({
        req: buildReq(),
        user: buildReq().user as never,
        permissionType: PermissionTypes.RUN_CODE,
        getRoleByName,
      }),
    ).resolves.toBe(true);
  });

  it('denies when the role withholds it', async () => {
    const getRoleByName = jest
      .fn()
      .mockResolvedValue(buildRole({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }));

    await expect(
      checkToolRolePermission({
        req: buildReq(),
        user: buildReq().user as never,
        permissionType: PermissionTypes.RUN_CODE,
        getRoleByName,
      }),
    ).resolves.toBe(false);
  });

  it('fails closed when the role lookup throws', async () => {
    const getRoleByName = jest.fn().mockRejectedValue(new Error('unreachable'));

    await expect(
      checkToolRolePermission({
        req: buildReq(),
        user: buildReq().user as never,
        permissionType: PermissionTypes.FILE_SEARCH,
        getRoleByName,
      }),
    ).resolves.toBe(false);
  });

  it('fails closed without a user', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());

    await expect(
      checkToolRolePermission({
        permissionType: PermissionTypes.FILE_SEARCH,
        getRoleByName,
      }),
    ).resolves.toBe(false);
    expect(getRoleByName).not.toHaveBeenCalled();
  });
});

describe('resolveToolRolePermissions', () => {
  it('passes tools that carry no role permission', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());
    const canUse = await resolveToolRolePermissions({
      req: buildReq(),
      tools: ['calculator'],
      getRoleByName,
    });

    expect(canUse('calculator')).toBe(true);
    expect(getRoleByName).not.toHaveBeenCalled();
  });

  it('denies only the tool whose grant is missing', async () => {
    const getRoleByName = jest
      .fn()
      .mockResolvedValue(buildRole({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }));
    const canUse = await resolveToolRolePermissions({
      req: buildReq(),
      tools: [Tools.file_search, Tools.execute_code],
      getRoleByName,
    });

    expect(canUse(Tools.file_search)).toBe(true);
    expect(canUse(Tools.execute_code)).toBe(false);
  });

  /** Two gated tools on one request must not cost two role reads. */
  it('reads the role once per request', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());
    await resolveToolRolePermissions({
      req: buildReq(),
      tools: [Tools.file_search, Tools.execute_code],
      getRoleByName,
    });

    expect(getRoleByName).toHaveBeenCalledTimes(1);
  });

  it('skips tools the caller marks ineligible', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());
    const canUse = await resolveToolRolePermissions({
      req: buildReq(),
      tools: [Tools.file_search],
      getRoleByName,
      isEligible: () => false,
    });

    expect(getRoleByName).not.toHaveBeenCalled();
    expect(canUse(Tools.file_search)).toBe(true);
  });
});

describe('checkToolResourceUploadPermission', () => {
  it('allows a resource that carries no role permission', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());

    await expect(
      checkToolResourceUploadPermission({
        req: buildReq(),
        toolResource: EToolResources.context,
        getRoleByName,
      }),
    ).resolves.toBe(true);
    expect(getRoleByName).not.toHaveBeenCalled();
  });

  it('allows an upload with no tool resource at all', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());

    await expect(
      checkToolResourceUploadPermission({ req: buildReq(), getRoleByName }),
    ).resolves.toBe(true);
  });

  /** The Code Files UI posts images under `execute_code` through a separate
   *  handler, so both upload routes have to reach the same verdict. */
  it('denies a code-bearing upload when RUN_CODE is withheld', async () => {
    const getRoleByName = jest
      .fn()
      .mockResolvedValue(buildRole({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }));

    await expect(
      checkToolResourceUploadPermission({
        req: buildReq(),
        toolResource: EToolResources.execute_code,
        getRoleByName,
      }),
    ).resolves.toBe(false);
    await expect(
      checkToolResourceUploadPermission({
        req: buildReq(),
        toolResource: EToolResources.code_interpreter,
        getRoleByName,
      }),
    ).resolves.toBe(false);
  });
});

describe('resolveAssistantToolPermissions', () => {
  it('keeps native tools the role grants', async () => {
    const getRoleByName = jest.fn().mockResolvedValue(buildRole());
    const permitted = await resolveAssistantToolPermissions({
      req: buildReq(),
      tools: [{ type: 'code_interpreter' }, { type: 'file_search' }],
      getRoleByName,
    });

    expect(permitted({ type: 'code_interpreter' })).toBe(true);
    expect(permitted({ type: 'file_search' })).toBe(true);
  });

  it('drops only the native tool whose grant is missing', async () => {
    const getRoleByName = jest
      .fn()
      .mockResolvedValue(buildRole({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }));
    const permitted = await resolveAssistantToolPermissions({
      req: buildReq(),
      tools: [{ type: 'code_interpreter' }, { type: 'file_search' }],
      getRoleByName,
    });

    expect(permitted({ type: 'code_interpreter' })).toBe(false);
    expect(permitted({ type: 'file_search' })).toBe(true);
  });

  it('never drops function tools, which carry no native grant', async () => {
    const getRoleByName = jest
      .fn()
      .mockResolvedValue(buildRole({ [PermissionTypes.RUN_CODE]: { [Permissions.USE]: false } }));
    const permitted = await resolveAssistantToolPermissions({
      req: buildReq(),
      tools: [{ type: 'code_interpreter' }],
      getRoleByName,
    });

    expect(permitted({ type: 'function' })).toBe(true);
    expect(permitted('calculator')).toBe(true);
    expect(permitted(undefined)).toBe(true);
  });
});
