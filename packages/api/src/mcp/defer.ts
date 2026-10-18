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
   * Defers a qualifying server that is waiting on sign-in, offering the tool catalog its
   * operator declared and withdrawing the turn-start prompt. Null keeps that prompt.
   */
  deferSignIn: (serverName: string, serverConfig: ParsedServerConfig) => LCAvailableTools | null;
  /**
   * The tools a reconnect attempt yields: the declared catalog when the attempt found none
   * because the server is waiting on a sign-in this turn may defer, otherwise its own tools.
   */
  resolveReconnectTools: (
    serverName: string,
    serverConfig: ParsedServerConfig,
    tools: LCAvailableTools | null | undefined,
  ) => LCAvailableTools | null;
  /** Whether the server's sign-in is already settled this turn: prompted for, or deferred. */
  hasSignInDecision: (serverName: string) => boolean;
}

/** Tracks, for one turn's tool loading, which servers leave sign-in to the first tool call. */
export function createMCPOAuthDeferral({
  tools,
  toolOptions,
  deferredToolsEnabled,
  knownServerNames,
  pendingOAuthServers,
  pendingOAuthStarts,
  rememberAvailableTools,
}: {
  tools: readonly string[];
  toolOptions?: AgentToolOptions;
  deferredToolsEnabled: boolean;
  knownServerNames?: readonly string[];
  /** Servers whose turn-start sign-in prompt is queued. */
  pendingOAuthServers: Pick<Set<string>, 'has' | 'delete'>;
  /** Queued turn-start sign-in prompts, by server. */
  pendingOAuthStarts: Pick<Map<string, unknown>, 'delete'>;
  rememberAvailableTools: (serverName: string, availableTools: LCAvailableTools) => void;
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
  const deferSignIn = (
    serverName: string,
    serverConfig: ParsedServerConfig,
  ): LCAvailableTools | null => {
    if (!qualifies(serverName, serverConfig)) {
      return null;
    }
    const catalog = formatMCPServerTools(serverName, serverConfig.oauthToolCatalog ?? []);
    if (Object.keys(catalog).length === 0) {
      return null;
    }
    deferred.add(serverName);
    pendingOAuthServers.delete(serverName);
    pendingOAuthStarts.delete(serverName);
    rememberAvailableTools(serverName, catalog);
    return catalog;
  };
  return {
    defer: (serverName, serverConfig) => {
      if (!qualifies(serverName, serverConfig)) {
        return false;
      }
      deferred.add(serverName);
      return true;
    },
    deferSignIn,
    resolveReconnectTools: (serverName, serverConfig, availableTools) => {
      const found = availableTools != null && Object.keys(availableTools).length > 0;
      if (!found && pendingOAuthServers.has(serverName)) {
        return deferSignIn(serverName, serverConfig);
      }
      return availableTools || null;
    },
    hasSignInDecision: (serverName) =>
      pendingOAuthServers.has(serverName) || deferred.has(serverName),
  };
}
