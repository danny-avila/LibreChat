import { logger, ResourceCapabilityMap } from '@librechat/data-schemas';
import {
  EToolResources,
  PermissionBits,
  Permissions,
  PermissionTypes,
  ResourceType,
} from 'librechat-data-provider';
import type { IRole, IUser, SystemCapability } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type { AgentManagementProjectionSource } from './management';
import { mapAgentManagementError } from './management';
import { checkAccessWithRequestCache } from '../middleware/access';

type AgentUploadPurpose =
  | EToolResources.context
  | EToolResources.file_search
  | EToolResources.execute_code;

type AgentFilePurpose = AgentUploadPurpose | EToolResources.image_edit | EToolResources.ocr;

const UPLOAD_PURPOSES: readonly AgentUploadPurpose[] = [
  EToolResources.context,
  EToolResources.file_search,
  EToolResources.execute_code,
] as const;

const FILE_PURPOSES: readonly AgentFilePurpose[] = [
  ...UPLOAD_PURPOSES,
  EToolResources.image_edit,
  EToolResources.ocr,
] as const;

type AgentManagementFileRecord = {
  file_id: string;
  filename: string;
  bytes: number;
  type: string;
  createdAt?: Date;
};
type AgentManagementFile = {
  id: string;
  object: 'agent.file';
  filename: string;
  bytes: number;
  mime_type: string;
  purposes: AgentFilePurpose[];
  created_at: string | null;
};
type AgentManagementUploadBody = {
  file_id?: string;
  filename?: string;
  bytes?: number;
  type?: string;
  createdAt?: string | Date;
};
type AgentManagementFileAgent = AgentManagementProjectionSource & {
  _id: Types.ObjectId;
  tool_resources?: Partial<Record<AgentFilePurpose, { file_ids?: string[] }>>;
};

export interface AgentManagementFileDeps {
  getRoleByName: (roleName: string, fieldsToSelect?: string | string[]) => Promise<IRole | null>;
  getAgentWithVersionCount: (search: {
    id: string;
    tenantId: string;
  }) => Promise<AgentManagementFileAgent | null>;
  getFiles: (
    filter: { file_id: { $in: string[] }; tenantId: string },
    sort?: null,
    projection?: Record<string, 0 | 1>,
  ) => Promise<AgentManagementFileRecord[] | null>;
  checkPermission: (params: {
    userId: string;
    role?: string;
    resourceType: ResourceType;
    resourceId: Types.ObjectId;
    requiredPermission: PermissionBits;
  }) => Promise<boolean>;
  hasCapability: (user: IUser, capability: SystemCapability) => Promise<boolean>;
  removeAgentResourceFiles: (params: {
    agent_id: string;
    files: Array<{ tool_resource: AgentFilePurpose; file_id: string }>;
  }) => Promise<AgentManagementFileAgent>;
  processUpload: (req: Request, res: Response) => Promise<Response | void>;
  deleteTempFile: (path: string) => Promise<void>;
}

function sendError(res: Response, code: Parameters<typeof mapAgentManagementError>[0]) {
  const mapped = mapAgentManagementError(code);
  return res.status(mapped.status).json(mapped.body);
}

function getUploadErrorCode(status: number): Parameters<typeof mapAgentManagementError>[0] {
  if (status === 403) {
    return 'permission_denied';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status >= 400 && status < 500) {
    return 'invalid_request';
  }
  return 'internal_error';
}

