import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { SystemRoles, ResourceType, PermissionBits } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';

export type AgentUploadAuthResult =
  | { allowed: true }
  | { allowed: false; status: number; error: string; message: string };

export interface AgentUploadAuthParams {
  userId: string;
  userRole: string;
  agentId?: string;
  toolResource?: string | null;
  messageFile?: boolean | string;
}

export interface AgentUploadAuthDeps {
  getAgent: (params: { id: string }) => Promise<{
    _id: string | Types.ObjectId;
    author?: string | Types.ObjectId | null;
  } | null>;
  checkPermission: (params: {
    userId: string;
    role: string;
    resourceType: ResourceType;
    resourceId: string | Types.ObjectId;
    requiredPermission: number;
  }) => Promise<boolean>;
}

export async function checkAgentUploadAuth(
  params: AgentUploadAuthParams,
  deps: AgentUploadAuthDeps,
): Promise<AgentUploadAuthResult> {
  const { userId, userRole, agentId, toolResource, messageFile } = params;
  const { getAgent, checkPermission } = deps;

  const isMessageAttachment = messageFile === true || messageFile === 'true';
  if (!agentId || toolResource == null || isMessageAttachment) {
    return { allowed: true };
  }

  if (userRole === SystemRoles.ADMIN) {
    return { allowed: true };
  }

  const agent = await getAgent({ id: agentId });
  if (!agent) {
    return { allowed: false, status: 404, error: 'Not Found', message: 'Agent not found' };
  }

  if (agent.author?.toString() === userId) {
    return { allowed: true };
  }

  const hasEditPermission = await checkPermission({
    userId,
    role: userRole,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.EDIT,
  });

  if (hasEditPermission) {
    return { allowed: true };
  }

  logger.warn(
    `[agentUploadAuth] User ${userId} denied upload to agent ${agentId} (insufficient permissions)`,
  );
  return {
    allowed: false,
    status: 403,
    error: 'Forbidden',
    message: 'Insufficient permissions to upload files to this agent',
  };
}

/** @returns true if denied (response already sent), false if allowed */
export async function verifyAgentUploadPermission({
  req,
  res,
  metadata,
  getAgent,
  checkPermission,
}: {
  req: ServerRequest;
  res: Response;
  metadata: { agent_id?: string; tool_resource?: string | null; message_file?: boolean | string };
  getAgent: AgentUploadAuthDeps['getAgent'];
  checkPermission: AgentUploadAuthDeps['checkPermission'];
}): Promise<boolean> {
  const user = req.user as IUser;
  const result = await checkAgentUploadAuth(
    {
      userId: user.id,
      userRole: user.role ?? '',
      agentId: metadata.agent_id,
      toolResource: metadata.tool_resource,
      messageFile: metadata.message_file,
    },
    { getAgent, checkPermission },
  );

  if (!result.allowed) {
    res.status(result.status).json({ error: result.error, message: result.message });
    return true;
  }
  return false;
}
