import { Constants, splitMCPToolKey } from 'librechat-data-provider';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from '~/mcp/types';
import { canDeferOAuthSignIn, isMCPAllPlaceholder } from '~/mcp/utils';
import { formatMCPServerTools } from '~/mcp/tools';

const serverPinPrefix = `${Constants.mcp_server}${Constants.mcp_delimiter}`;

/**
 * Whether a turn may skip the up-front sign-in for a server and leave it to the server's
 * first tool call. That holds only when the server opts in with `oauthPrompt: on_use` and
 * every tool the agent selected from it is deferred, so the model can only reach those tools
 * through tool search and nothing in the turn needs them before it asks for one.
 */
export function shouldDeferMCPOAuthSignIn({
  serverName,
  serverConfig,
  tools,
  toolOptions,
  deferredToolsEnabled,
  knownServerNames,
}: {
  serverName: string;
  serverConfig: ParsedServerConfig;
  tools: readonly string[];
  toolOptions?: AgentToolOptions;
  deferredToolsEnabled: boolean;
  knownServerNames?: readonly string[];
}): boolean {
  if (!deferredToolsEnabled || !canDeferOAuthSignIn(serverConfig)) {
    return false;
  }
  let selected = 0;
  for (const tool of tools) {
    if (tool.startsWith(serverPinPrefix)) {
      continue;
    }
    const [, toolServerName] = splitMCPToolKey(tool, knownServerNames);
    if (toolServerName !== serverName) {
      continue;
    }
    if (isMCPAllPlaceholder(tool) || toolOptions?.[tool]?.defer_loading !== true) {
      return false;
    }
    selected++;
  }
  return selected > 0;
}

export interface MCPOAuthDeferral {
  /**
   * Defers the server's sign-in when it qualifies; for a caller that already holds the
   * user's own catalog, so only the turn-start prompt is skipped.
   */
  defer: (serverName: string, serverConfig: ParsedServerConfig) => boolean;
  /**
   * Defers a qualifying server with the tool catalog its operator declared, for a user who has
   * no catalog of their own yet. Null keeps the turn-start sign-in.
   */
  takeDeclaredCatalog: (
    serverName: string,
    serverConfig: ParsedServerConfig,
  ) => LCAvailableTools | null;
  /** Whether this turn already left the server's sign-in to its first tool call. */
  isDeferred: (serverName: string) => boolean;
}

/** Tracks, for one turn's tool loading, which servers leave sign-in to the first tool call. */
export function createMCPOAuthDeferral({
  tools,
  toolOptions,
  deferredToolsEnabled,
  knownServerNames,
}: {
  tools: readonly string[];
  toolOptions?: AgentToolOptions;
  deferredToolsEnabled: boolean;
  knownServerNames?: readonly string[];
}): MCPOAuthDeferral {
  const deferred = new Set<string>();
  const qualifies = (serverName: string, serverConfig: ParsedServerConfig): boolean =>
    shouldDeferMCPOAuthSignIn({
      serverName,
      serverConfig,
      tools,
      toolOptions,
      deferredToolsEnabled,
      knownServerNames,
    });
  return {
    defer: (serverName, serverConfig) => {
      if (!qualifies(serverName, serverConfig)) {
        return false;
      }
      deferred.add(serverName);
      return true;
    },
    takeDeclaredCatalog: (serverName, serverConfig) => {
      if (!qualifies(serverName, serverConfig)) {
        return null;
      }
      const catalog = formatMCPServerTools(serverName, serverConfig.oauthToolCatalog ?? []);
      if (Object.keys(catalog).length === 0) {
        return null;
      }
      deferred.add(serverName);
      return catalog;
    },
    isDeferred: (serverName) => deferred.has(serverName),
  };
}
