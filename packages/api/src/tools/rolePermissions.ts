import { logger } from '@librechat/data-schemas';
import {
  Tools,
  Permissions,
  EToolResources,
  ToolCallTypes,
  PermissionTypes,
} from 'librechat-data-provider';
import type { Request as ServerRequest } from 'express';
import type { CheckAccessParams } from '../middleware/access';
import { checkAccessWithRequestCache } from '../middleware/access';

/**
 * Role permission that gates a built-in agent tool. The matching
 * `AgentCapabilities` entry is the instance-wide deployment switch; this is the
 * per-role grant, so a tool has to clear both.
 */
export const toolRolePermissions: Partial<Record<string, PermissionTypes>> = {
  [Tools.file_search]: PermissionTypes.FILE_SEARCH,
  [Tools.execute_code]: PermissionTypes.RUN_CODE,
};

/**
 * Role permission required to upload for a given tool resource — the other half
 * of the same door as {@link toolRolePermissions}. `code_interpreter` is the
 * Assistants-side name for the same capability `execute_code` covers on agents.
 */
export const toolResourceRolePermissions: Partial<Record<string, PermissionTypes>> = {
  [EToolResources.file_search]: PermissionTypes.FILE_SEARCH,
  [EToolResources.execute_code]: PermissionTypes.RUN_CODE,
  [EToolResources.code_interpreter]: PermissionTypes.RUN_CODE,
};

/**
 * Role permission that gates a native Assistants tool by its provider-side
 * `type`. These run inside the provider, never through the agent tool loaders,
 * so they have to be gated where the assistant is configured.
 */
export const assistantToolRolePermissions: Partial<Record<string, PermissionTypes>> = {
  [ToolCallTypes.FILE_SEARCH]: PermissionTypes.FILE_SEARCH,
  [ToolCallTypes.CODE_INTERPRETER]: PermissionTypes.RUN_CODE,
};

export interface CheckToolRolePermissionParams {
  req?: ServerRequest;
  user?: CheckAccessParams['user'] | null;
  permissionType: PermissionTypes;
  getRoleByName: CheckAccessParams['getRoleByName'];
  /** Prefix for the denial log line, e.g. `loadAgentTools`. */
  context?: string;
}

/**
 * Resolves a single `USE` grant through the per-request permission cache, so
 * repeat checks within one request cost no extra role read.
 *
 * Fails closed: a missing user or a check that throws denies the tool.
 */
export async function checkToolRolePermission({
  req,
  user,
  permissionType,
  getRoleByName,
  context = 'toolRolePermissions',
}: CheckToolRolePermissionParams): Promise<boolean> {
  let allowed = false;
  try {
    allowed = await checkAccessWithRequestCache({
      req,
      user: user as CheckAccessParams['user'],
      permissionType,
      permissions: [Permissions.USE],
      getRoleByName,
    });
  } catch {
    logger.error(`[${context}][User: ${user?.id}] Failed ${permissionType} permission check`);
  }

  if (!allowed) {
    logger.warn(
      `[${permissionType}] Forbidden: Insufficient permissions for User ${user?.id}: ${Permissions.USE}`,
    );
  }

  return allowed;
}

export interface ResolveToolRolePermissionsParams {
  req?: ServerRequest;
  /** Tool names as configured on the agent. */
  tools?: string[] | null;
  getRoleByName: CheckAccessParams['getRoleByName'];
  /**
   * Optional pre-filter. Tools this rejects are never checked, so a tool already
   * turned off by its `AgentCapabilities` switch costs no role read and logs no
   * denial.
   */
  isEligible?: (tool: string) => boolean;
  context?: string;
}

/**
 * Resolves role permissions for the gated tools an agent actually requests and
 * returns a synchronous predicate, so a capability filter can consult the result
 * inline. Tools carrying no role permission always pass.
 */
export async function resolveToolRolePermissions({
  req,
  tools,
  getRoleByName,
  isEligible,
  context = 'loadAgentTools',
}: ResolveToolRolePermissionsParams): Promise<(tool: string) => boolean> {
  const gated = new Set(
    (tools ?? []).filter(
      (tool) => toolRolePermissions[tool] != null && (isEligible?.(tool) ?? true),
    ),
  );
  if (gated.size === 0) {
    return () => true;
  }

  const granted = new Map<string, boolean>();
  for (const tool of gated) {
    granted.set(
      tool,
      await checkToolRolePermission({
        req,
        user: req?.user as CheckAccessParams['user'],
        permissionType: toolRolePermissions[tool] as PermissionTypes,
        getRoleByName,
        context,
      }),
    );
  }

  return (tool: string) => granted.get(tool) ?? true;
}
