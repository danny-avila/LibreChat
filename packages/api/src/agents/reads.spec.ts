import { Types } from 'mongoose';
import { SystemCapabilities } from '@librechat/data-schemas';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import type { IRole, IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { AgentManagementReadDeps } from './reads';
import { createAgentManagementReadHandlers } from './reads';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { warn: jest.fn(), error: jest.fn() },
  };
});

const tenantId = 'tenant-a';
const user = {
  id: new Types.ObjectId().toString(),
  tenantId,
  role: 'USER',
  idOnTheSource: 'external-user',
} as IUser;
const objectId = new Types.ObjectId();
const agent = {
  _id: objectId,
  id: 'agent-one',
  provider: 'openAI',
  model: 'gpt-5',
  name: 'Agent One',
  version: 2,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};

function makeRequest(overrides: Partial<Request> = {}): Request {
  return { user, query: {}, params: {}, ...overrides } as Request;
}

function makeResponse(): Response {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response;
}

function makeDeps(overrides: Partial<AgentManagementReadDeps> = {}): AgentManagementReadDeps {
  return {
    getRoleByName: jest.fn().mockResolvedValue({
      permissions: { [PermissionTypes.AGENTS]: { [Permissions.USE]: true } },
    } as unknown as IRole),
    getAgentWithVersionCount: jest.fn().mockResolvedValue(agent),
    getAgentManagementListByAccess: jest.fn().mockResolvedValue({
      data: [agent],
      has_more: false,
      after: null,
    }),
    findAccessibleResources: jest.fn().mockResolvedValue([objectId]),
    checkPermission: jest.fn().mockResolvedValue(true),
    hasCapability: jest.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('Agent Management read handlers', () => {
  it('lists only ACL-discovered records in the authenticated tenant', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).list(
      makeRequest({ query: { limit: '10' } }),
      response,
    );

    expect(deps.findAccessibleResources).toHaveBeenCalledWith({
      userId: user.id,
      role: user.role,
      idOnTheSource: user.idOnTheSource,
      resourceType: 'agent',
      requiredPermissions: 2,
    });
    expect(deps.getAgentManagementListByAccess).toHaveBeenCalledWith({
      accessibleIds: [objectId],
      tenantId,
      limit: 10,
      after: undefined,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        object: 'list',
        data: [expect.objectContaining({ id: 'agent-one' })],
      }),
    );
  });

  it('rejects malformed cursors before ACL or persistence work', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).list(
      makeRequest({ query: { cursor: 'not-a-cursor' } }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(deps.findAccessibleResources).not.toHaveBeenCalled();
    expect(deps.getAgentManagementListByAccess).not.toHaveBeenCalled();
  });

  it('retrieves by public ID and authenticated tenant before applying EDIT access', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).get(
      makeRequest({ params: { id: 'agent-one' } }),
      response,
    );

    expect(deps.getAgentWithVersionCount).toHaveBeenCalledWith({ id: 'agent-one', tenantId });
    expect(deps.checkPermission).toHaveBeenCalledWith({
      userId: user.id,
      role: user.role,
      resourceType: 'agent',
      resourceId: objectId,
      requiredPermission: 2,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-one' }));
  });

  it('returns not found when the tenant-scoped lookup cannot resolve the ID', async () => {
    const deps = makeDeps({ getAgentWithVersionCount: jest.fn().mockResolvedValue(null) });
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).get(
      makeRequest({ params: { id: 'agent-in-another-tenant' } }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(deps.checkPermission).not.toHaveBeenCalled();
  });

  it('denies a known Agent when neither EDIT ACL nor the management capability is held', async () => {
    const deps = makeDeps({ checkPermission: jest.fn().mockResolvedValue(false) });
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).get(
      makeRequest({ params: { id: 'agent-one' } }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('uses the existing manage-agents capability as the resource ACL bypass', async () => {
    const deps = makeDeps({ hasCapability: jest.fn().mockResolvedValue(true) });
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).get(
      makeRequest({ params: { id: 'agent-one' } }),
      response,
    );

    expect(deps.hasCapability).toHaveBeenCalledWith(user, SystemCapabilities.MANAGE_AGENTS);
    expect(deps.checkPermission).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('lists every Agent in the tenant for the existing manage-agents capability', async () => {
    const deps = makeDeps({ hasCapability: jest.fn().mockResolvedValue(true) });
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).list(makeRequest(), response);

    expect(deps.findAccessibleResources).not.toHaveBeenCalled();
    expect(deps.getAgentManagementListByAccess).toHaveBeenCalledWith({
      accessibleIds: null,
      tenantId,
      limit: 20,
      after: undefined,
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('requires the same AGENTS:USE role permission as browser reads', async () => {
    const deps = makeDeps({
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: { [PermissionTypes.AGENTS]: { [Permissions.USE]: false } },
      } as never),
    });
    const response = makeResponse();

    await createAgentManagementReadHandlers(deps).list(makeRequest(), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(deps.findAccessibleResources).not.toHaveBeenCalled();
  });
});
