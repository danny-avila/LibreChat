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
import { createAgentManagementFileHandlers, createAgentManagementUploadResponse } from './files';

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
  provider: 'Moonshot',
  tool_resources: {
    context: { file_ids: ['file-context', 'file-shared'] },
    file_search: { file_ids: ['file-search', 'file-shared'] },
    execute_code: { file_ids: ['file-code'] },
    image_edit: { file_ids: ['file-image'] },
    ocr: { file_ids: ['file-ocr'] },
  },
};

function makeRequest(params: Record<string, string>): Request {
  return { user, params, headers: {} } as unknown as Request;
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
      permissions: {
        [PermissionTypes.AGENTS]: {
          [Permissions.USE]: true,
          [Permissions.CREATE]: true,
        },
      },
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
    processUpload: jest.fn().mockResolvedValue(undefined),
    deleteTempFile: jest.fn().mockResolvedValue(undefined),
    getUploadConfig: jest.fn().mockResolvedValue({
      endpoint: 'Moonshot',
      endpointType: 'custom',
      fileLimit: 100,
      totalSizeLimit: 1_000_000,
    }),
    ...overrides,
  };
}

async function authorizeUpload(
  handlers: ReturnType<typeof createAgentManagementFileHandlers>,
  request: Request,
  response: Response,
) {
  const next = jest.fn();
  await handlers.authorizeUpload(request, response, next);
  expect(next).toHaveBeenCalledTimes(1);
}

