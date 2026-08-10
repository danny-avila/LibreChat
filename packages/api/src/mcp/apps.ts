/**
 * Reimplemented here so `@librechat/api` (emitted as CommonJS) never statically
 * imports the ESM-only `@modelcontextprotocol/ext-apps` package.
 */

import { logger } from '@librechat/data-schemas';
import { MCP_APP_MIME_TYPE } from 'librechat-data-provider';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { PluginAuthMethods, TokenMethods, IUser } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type * as t from './types';
import { getServerCustomUserVars, getUserMCPAuthMap } from './auth';

export interface ToolWithMeta {
  _meta?: Record<string, unknown> | null;
}

type McpUiToolVisibility = 'model' | 'app';

interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: McpUiToolVisibility[];
}

export const RESOURCE_URI_META_KEY = 'ui/resourceUri';

export const RESOURCE_MIME_TYPE: string = MCP_APP_MIME_TYPE;

export function getToolUiResourceUri(tool: ToolWithMeta): string | undefined {
  const uiMeta = tool._meta?.ui as McpUiToolMeta | undefined;
  let uri: unknown = uiMeta?.resourceUri;

  if (uri === undefined) {
    uri = tool._meta?.[RESOURCE_URI_META_KEY];
  }

  if (typeof uri === 'string' && uri.startsWith('ui://')) {
    return uri;
  } else if (uri !== undefined) {
    throw new Error(`Invalid UI resource URI: ${JSON.stringify(uri)}`);
  }
  return undefined;
}

/**
 * Visibility defaults to both scopes only when the field is absent. Once a server sends an explicit
 * array, a scope is granted only if the array includes it, so an empty or future-scoped array (e.g.
 * `[]`, `['model','internal']`) hides the tool from whichever scope it omits.
 */
export function isToolHiddenFromApp(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && !visibility.includes('app');
}

export function isToolHiddenFromModel(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && !visibility.includes('model');
}

