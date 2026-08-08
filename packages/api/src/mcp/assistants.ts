import { logger } from '@librechat/data-schemas';
import { Constants, buildServerNameAliases, splitMCPToolKey } from 'librechat-data-provider';
import type { MCPOptions } from 'librechat-data-provider';
import type { LCAvailableTools, ParsedServerConfig } from '~/mcp/types';
import { findShadowedServerNames } from '~/mcp/utils';

export interface AssistantMCPUser {
  id?: string;
  role?: string;
}

export type AssistantToolReference = string | { type?: string; function?: { name?: string } };

export interface AssistantToolDefinitionsParams {
  user: AssistantMCPUser | undefined;
  tools?: readonly AssistantToolReference[];
  staticTools: LCAvailableTools;
  mcpConfig: Record<string, MCPOptions>;
}

export interface AssistantToolCatalogSnapshot {
  tools: LCAvailableTools | null;
  publicationGeneration?: string;
}

export interface AssistantToolDefinitionsDeps {
  ensureConfigServers: (
    mcpConfig: Record<string, MCPOptions>,
  ) => Promise<Record<string, ParsedServerConfig>>;
  getAllServerConfigs: (
    userId: string,
    configServers: Record<string, ParsedServerConfig>,
    role?: string,
  ) => Promise<Record<string, ParsedServerConfig>>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
    serverConfig: ParsedServerConfig,
  ) => Promise<LCAvailableTools | null>;
  getServerToolFunctionsSnapshot: (
    userId: string,
    serverName: string,
  ) => Promise<AssistantToolCatalogSnapshot>;
  recoverServerTools: (
    serverName: string,
    serverConfig: ParsedServerConfig,
  ) => Promise<LCAvailableTools | null>;
  cacheMCPServerTools: (params: {
    userId: string;
    serverName: string;
    serverTools: LCAvailableTools;
    serverConfig: ParsedServerConfig;
    publicationGeneration?: string;
  }) => Promise<void>;
}

function isMCPToolReference(tool: AssistantToolReference): tool is string {
  return typeof tool === 'string' && tool.includes(Constants.mcp_delimiter);
}

async function resolveAssistantMcpConfigs(
  userId: string,
  role: string | undefined,
  mcpConfig: Record<string, MCPOptions>,
  deps: AssistantToolDefinitionsDeps,
): Promise<Record<string, ParsedServerConfig>> {
  const configServers = await deps.ensureConfigServers(mcpConfig);
  return deps.getAllServerConfigs(userId, configServers, role);
}

function selectReferencedServers(
  toolNames: readonly string[],
  configs: Record<string, ParsedServerConfig>,
): Set<string> {
  const serverNames = Object.keys(configs);
  const aliases = buildServerNameAliases(serverNames);
  const knownNames = [...new Set([...serverNames, ...aliases.keys()])];
  const shadowed = findShadowedServerNames(serverNames);

  return toolNames.reduce((selected, toolName) => {
    const [, parsedServerName] = splitMCPToolKey(toolName, knownNames);
    const serverName =
      parsedServerName != null && Object.prototype.hasOwnProperty.call(configs, parsedServerName)
        ? parsedServerName
        : aliases.get(parsedServerName ?? '');
    if (serverName && !shadowed.has(serverName)) {
      selected.add(serverName);
    }
    return selected;
  }, new Set<string>());
}

async function loadServerCatalog(
  userId: string,
  serverName: string,
  serverConfig: ParsedServerConfig,
  deps: AssistantToolDefinitionsDeps,
): Promise<LCAvailableTools> {
  const cached = await deps.getMCPServerTools(userId, serverName, serverConfig);
  if (cached != null) {
    return cached;
  }

  const snapshot = await deps.getServerToolFunctionsSnapshot(userId, serverName);
  if (snapshot.tools != null) {
    void deps
      .cacheMCPServerTools({
        userId,
        serverName,
        serverTools: snapshot.tools,
        serverConfig,
        publicationGeneration: snapshot.publicationGeneration,
      })
      .catch((error) =>
        logger.error(
          `[assistant tool definitions] Failed to cache tools for ${serverName}:`,
          error,
        ),
      );
    return snapshot.tools;
  }

  const recovered = await deps.recoverServerTools(serverName, serverConfig);
  if (recovered != null) {
    return recovered;
  }
  throw new Error(`MCP tool definitions unavailable for assistant server "${serverName}"`);
}

/** Loads the static catalog with the configuration-addressed MCP slices referenced by an assistant. */
export async function getAssistantToolDefinitions(
  params: AssistantToolDefinitionsParams,
  deps: AssistantToolDefinitionsDeps,
): Promise<LCAvailableTools> {
  const mcpToolNames =
    params.tools?.filter(
      (tool): tool is string =>
        isMCPToolReference(tool) && !Object.prototype.hasOwnProperty.call(params.staticTools, tool),
    ) ?? [];
  const userId = params.user?.id;
  if (mcpToolNames.length === 0 || !userId) {
    return params.staticTools;
  }

  const configs = await resolveAssistantMcpConfigs(
    userId,
    params.user?.role,
    params.mcpConfig,
    deps,
  );
  const serverCatalogs = await Promise.all(
    Array.from(selectReferencedServers(mcpToolNames, configs), (serverName) =>
      loadServerCatalog(userId, serverName, configs[serverName], deps),
    ),
  );
  return Object.assign({}, params.staticTools, ...serverCatalogs);
}
