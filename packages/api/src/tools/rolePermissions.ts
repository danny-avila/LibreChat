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
  /** The v1 builder submits `retrieval` where v2 submits `file_search`; both are
   *  the same provider capability, so both answer to the same grant. */
  [ToolCallTypes.RETRIEVAL]: PermissionTypes.FILE_SEARCH,
  [ToolCallTypes.CODE_INTERPRETER]: PermissionTypes.RUN_CODE,
};

export interface CheckToolRolePermissionParams {
  req?: ServerRequest;
  user?: CheckAccessParams['user'] | null;
  permissionType: PermissionTypes;
  getRoleByName: CheckAccessParams['getRoleByName'];
  /** Prefix for the denial log line, e.g. `loadAgentTools`. */
  context?: string;
  /**
   * Rethrow when the role lookup itself fails, instead of reporting a denial.
   *
   * Denying on error is right where a denial blocks the operation. It is wrong
   * where a denial instead *filters* a payload the caller then persists: there,
   * a transient outage would silently strip an assistant's native tools and save
   * the result. Callers that mutate pass this so the write aborts instead.
   */
  throwOnError?: boolean;
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
  throwOnError = false,
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
  } catch (error) {
    logger.error(`[${context}][User: ${user?.id}] Failed ${permissionType} permission check`);
    if (throwOnError) {
      throw error;
    }
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

export interface CheckToolResourceUploadParams {
  req?: ServerRequest;
  /** `tool_resource` as posted by the client. */
  toolResource?: string | null;
  getRoleByName: CheckAccessParams['getRoleByName'];
}

/**
 * Authorizes an upload destined for a role-gated tool resource. Shared by every
 * upload handler that accepts `tool_resource` — the ordinary `/files` route and
 * `/files/images`, which routes agent uploads of its own.
 *
 * Resolves to `allowed` for a resource that carries no role permission.
 */
export async function checkToolResourceUploadPermission({
  req,
  toolResource,
  getRoleByName,
}: CheckToolResourceUploadParams): Promise<boolean> {
  const permissionType = toolResource != null ? toolResourceRolePermissions[toolResource] : null;
  if (permissionType == null) {
    return true;
  }

  return await checkToolRolePermission({
    req,
    user: req?.user as CheckAccessParams['user'],
    permissionType,
    getRoleByName,
    context: 'upload',
  });
}

export interface ResolveAssistantToolPermissionsParams {
  req?: ServerRequest;
  /** Tools as posted: names, or provider definitions carrying a `type`. */
  tools?: Array<string | { type?: string } | null | undefined> | null;
  getRoleByName: CheckAccessParams['getRoleByName'];
}

/**
 * Resolves which native Assistants tools the role may configure, and returns a
 * synchronous predicate for filtering a tool payload.
 *
 * Native tools run inside the provider and never reach the agent tool loaders,
 * so the assistant writers are where they have to be gated.
 *
 * Every caller either persists the filtered payload or rejects the request, so a
 * role lookup that fails propagates rather than reporting a denial: treating an
 * outage as "not permitted" here would quietly strip an assistant's native tools
 * and save that as its new configuration.
 */
export async function resolveAssistantToolPermissions({
  req,
  tools,
  getRoleByName,
}: ResolveAssistantToolPermissionsParams): Promise<
  (tool: string | { type?: string } | null | undefined) => boolean
> {
  const toolType = (tool: string | { type?: string } | null | undefined) =>
    typeof tool === 'string' ? tool : tool?.type;
  const requested = new Set(
    (tools ?? [])
      .map(toolType)
      .filter((type): type is string => type != null && assistantToolRolePermissions[type] != null),
  );
  if (requested.size === 0) {
    return () => true;
  }

  const denied = new Set<string>();
  for (const type of requested) {
    const allowed = await checkToolRolePermission({
      req,
      user: req?.user as CheckAccessParams['user'],
      permissionType: assistantToolRolePermissions[type] as PermissionTypes,
      getRoleByName,
      context: 'assistants',
      throwOnError: true,
    });
    if (!allowed) {
      denied.add(type);
    }
  }

  return (tool) => {
    const type = toolType(tool);
    return type == null || !denied.has(type);
  };
}

/** Memoizes the resolved grants for the lifetime of one request. */
const toolRoleGrantsKey = Symbol.for('librechat.toolRoleGrants');

export interface ToolRoleGrants {
  /** `RUN_CODE.USE` — the sandbox, its file tools, and PTC. */
  runCode: boolean;
  /** `FILE_SEARCH.USE` — the search tool and its uploads. */
  fileSearch: boolean;
}

export interface ResolveToolRoleGrantsParams {
  req?: ServerRequest;
  getRoleByName: CheckAccessParams['getRoleByName'];
  context?: string;
}

/**
 * Resolves both tool grants for a request, once.
 *
 * Every gate on `AgentCapabilities.execute_code` / `file_search` reads its role
 * half from here, so a boundary is authorized by pairing the capability with a
 * field of this object rather than by repeating a permission check. The two
 * lookups run together and the result is memoized on the request, so a startup
 * that consults several gates — the tool loader, the agent initializer, an
 * upload handler — pays one role read between them.
 *
 * Callers that want the read off their critical path can start it early without
 * awaiting; the memoized promise is what later callers join.
 *
 * Fails closed: a missing user or a check that throws denies both.
 */
export function resolveToolRoleGrants({
  req,
  getRoleByName,
  context = 'toolRoleGrants',
}: ResolveToolRoleGrantsParams): Promise<ToolRoleGrants> {
  const cache = req as
    | (ServerRequest & { [toolRoleGrantsKey]?: Promise<ToolRoleGrants> })
    | undefined;
  const memoized = cache?.[toolRoleGrantsKey];
  if (memoized) {
    return memoized;
  }

  const pending = Promise.all([
    checkToolRolePermission({
      req,
      user: req?.user as CheckAccessParams['user'],
      permissionType: PermissionTypes.RUN_CODE,
      getRoleByName,
      context,
    }),
    checkToolRolePermission({
      req,
      user: req?.user as CheckAccessParams['user'],
      permissionType: PermissionTypes.FILE_SEARCH,
      getRoleByName,
      context,
    }),
  ]).then(([runCode, fileSearch]) => ({ runCode, fileSearch }));

  if (cache) {
    Object.defineProperty(cache, toolRoleGrantsKey, { value: pending, enumerable: false });
  }

  return pending;
}
