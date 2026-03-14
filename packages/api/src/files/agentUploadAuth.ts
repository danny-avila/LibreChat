import { logger } from '@librechat/data-schemas';
import { SystemRoles, ResourceType, PermissionBits } from 'librechat-data-provider';

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
  getAgent: (params: { id: string }) => Promise<{ _id: string; author?: string | null } | null>;
  checkPermission: (params: {
    userId: string;
    role: string;
    resourceType: ResourceType;
    resourceId: string;
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
