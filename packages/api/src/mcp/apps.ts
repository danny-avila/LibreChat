/**
 * MCP Apps tool-metadata helpers, mirrored from the spec's reference
 * implementation in `@modelcontextprotocol/ext-apps`. They are reimplemented
 * here so `@librechat/api` (emitted as CommonJS) never statically imports the
 * ESM-only ext-apps package; the client bundle keeps importing ext-apps directly.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { TokenMethods, IUser } from '@librechat/data-schemas';
import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './oauth';
import type * as t from './types';

interface ToolWithMeta {
  _meta?: Record<string, unknown> | null;
}

type McpUiToolVisibility = 'model' | 'app';

interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: McpUiToolVisibility[];
}

/** Deprecated flat metadata key for a tool's UI resource URI. */
export const RESOURCE_URI_META_KEY = 'ui/resourceUri';

/** MIME type identifying HTML content as an MCP App UI resource. */
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Extract a tool's UI resource URI. Prefers the nested `_meta.ui.resourceUri`
 * format and falls back to the deprecated flat `_meta["ui/resourceUri"]`.
 * Throws if a URI is present but does not use the `ui://` scheme.
 */
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

/** True when a tool is exposed to the model only (never callable from an app). */
export function isToolVisibilityModelOnly(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && visibility.length === 1 && visibility[0] === 'model';
}

/** True when a tool is exposed to the app only (hidden from the model). */
export function isToolVisibilityAppOnly(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && visibility.length === 1 && visibility[0] === 'app';
}

/**
 * Structural manager interface backing the MCP App proxy services. Declared here
 * rather than importing MCPManager so this module stays free of a circular import
 * (MCPManager imports the helpers above). The argument shapes mirror MCPManager.
 */
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

/** Request-scoped context shared by every MCP App proxy service. */
export interface MCPAppRequestContext {
  userId: string;
  serverName: string;
  user?: IUser;
  configServers?: Record<string, t.ParsedServerConfig>;
  customUserVars?: Record<string, string>;
  flowManager?: FlowStateManager<MCPOAuthTokens | null>;
  tokenMethods?: TokenMethods;
}

/** Reads an MCP App resource after validating the server name and uri. */
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

/** Lists MCP App resources after validating the server name and optional cursor. */
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

/** Lists MCP App resource templates after validating the server name and optional cursor. */
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

/** Proxies an MCP App tool call after validating the server name, tool name, and arguments. */
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