function getUploadCreatedAt(value: string | Date | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

/** Restrict the shared browser uploader's response to the management file contract. */
export function createAgentManagementUploadResponse(
  res: Response,
  file: Express.Multer.File,
  purpose: AgentUploadPurpose,
): Response {
  let status = 200;
  const response = Object.create(res) as Response;
  response.status = (code: number) => {
    status = code;
    return response;
  };
  response.json = (body: AgentManagementUploadBody) => {
    if (status < 200 || status >= 300) {
      return sendError(res, getUploadErrorCode(status));
    }
    if (typeof body.file_id !== 'string' || body.file_id.length === 0) {
      return sendError(res, 'internal_error');
    }
    return res.status(status).json({
      id: body.file_id,
      object: 'agent.file',
      filename: body.filename ?? file.originalname,
      bytes: body.bytes ?? file.size,
      mime_type: body.type ?? file.mimetype,
      purposes: [purpose],
      created_at: getUploadCreatedAt(body.createdAt),
    });
  };
  return response;
}

async function canUseAgents(
  req: Request,
  user: IUser,
  permissions: Permissions[],
  deps: AgentManagementFileDeps,
) {
  return await checkAccessWithRequestCache({
    req,
    user,
    permissionType: PermissionTypes.AGENTS,
    permissions,
    getRoleByName: deps.getRoleByName,
  });
}

async function hasManageAgentsCapability(user: IUser, deps: AgentManagementFileDeps) {
  const capability = ResourceCapabilityMap[ResourceType.AGENT];
  try {
    return capability != null && (await deps.hasCapability(user, capability));
  } catch (error) {
    logger.warn(
      `[AgentManagement] Agent capability check failed, denying file access bypass: ${(error as Error).message}`,
    );
    return false;
  }
}

async function canEditAgentFiles(
  user: IUser,
  agent: AgentManagementFileAgent,
  deps: AgentManagementFileDeps,
) {
  if (await hasManageAgentsCapability(user, deps)) {
    return true;
  }
  return await deps.checkPermission({
    userId: user.id,
    role: user.role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.EDIT,
  });
}

function getFilePurposes(agent: AgentManagementFileAgent): Map<string, AgentFilePurpose[]> {
  const purposes = new Map<string, AgentFilePurpose[]>();
  for (const purpose of FILE_PURPOSES) {
    for (const fileId of agent.tool_resources?.[purpose]?.file_ids ?? []) {
      purposes.set(fileId, [...(purposes.get(fileId) ?? []), purpose]);
    }
  }
  return purposes;
}

/** Machine-authenticated Agent file listing and unlink handlers. */
export function createAgentManagementFileHandlers(deps: AgentManagementFileDeps): {
  upload: (req: Request, res: Response) => Promise<Response>;
  list: (req: Request, res: Response) => Promise<Response>;
  remove: (req: Request, res: Response) => Promise<Response>;
} {
  async function getAuthorizedAgent(req: Request, permissions: Permissions[]) {
    const user = req.user as IUser | undefined;
    if (!user?.id || !user.tenantId) {
      return { allowed: false as const, code: 'permission_denied' as const };
    }

    if (!(await canUseAgents(req, user, permissions, deps))) {
      return { allowed: false as const, code: 'permission_denied' as const };
    }

    const agent = await deps.getAgentWithVersionCount({
      id: req.params.id,
      tenantId: user.tenantId,
    });
    if (!agent) {
      return { allowed: false as const, code: 'not_found' as const };
    }
    if (!(await canEditAgentFiles(user, agent, deps))) {
      return { allowed: false as const, code: 'permission_denied' as const };
    }
    return { allowed: true as const, agent, user, tenantId: user.tenantId };
  }

  async function cleanupRejectedUpload(req: Request): Promise<boolean> {
    if (!req.file?.path) {
      return true;
    }
    try {
      await deps.deleteTempFile(req.file.path);
      return true;
    } catch (error) {
      logger.error('[AgentManagement] Error cleaning up rejected Agent file upload', error);
      return false;
    }
  }

  async function upload(req: Request, res: Response): Promise<Response> {
    try {
      const purpose = req.body?.purpose as string | undefined;
      if (!req.file || !UPLOAD_PURPOSES.includes(purpose as AgentUploadPurpose)) {
        const cleaned = await cleanupRejectedUpload(req);
        return sendError(res, cleaned ? 'invalid_request' : 'internal_error');
      }

      const authorized = await getAuthorizedAgent(req, [Permissions.USE, Permissions.CREATE]);
      if (!authorized.allowed) {
        const cleaned = await cleanupRejectedUpload(req);
        return sendError(res, cleaned ? authorized.code : 'internal_error');
      }

      req.body = {
        endpoint: 'agents',
        agent_id: req.params.id,
        tool_resource: purpose,
      };
      req.headers.accept = 'application/json';
      await deps.processUpload(req, res);
      return res;
    } catch (error) {
      logger.error('[AgentManagement] Error preparing Agent file upload', error);
      await cleanupRejectedUpload(req);
      return sendError(res, 'internal_error');
    }
  }

  async function list(req: Request, res: Response): Promise<Response> {
    try {
      const authorized = await getAuthorizedAgent(req, [Permissions.USE]);
      if (!authorized.allowed) {
        return sendError(res, authorized.code);
      }

      const purposes = getFilePurposes(authorized.agent);
      const fileIds = [...purposes.keys()];
      const records =
        fileIds.length === 0
          ? []
          : ((await deps.getFiles(
              { file_id: { $in: fileIds }, tenantId: authorized.tenantId },
              null,
              { text: 0 },
            )) ?? []);
      const data: AgentManagementFile[] = records.map((file) => ({
        id: file.file_id,
        object: 'agent.file',
        filename: file.filename,
        bytes: file.bytes,
        mime_type: file.type,
        purposes: purposes.get(file.file_id) ?? [],
        created_at: file.createdAt?.toISOString() ?? null,
      }));

      return res.status(200).json({ object: 'list', data });
    } catch (error) {
      logger.error('[AgentManagement] Error listing Agent files', error);
      return sendError(res, 'internal_error');
    }
  }

  async function remove(req: Request, res: Response): Promise<Response> {
    try {
      const fileId = req.params.fileId;
      if (!fileId) {
        return sendError(res, 'invalid_request');
      }
      const authorized = await getAuthorizedAgent(req, [Permissions.USE, Permissions.CREATE]);
      if (!authorized.allowed) {
        return sendError(res, authorized.code);
      }

      const purposes = getFilePurposes(authorized.agent).get(fileId) ?? [];
      if (purposes.length === 0) {
        return sendError(res, 'not_found');
      }
      await deps.removeAgentResourceFiles({
        agent_id: req.params.id,
        files: purposes.map((purpose) => ({
          tool_resource: purpose,
          file_id: fileId,
        })),
      });

      return res.status(200).json({ id: fileId, deleted: true });
    } catch (error) {
      logger.error('[AgentManagement] Error unlinking Agent file', error);
      return sendError(res, 'internal_error');
    }
  }

  return { upload, list, remove };
}
