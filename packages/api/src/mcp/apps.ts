/**
 * Reimplemented here so `@librechat/api` (emitted as CommonJS) never statically
 * imports the ESM-only `@modelcontextprotocol/ext-apps` package.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type * as t from './types';

export interface ToolWithMeta {
  _meta?: Record<string, unknown> | null;
}

type McpUiToolVisibility = 'model' | 'app';

interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: McpUiToolVisibility[];
}

export const RESOURCE_URI_META_KEY = 'ui/resourceUri';

export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

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
