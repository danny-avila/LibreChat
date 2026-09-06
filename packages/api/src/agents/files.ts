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

const FILE_PURPOSES = [
  EToolResources.context,
  EToolResources.file_search,
  EToolResources.execute_code,
] as const;

type AgentFilePurpose = (typeof FILE_PURPOSES)[number];
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
}

function sendError(res: Response, code: Parameters<typeof mapAgentManagementError>[0]) {
  const mapped = mapAgentManagementError(code);
  return res.status(mapped.status).json(mapped.body);
}

async function canUseAgents(req: Request, user: IUser, deps: AgentManagementFileDeps) {
  return await checkAccessWithRequestCache({
    req,
    user,
    permissionType: PermissionTypes.AGENTS,
    permissions: [Permissions.USE],
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

async function authorizeAgentFileEdit(
  req: Request,
  user: IUser,
  agent: AgentManagementFileAgent,
  deps: AgentManagementFileDeps,
) {
  const [canUse, canManageAll] = await Promise.all([
    canUseAgents(req, user, deps),
    hasManageAgentsCapability(user, deps),
  ]);
  if (!canUse) {
    return false;
  }
  if (canManageAll) {
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
  list: (req: Request, res: Response) => Promise<Response>;
  remove: (req: Request, res: Response) => Promise<Response>;
} {
  async function getAuthorizedAgent(req: Request, res: Response) {
    const user = req.user as IUser | undefined;
    if (!user?.id || !user.tenantId) {
      sendError(res, 'permission_denied');
      return null;
    }

    const agent = await deps.getAgentWithVersionCount({
      id: req.params.id,
      tenantId: user.tenantId,
    });
    if (!agent) {
      sendError(res, 'not_found');
      return null;
    }
    if (!(await authorizeAgentFileEdit(req, user, agent, deps))) {
      sendError(res, 'permission_denied');
      return null;
    }
    return { agent, user, tenantId: user.tenantId };
  }

  async function list(req: Request, res: Response): Promise<Response> {
    try {
      const authorized = await getAuthorizedAgent(req, res);
      if (!authorized) {
        return res;
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
      const authorized = await getAuthorizedAgent(req, res);
      if (!authorized) {
        return res;
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

  return { list, remove };
}
