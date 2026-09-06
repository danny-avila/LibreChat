import { Types } from 'mongoose';
import { SystemCapabilities } from '@librechat/data-schemas';
import {
  EToolResources,
  PermissionBits,
  Permissions,
  PermissionTypes,
  ResourceType,
} from 'librechat-data-provider';
import type { IRole, IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { AgentManagementFileDeps } from './files';
import { createAgentManagementFileHandlers } from './files';

jest.mock('@librechat/data-schemas', () => {
  return {
    ResourceCapabilityMap: { agent: 'MANAGE_AGENTS' },
    SystemCapabilities: { MANAGE_AGENTS: 'MANAGE_AGENTS' },
    logger: { warn: jest.fn(), error: jest.fn() },
  };
});

const tenantId = 'tenant-a';
const user = {
  id: new Types.ObjectId().toString(),
  tenantId,
  role: 'USER',
} as IUser;
const objectId = new Types.ObjectId();
const agent = {
  _id: objectId,
  id: 'agent-one',
  tool_resources: {
    context: { file_ids: ['file-context', 'file-shared'] },
    file_search: { file_ids: ['file-search', 'file-shared'] },
    execute_code: { file_ids: ['file-code'] },
  },
};

function makeRequest(params: Record<string, string>): Request {
  return { user, params } as unknown as Request;
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

function makeDeps(overrides: Partial<AgentManagementFileDeps> = {}): AgentManagementFileDeps {
  return {
    getRoleByName: jest.fn().mockResolvedValue({
      permissions: { [PermissionTypes.AGENTS]: { [Permissions.USE]: true } },
    } as unknown as IRole),
    getAgentWithVersionCount: jest.fn().mockResolvedValue(agent),
    getFiles: jest.fn().mockResolvedValue([
      {
        file_id: 'file-shared',
        filename: 'shared.txt',
        bytes: 12,
        type: 'text/plain',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
      },
    ]),
    checkPermission: jest.fn().mockResolvedValue(true),
    hasCapability: jest.fn().mockResolvedValue(false),
    removeAgentResourceFiles: jest.fn().mockResolvedValue(agent),
    ...overrides,
  };
}

describe('Agent Management file handlers', () => {
  it('lists safe file metadata with every attached purpose in the authenticated tenant', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).list(makeRequest({ id: 'agent-one' }), response);

    expect(deps.getAgentWithVersionCount).toHaveBeenCalledWith({ id: 'agent-one', tenantId });
    expect(deps.checkPermission).toHaveBeenCalledWith({
      userId: user.id,
      role: user.role,
      resourceType: ResourceType.AGENT,
      resourceId: objectId,
      requiredPermission: PermissionBits.EDIT,
    });
    expect(deps.getFiles).toHaveBeenCalledWith(
      {
        file_id: {
          $in: ['file-context', 'file-shared', 'file-search', 'file-code'],
        },
        tenantId,
      },
      null,
      { text: 0 },
    );
    expect(response.json).toHaveBeenCalledWith({
      object: 'list',
      data: [
        {
          id: 'file-shared',
          object: 'agent.file',
          filename: 'shared.txt',
          bytes: 12,
          mime_type: 'text/plain',
          purposes: [EToolResources.context, EToolResources.file_search],
          created_at: '2026-09-01T10:00:00.000Z',
        },
      ],
    });
  });

  it('unlinks a file from every purpose without deleting shared storage', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).remove(
      makeRequest({ id: 'agent-one', fileId: 'file-shared' }),
      response,
    );

    expect(deps.removeAgentResourceFiles).toHaveBeenCalledWith({
      agent_id: 'agent-one',
      files: [
        { tool_resource: EToolResources.context, file_id: 'file-shared' },
        { tool_resource: EToolResources.file_search, file_id: 'file-shared' },
      ],
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ id: 'file-shared', deleted: true });
  });

  it('fails closed when the agent is outside the authenticated tenant', async () => {
    const deps = makeDeps({ getAgentWithVersionCount: jest.fn().mockResolvedValue(null) });
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).list(
      makeRequest({ id: 'agent-other-tenant' }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(deps.getFiles).not.toHaveBeenCalled();
  });

  it('requires EDIT access unless the caller has the management capability', async () => {
    const deps = makeDeps({ checkPermission: jest.fn().mockResolvedValue(false) });
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).list(makeRequest({ id: 'agent-one' }), response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(deps.getFiles).not.toHaveBeenCalled();
  });

  it('uses the manage-agents capability as the existing ACL bypass', async () => {
    const deps = makeDeps({ hasCapability: jest.fn().mockResolvedValue(true) });
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).list(makeRequest({ id: 'agent-one' }), response);

    expect(deps.hasCapability).toHaveBeenCalledWith(user, SystemCapabilities.MANAGE_AGENTS);
    expect(deps.checkPermission).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('returns not found without mutating when the file is not attached', async () => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).remove(
      makeRequest({ id: 'agent-one', fileId: 'file-missing' }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(deps.removeAgentResourceFiles).not.toHaveBeenCalled();
  });
});
