import { normalizeServerName } from 'librechat-data-provider';
import type { MCPOptions } from 'librechat-data-provider';
import type { ParsedServerConfig } from '~/mcp/types';

export interface MCPServerContext {
  /** Config-source servers that needed lazy initialization. */
  configServers: Record<string, ParsedServerConfig>;
  /** Every configured server, in the normalized form tool keys are built from. */
  serverNames: string[];
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
  return {
    configServers: await ensureConfigServers(mcpConfig),
    serverNames: Object.keys(mcpConfig).map(normalizeServerName),
  };
}