/** Declared here rather than importing MCPManager to avoid a circular import. */
export interface MCPAppsProxyManager {
  readResource(args: {
    userId: string;
    serverName: string;
    uri: string;
    user?: IUser;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown>;
  listResources(args: {
    userId: string;
    serverName: string;
    user?: IUser;
    cursor?: string;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown>;
  listResourceTemplates(args: {
    userId: string;
    serverName: string;
    user?: IUser;
    cursor?: string;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown>;
  appToolCall(args: {
    userId: string;
    serverName: string;
    toolName: string;
    toolArguments: Record<string, unknown>;
    user?: IUser;
    configServers?: Record<string, t.ParsedServerConfig>;
    customUserVars?: Record<string, string>;
    flowManager?: FlowStateManager<MCPOAuthTokens | null>;
    tokenMethods?: TokenMethods;
  }): Promise<unknown>;
}

export interface MCPAppRequestContext {
  userId: string;
  serverName: string;
  user?: IUser;
  configServers?: Record<string, t.ParsedServerConfig>;
  customUserVars?: Record<string, string>;
  flowManager?: FlowStateManager<MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
}

/**
 * Resolves the request-scoped config and auth context so app follow-up requests can reconnect to
 * config-sourced servers even when the original tool-call connection is gone.
 *
 * Fails closed on both config and auth resolution: a transient lookup failure must reject rather
 * than fall back to the base config (wrong server) or to unresolved/stale credentials. A user who
 * genuinely has no vars still resolves to an empty map without throwing, so that path proceeds.
 * `resolveConfigServers` is supplied by the caller because it is bound to the HTTP request.
 */
export async function resolveAppRequestContext({
  userId,
  serverName,
  user,
  resolveConfigServers,
  findPluginAuthsByKeys,
  flowManager,
  tokenMethods,
}: {
  userId: string;
  serverName: string;
  user?: IUser;
  resolveConfigServers: () => Promise<Record<string, t.ParsedServerConfig>>;
  findPluginAuthsByKeys: PluginAuthMethods['findPluginAuthsByKeys'];
  flowManager?: FlowStateManager<MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
}): Promise<MCPAppRequestContext> {
  const [configServers, userMCPAuthMap] = await Promise.all([
    resolveConfigServers(),
    getUserMCPAuthMap({
      userId,
      servers: [serverName],
      findPluginAuthsByKeys,
      throwOnError: true,
    }).catch((error) => {
      logger.error(
        `[resolveAppRequestContext] Failed to resolve MCP auth values for user ${userId}, server ${serverName}; failing closed`,
        error,
      );
      throw error;
    }),
  ]);
  return {
    userId,
    serverName,
    user,
    configServers,
    customUserVars: getServerCustomUserVars(userMCPAuthMap, serverName),
    flowManager,
    tokenMethods,
  };
}

/** A denied app request is an expected client error, not a host fault. */
export function isDeniedAppRequest(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === ErrorCode.InvalidRequest
  );
}

export function buildAppProxyErrorResponse(
  error: unknown,
  fallbackMessage: string,
): { status: number; body: { error: string } } {
  if (isDeniedAppRequest(error)) {
    return { status: 400, body: { error: (error as Error).message } };
  }
  return { status: 500, body: { error: fallbackMessage } };
}

export async function readAppResource(
  manager: MCPAppsProxyManager,
  ctx: MCPAppRequestContext,
  uri: unknown,
): Promise<unknown> {
  if (!ctx.serverName) {
    throw new McpError(ErrorCode.InvalidRequest, 'serverName and uri are required');
  }
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new McpError(ErrorCode.InvalidRequest, 'uri must be a non-empty string');
  }
  return manager.readResource({
    userId: ctx.userId,
    serverName: ctx.serverName,
    uri,
    user: ctx.user,
    configServers: ctx.configServers,
    customUserVars: ctx.customUserVars,
    flowManager: ctx.flowManager,
    tokenMethods: ctx.tokenMethods,
  });
}

export async function listAppResources(
  manager: MCPAppsProxyManager,
  ctx: MCPAppRequestContext,
  cursor: unknown,
): Promise<unknown> {
  if (!ctx.serverName) {
    throw new McpError(ErrorCode.InvalidRequest, 'serverName is required');
  }
  if (cursor !== undefined && typeof cursor !== 'string') {
    throw new McpError(ErrorCode.InvalidRequest, 'cursor must be a string');
  }
  return manager.listResources({
    userId: ctx.userId,
    serverName: ctx.serverName,
    user: ctx.user,
    cursor,
    configServers: ctx.configServers,
    customUserVars: ctx.customUserVars,
    flowManager: ctx.flowManager,
    tokenMethods: ctx.tokenMethods,
  });
}

export async function listAppResourceTemplates(
  manager: MCPAppsProxyManager,
  ctx: MCPAppRequestContext,
  cursor: unknown,
): Promise<unknown> {
  if (!ctx.serverName) {
    throw new McpError(ErrorCode.InvalidRequest, 'serverName is required');
  }
  if (cursor !== undefined && typeof cursor !== 'string') {
    throw new McpError(ErrorCode.InvalidRequest, 'cursor must be a string');
  }
  return manager.listResourceTemplates({
    userId: ctx.userId,
    serverName: ctx.serverName,
    user: ctx.user,
    cursor,
    configServers: ctx.configServers,
    customUserVars: ctx.customUserVars,
    flowManager: ctx.flowManager,
    tokenMethods: ctx.tokenMethods,
  });
}

export async function callAppTool(
  manager: MCPAppsProxyManager,
  ctx: MCPAppRequestContext,
  toolName: unknown,
  toolArguments: unknown,
): Promise<unknown> {
  if (!ctx.serverName || !toolName) {
    throw new McpError(ErrorCode.InvalidRequest, 'serverName and toolName are required');
  }
  if (
    toolArguments !== undefined &&
    toolArguments !== null &&
    (typeof toolArguments !== 'object' || Array.isArray(toolArguments))
  ) {
    throw new McpError(ErrorCode.InvalidRequest, 'arguments must be an object');
  }
  return manager.appToolCall({
    userId: ctx.userId,
    serverName: ctx.serverName,
    toolName: toolName as string,
    toolArguments: (toolArguments as Record<string, unknown>) || {},
    user: ctx.user,
    configServers: ctx.configServers,
    customUserVars: ctx.customUserVars,
    flowManager: ctx.flowManager,
    tokenMethods: ctx.tokenMethods,
  });
}
