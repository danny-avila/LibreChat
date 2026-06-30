import { Constants } from 'librechat-data-provider';
import type { MCPServersResponse } from 'librechat-data-provider';
import type { MentionOption } from '~/common';

const { mcp_delimiter } = Constants;

export type McpToolMentionOption = MentionOption & {
  type: 'mcp-tool';
  serverName: string;
  toolName: string;
};

/**
 * Union of MCP server names exposed to the current chat, mirroring
 * `loadEphemeralAgent` in `packages/api/src/agents/load.ts`.
 */
export function resolveScopedMcpServerNames({
  globalServerNames,
  modelSpecServerNames,
  ephemeralMcpServers,
}: {
  globalServerNames: string[];
  modelSpecServerNames?: string[];
  ephemeralMcpServers?: string[];
}): Set<string> {
  const scoped = new Set<string>();
  for (const name of globalServerNames) {
    if (name) {
      scoped.add(name);
    }
  }
  if (modelSpecServerNames) {
    for (const name of modelSpecServerNames) {
      if (name) {
        scoped.add(name);
      }
    }
  }
  if (ephemeralMcpServers) {
    for (const name of ephemeralMcpServers) {
      if (name) {
        scoped.add(name);
      }
    }
  }
  return scoped;
}

/**
 * MCP servers whose tools belong in the `$` popover (user-invocable skill catalog).
 *
 * AIWP wires infrastructure MCPs (filesystem, excel) through modelSpec `mcpServers`
 * for agent runtime document generation. The SMB Team skill catalog lives on globally
 * configured servers such as `smbteam-mcp` that are not in that infrastructure list.
 *
 * `globalServerNames` should come from `GET /api/mcp/servers` (`useMCPServersQuery`), not
 * `startupConfig.mcpServers` — the startup config payload does not include MCP server keys.
 */
export function resolveMcpServersForSkillsPopover({
  globalServerNames,
  modelSpecInfrastructureServers,
  ephemeralMcpServers,
}: {
  globalServerNames: string[];
  modelSpecInfrastructureServers?: string[];
  ephemeralMcpServers?: string[];
}): Set<string> {
  const infrastructure = new Set(modelSpecInfrastructureServers ?? []);
  const scoped = new Set<string>();
  for (const name of globalServerNames) {
    if (name && !infrastructure.has(name)) {
      scoped.add(name);
    }
  }
  if (ephemeralMcpServers) {
    for (const name of ephemeralMcpServers) {
      if (name && !infrastructure.has(name)) {
        scoped.add(name);
      }
    }
  }
  return scoped;
}

export function parseMcpPluginKey(
  pluginKey: string,
): { toolName: string; serverName: string } | null {
  const delimiterIndex = pluginKey.indexOf(mcp_delimiter);
  if (delimiterIndex === -1) {
    return null;
  }
  const toolName = pluginKey.slice(0, delimiterIndex);
  const serverName = pluginKey.slice(delimiterIndex + mcp_delimiter.length);
  if (!toolName || !serverName) {
    return null;
  }
  return { toolName, serverName };
}

/**
 * Flatten scoped MCP servers into popover rows sorted by tool name.
 */
export function buildMcpToolMentionOptions(
  mcpTools: MCPServersResponse | undefined,
  scopedServerNames: Set<string>,
): McpToolMentionOption[] {
  if (!mcpTools?.servers || scopedServerNames.size === 0) {
    return [];
  }

  const options: McpToolMentionOption[] = [];
  for (const [serverName, server] of Object.entries(mcpTools.servers)) {
    if (!scopedServerNames.has(serverName)) {
      continue;
    }
    for (const tool of server.tools) {
      const parsed = parseMcpPluginKey(tool.pluginKey);
      options.push({
        type: 'mcp-tool',
        value: tool.pluginKey,
        label: tool.name,
        description: tool.description?.trim() ? tool.description : serverName,
        serverName: parsed?.serverName ?? serverName,
        toolName: parsed?.toolName ?? tool.name,
      });
    }
  }

  options.sort((a, b) => a.toolName.localeCompare(b.toolName));
  return options;
}

export function isMcpToolMention(option: MentionOption): option is McpToolMentionOption {
  return option.type === 'mcp-tool';
}

export function formatMcpToolHint(toolName: string): string {
  return `Use "${toolName}" to `;
}