describe('Agent Management file handlers', () => {
  it('projects upload success through the management metadata allowlist', () => {
    const response = makeResponse();
    const file = {
      originalname: 'input.txt',
      size: 12,
      mimetype: 'text/plain',
    } as Express.Multer.File;

    createAgentManagementUploadResponse(response, file, EToolResources.context).status(200).json({
      file_id: 'file-one',
      filename: 'stored.txt',
      filepath: '/private/storage/path',
      storageKey: 'private-key',
      tenantId: 'tenant-a',
      bytes: 10,
      type: 'text/plain',
    });

    expect(response.json).toHaveBeenCalledWith({
      id: 'file-one',
      object: 'agent.file',
      filename: 'stored.txt',
      bytes: 10,
      mime_type: 'text/plain',
      purposes: [EToolResources.context],
      created_at: null,
    });
  });

  it('rejects an incomplete shared-uploader success response', () => {
    const response = makeResponse();
    const file = {
      originalname: 'input.txt',
      size: 12,
      mimetype: 'text/plain',
    } as Express.Multer.File;

    createAgentManagementUploadResponse(response, file, EToolResources.context).status(200).json({
      filename: 'stored.txt',
    });

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
  });

  it.each([EToolResources.context, EToolResources.file_search, EToolResources.execute_code])(
    'routes a %s upload through the shared browser pipeline',
    async (purpose) => {
      const deps = makeDeps();
      const response = makeResponse();
      const request = makeRequest({ id: 'agent-one' });
      const handlers = createAgentManagementFileHandlers(deps);
      await authorizeUpload(handlers, request, response);
      request.body = { purpose };
      request.file = {
        path: '/tmp/upload',
        originalname: 'input.txt',
        size: 12,
      } as Express.Multer.File;

      await handlers.upload(request, response);

      expect(deps.processUpload).toHaveBeenCalledWith(request, response);
      expect(request.body).toEqual({
        endpoint: 'Moonshot',
        endpointType: 'custom',
        agent_id: 'agent-one',
        tool_resource: purpose,
      });
      expect(request.headers.accept).toBe('application/json');
      expect(deps.deleteTempFile).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported purposes and removes the temporary upload', async () => {
    const deps = makeDeps();
    const response = makeResponse();
    const request = makeRequest({ id: 'agent-one' });
    request.body = { purpose: 'provider_storage' };
    request.file = { path: '/tmp/rejected', originalname: 'input.txt' } as Express.Multer.File;

    await createAgentManagementFileHandlers(deps).upload(request, response);

    expect(deps.deleteTempFile).toHaveBeenCalledWith('/tmp/rejected');
    expect(deps.processUpload).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
  });

  it('rejects a cross-tenant Agent before staging an upload', async () => {
    const deps = makeDeps({ getAgentWithVersionCount: jest.fn().mockResolvedValue(null) });
    const response = makeResponse();
    const request = makeRequest({ id: 'agent-other-tenant' });
    const next = jest.fn();

    await createAgentManagementFileHandlers(deps).authorizeUpload(request, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(deps.deleteTempFile).not.toHaveBeenCalled();
    expect(deps.processUpload).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('reports cleanup failures with the management error contract', async () => {
    const deps = makeDeps({
      deleteTempFile: jest.fn().mockRejectedValue(new Error('cleanup failed')),
      getUploadConfig: jest.fn().mockResolvedValue({
        endpoint: 'Moonshot',
        endpointType: 'custom',
        fileLimit: 2,
      }),
    });
    const response = makeResponse();
    const request = makeRequest({ id: 'agent-one' });
    const handlers = createAgentManagementFileHandlers(deps);
    await authorizeUpload(handlers, request, response);
    request.body = { purpose: EToolResources.context };
    request.file = {
      path: '/tmp/rejected',
      originalname: 'input.txt',
      size: 12,
    } as Express.Multer.File;

    await handlers.upload(request, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
  });

  it('serializes uploads when enforcing the per-purpose aggregate file limit', async () => {
    let attachedCount = 1;
    const getAgentWithVersionCount = jest.fn().mockImplementation(async () => ({
      ...agent,
      tool_resources: {
        ...agent.tool_resources,
        context: {
          file_ids: Array.from({ length: attachedCount }, (_, index) => `file-${index}`),
        },
      },
    }));
    const processUpload = jest.fn().mockImplementation(async () => {
      attachedCount += 1;
    });
    const deps = makeDeps({
      getAgentWithVersionCount,
      processUpload,
      getUploadConfig: jest.fn().mockResolvedValue({ endpoint: 'Moonshot', fileLimit: 2 }),
    });
    const handlers = createAgentManagementFileHandlers(deps);
    const firstResponse = makeResponse();
    const secondResponse = makeResponse();
    const firstRequest = makeRequest({ id: 'agent-one' });
    const secondRequest = makeRequest({ id: 'agent-one' });
    await authorizeUpload(handlers, firstRequest, firstResponse);
    await authorizeUpload(handlers, secondRequest, secondResponse);
    firstRequest.body = { purpose: EToolResources.context };
    secondRequest.body = { purpose: EToolResources.context };
    firstRequest.file = {
      path: '/tmp/first',
      originalname: 'first.txt',
      size: 1,
    } as Express.Multer.File;
    secondRequest.file = {
      path: '/tmp/second',
      originalname: 'second.txt',
      size: 1,
    } as Express.Multer.File;

    await Promise.all([
      handlers.upload(firstRequest, firstResponse),
      handlers.upload(secondRequest, secondResponse),
    ]);

    expect(processUpload).toHaveBeenCalledTimes(1);
    expect(deps.deleteTempFile).toHaveBeenCalledWith('/tmp/second');
    expect(secondResponse.status).toHaveBeenCalledWith(400);
  });

  it('rejects an upload that would exceed the per-purpose aggregate byte limit', async () => {
    const deps = makeDeps({
      getFiles: jest.fn().mockResolvedValue([
        { file_id: 'file-context', bytes: 8 },
        { file_id: 'file-shared', bytes: 12 },
      ]),
      getUploadConfig: jest.fn().mockResolvedValue({
        endpoint: 'Moonshot',
        totalSizeLimit: 24,
      }),
    });
    const response = makeResponse();
    const request = makeRequest({ id: 'agent-one' });
    const handlers = createAgentManagementFileHandlers(deps);
    await authorizeUpload(handlers, request, response);
    request.body = { purpose: EToolResources.context };
    request.file = {
      path: '/tmp/too-large-in-aggregate',
      originalname: 'input.txt',
      size: 5,
    } as Express.Multer.File;

    await handlers.upload(request, response);

    expect(deps.processUpload).not.toHaveBeenCalled();
    expect(deps.deleteTempFile).toHaveBeenCalledWith('/tmp/too-large-in-aggregate');
    expect(response.status).toHaveBeenCalledWith(400);
  });

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
          $in: [
            'file-context',
            'file-shared',
            'file-search',
            'file-code',
            'file-image',
            'file-ocr',
          ],
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

  it.each([
    [EToolResources.image_edit, 'file-image'],
    [EToolResources.ocr, 'file-ocr'],
  ])('unlinks legacy %s attachments', async (purpose, fileId) => {
    const deps = makeDeps();
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).remove(
      makeRequest({ id: 'agent-one', fileId }),
      response,
    );

    expect(deps.removeAgentResourceFiles).toHaveBeenCalledWith({
      agent_id: 'agent-one',
      files: [{ tool_resource: purpose, file_id: fileId }],
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('checks mutation capability before looking up the agent', async () => {
    const getAgentWithVersionCount = jest.fn().mockResolvedValue(agent);
    const deps = makeDeps({
      getAgentWithVersionCount,
      getRoleByName: jest.fn().mockResolvedValue({
        permissions: {
          [PermissionTypes.AGENTS]: {
            [Permissions.USE]: true,
            [Permissions.CREATE]: false,
          },
        },
      } as unknown as IRole),
    });
    const response = makeResponse();

    await createAgentManagementFileHandlers(deps).remove(
      makeRequest({ id: 'agent-one', fileId: 'file-shared' }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(getAgentWithVersionCount).not.toHaveBeenCalled();
    expect(deps.removeAgentResourceFiles).not.toHaveBeenCalled();
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
    expect(response.json).toHaveBeenCalledWith({
      error: { code: 'not_found', message: 'File not found' },
    });
    expect(deps.removeAgentResourceFiles).not.toHaveBeenCalled();
  });
});
