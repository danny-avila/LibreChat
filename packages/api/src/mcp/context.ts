import { normalizeServerName } from 'librechat-data-provider';
import type { MCPOptions } from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';

export interface MCPServerContext {
  /** Config-source servers that needed lazy initialization. */
  configServers: Record<string, ParsedServerConfig>;
  /** Every configured server, in the normalized form tool keys are built from. */
  serverNames: string[];
  /** Every configured server under its raw config name — the form the
   *  registry, config maps, tool cache, and plugin-auth rows are keyed by.
   *  Consumers that parse a (normalized) server out of a tool key resolve
   *  back to these via `buildServerNameAliases`. */
  rawServerNames: string[];
}

export interface ResolveMCPServerContextParams {
  mcpConfig: Record<string, MCPOptions>;
  ensureConfigServers: (
    mcpConfig: Record<string, MCPOptions>,
  ) => Promise<Record<string, ParsedServerConfig>>;
}

/**
 * Resolves the MCP server context for one request from a single config snapshot.
 *
 * `ensureConfigServers` deliberately skips unmodified YAML servers, so its keys are
 * not the configured set. Tool-key boundary resolution needs every configured name,
 * normalized the way keys embed it, or a server absent from the lazy-init result
 * silently falls back to positional parsing.
 */
export async function resolveMCPServerContext({
  mcpConfig,
  ensureConfigServers,
}: ResolveMCPServerContextParams): Promise<MCPServerContext> {
  const rawServerNames = Object.keys(mcpConfig);
  return {
    configServers: await ensureConfigServers(mcpConfig),
    serverNames: rawServerNames.map(normalizeServerName),
    rawServerNames,
  };
}
