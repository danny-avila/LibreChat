/**
 * @fileoverview Utility functions for building tool registries from agent tool_options.
 * Tool classification (deferred_tools, allowed_callers) is configured via the agent UI.
 *
 * @module packages/api/src/tools/classification
 */

import { logger } from '@librechat/data-schemas';
import {
  createToolSearch,
  ToolSearchToolDefinition,
  BashProgrammaticToolCallingDefinition,
  createBashProgrammaticToolCallingTool,
} from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import type {
  LCToolRegistry,
  JsonSchemaType,
  AllowedCaller,
  GenericTool,
  LCTool,
} from '@librechat/agents';
import {
  parseMCPToolName,
  createProviderToolName,
  DEFAULT_TOOL_NAME_MAX_LENGTH,
  type LCToolWithMCPNameMetadata,
} from './names';

export type { LCTool, LCToolRegistry, AllowedCaller, JsonSchemaType };

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: JsonSchemaType;
  /** MCP server name extracted from tool name */
  serverName?: string;
  /** Original LibreChat MCP key: toolName_mcp_serverName */
  canonicalName?: string;
  /** Raw MCP tool name before LibreChat appends the server suffix */
  mcpRawName?: string;
}

/**
 * Extracts the MCP server name from a tool name.
 * Tool names follow the pattern: toolName_mcp_ServerName
 * @param toolName - The full tool name
 * @returns The server name or undefined if not an MCP tool
 */
export function getServerNameFromTool(toolName: string): string | undefined {
  return parseMCPToolName(toolName)?.serverName;
}

function createRegistryTool({
  tool,
  agentToolOptions,
  usedToolNames,
  toolNameMaxLength,
}: {
  tool: ToolDefinition;
  agentToolOptions?: AgentToolOptions;
  usedToolNames: Set<string>;
  toolNameMaxLength: number;
}): LCToolWithMCPNameMetadata {
  const { description, parameters } = tool;
  const canonicalName = tool.canonicalName ?? tool.name;
  const parsed = parseMCPToolName(canonicalName);
  const providerToolName = createProviderToolName({
    canonicalName,
    usedToolNames,
    maxLength: toolNameMaxLength,
  });
  usedToolNames.add(providerToolName);

  const agentOptions = agentToolOptions?.[canonicalName] ?? agentToolOptions?.[providerToolName];

  const allowed_callers: AllowedCaller[] =
    agentOptions?.allowed_callers && agentOptions.allowed_callers.length > 0
      ? agentOptions.allowed_callers
      : ['direct'];

  const defer_loading = agentOptions?.defer_loading === true;

  const toolDef: LCToolWithMCPNameMetadata = {
    name: providerToolName,
    allowed_callers,
    defer_loading,
    toolType: 'mcp',
    canonicalName,
    providerToolName,
    mcpRawName: tool.mcpRawName ?? parsed?.rawName,
  };

  if (description) {
    toolDef.description = description;
  }
  if (parameters) {
    toolDef.parameters = parameters;
  }
  if (tool.serverName || parsed?.serverName) {
    toolDef.serverName = tool.serverName ?? parsed?.serverName;
  }

  return toolDef;
}

/**
 * Builds a tool registry from agent-level tool_options.
 *
 * @param tools - Array of tool definitions
 * @param agentToolOptions - Per-tool configuration from the agent
 * @returns Map of tool name to tool definition with classification
 */
export function buildToolRegistryFromAgentOptions(
  tools: ToolDefinition[],
  agentToolOptions: AgentToolOptions,
  toolNameMaxLength = DEFAULT_TOOL_NAME_MAX_LENGTH,
): LCToolRegistry {
  const registry: LCToolRegistry = new Map();
  const usedToolNames = new Set<string>();
  const usedCanonicalNames = new Set<string>();

  for (const tool of tools) {
    const canonicalName = tool.canonicalName ?? tool.name;
    if (usedCanonicalNames.has(canonicalName)) {
      continue;
    }
    usedCanonicalNames.add(canonicalName);

    const toolDef = createRegistryTool({
      tool,
      agentToolOptions,
      usedToolNames,
      toolNameMaxLength,
    });
    registry.set(toolDef.name, toolDef);
  }

  return registry;
}

interface MCPToolInstance {
  name: string;
  description?: string;
  mcp?: boolean;
  /** Original JSON schema attached at MCP tool creation time */
  mcpJsonSchema?: JsonSchemaType;
}

/**
 * Extracts MCP tool definition from a loaded tool instance.
 * MCP tools have the original JSON schema attached as `mcpJsonSchema` property.
 *
 * @param tool - The loaded tool instance
 * @returns Tool definition
 */
export function extractMCPToolDefinition(tool: MCPToolInstance): ToolDefinition {
  const parsed = parseMCPToolName(tool.name);
  const def: ToolDefinition = {
    name: tool.name,
    canonicalName: tool.name,
    mcpRawName: parsed?.rawName,
  };

  if (tool.description) {
    def.description = tool.description;
  }

  if (tool.mcpJsonSchema) {
    def.parameters = tool.mcpJsonSchema;
  }

  if (parsed?.serverName) {
    def.serverName = parsed.serverName;
  }

  return def;
}

/**
 * Checks if a tool is an MCP tool based on its properties.
 * @param tool - The tool to check (can be any object with potential mcp property)
 * @returns Whether the tool is an MCP tool
 */
export function isMCPTool(tool: unknown): tool is MCPToolInstance {
  return typeof tool === 'object' && tool !== null && (tool as MCPToolInstance).mcp === true;
}

/**
 * Cleans up the temporary mcpJsonSchema property from MCP tools after registry is populated.
 * This property is only needed during registry building and can be safely removed afterward.
 *
 * @param tools - Array of tools to clean up
 */
export function cleanupMCPToolSchemas(tools: MCPToolInstance[]): void {
  for (const tool of tools) {
    if (tool.mcpJsonSchema !== undefined) {
      delete tool.mcpJsonSchema;
    }
  }
}

/** Builds tool registry from MCP tool definitions. */
function buildToolRegistry(
  mcpToolDefs: ToolDefinition[],
  agentToolOptions?: AgentToolOptions,
  toolNameMaxLength = DEFAULT_TOOL_NAME_MAX_LENGTH,
): LCToolRegistry {
  if (agentToolOptions && Object.keys(agentToolOptions).length > 0) {
    return buildToolRegistryFromAgentOptions(mcpToolDefs, agentToolOptions, toolNameMaxLength);
  }

  /** No agent options - build basic definitions for event-driven mode */
  const registry: LCToolRegistry = new Map<string, LCTool>();
  const usedToolNames = new Set<string>();
  const usedCanonicalNames = new Set<string>();
  for (const toolDef of mcpToolDefs) {
    const canonicalName = toolDef.canonicalName ?? toolDef.name;
    if (usedCanonicalNames.has(canonicalName)) {
      continue;
    }
    usedCanonicalNames.add(canonicalName);

    const registryTool = createRegistryTool({
      tool: toolDef,
      usedToolNames,
      toolNameMaxLength,
    });
    registry.set(registryTool.name, registryTool);
  }
  return registry;
}

/** Parameters for building tool classification and creating PTC/tool search tools */
export interface BuildToolClassificationParams {
  /** All loaded tools (will be filtered for MCP tools) */
  loadedTools: GenericTool[];
  /** User ID for auth lookup */
  userId: string;
  /** Agent ID (used for logging and context) */
  agentId?: string;
  /** Per-tool configuration from the agent */
  agentToolOptions?: AgentToolOptions;
  /** Whether the deferred_tools capability is enabled (from agent config) */
  deferredToolsEnabled?: boolean;
  /** Whether the programmatic_tools capability is enabled (from agent config) */
  programmaticToolsEnabled?: boolean;
  /** Whether code execution is enabled and requested by this agent */
  codeExecutionEnabled?: boolean;
  /** When true, skip creating tool instances (for event-driven mode) */
  definitionsOnly?: boolean;
  /** Optional host-supplied Code API auth headers for remote programmatic execution. */
  authHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /** Provider-facing maximum tool/function name length. */
  toolNameMaxLength?: number;
}

/** Result from building tool classification */
export interface BuildToolClassificationResult {
  /** Tool registry built from MCP tools (undefined if no MCP tools) */
  toolRegistry?: LCToolRegistry;
  /** Tool definitions array for event-driven execution (built simultaneously with registry) */
  toolDefinitions: LCTool[];
  /** Additional tools created (PTC and/or tool search) */
  additionalTools: GenericTool[];
  /** Whether any tools have defer_loading enabled (precomputed for efficiency) */
  hasDeferredTools: boolean;
}

/**
 * Checks if an agent's tools have any that match PTC patterns (programmatic only or dual context).
 * @param toolRegistry - The tool registry to check
 * @returns Whether any tools are configured for programmatic calling
 */
export function agentHasProgrammaticTools(toolRegistry: LCToolRegistry): boolean {
  for (const toolDef of toolRegistry.values()) {
    if (toolDef.allowed_callers?.includes('code_execution')) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an agent's tools have any that are deferred.
 * @param toolRegistry - The tool registry to check
 * @returns Whether any tools are configured as deferred
 */
export function agentHasDeferredTools(toolRegistry: LCToolRegistry): boolean {
  for (const toolDef of toolRegistry.values()) {
    if (toolDef.defer_loading === true) {
      return true;
    }
  }
  return false;
}

/**
 * Builds the tool registry from MCP tools and conditionally creates PTC and tool search tools.
 *
 * This function:
 * 1. Filters loaded tools for MCP tools
 * 2. Extracts tool definitions and builds the registry from agent's tool_options
 * 3. Cleans up temporary mcpJsonSchema properties
 * 4. Creates PTC tool only if capabilities allow the agent's programmatic tools
 * 5. Creates tool search tool only if agent has deferred tools
 *
 * @param params - Parameters including loaded tools, userId, agentId, agentToolOptions, and dependencies
 * @returns Tool registry and any additional tools created
 */
export async function buildToolClassification(
  params: BuildToolClassificationParams,
): Promise<BuildToolClassificationResult> {
  const {
    agentId,
    loadedTools,
    agentToolOptions,
    definitionsOnly = false,
    deferredToolsEnabled = true,
    programmaticToolsEnabled = false,
    codeExecutionEnabled = false,
    authHeaders,
    toolNameMaxLength = DEFAULT_TOOL_NAME_MAX_LENGTH,
  } = params;
  const additionalTools: GenericTool[] = [];

  const mcpTools = loadedTools.filter(isMCPTool);
  if (mcpTools.length === 0) {
    return {
      additionalTools,
      toolDefinitions: [],
      toolRegistry: undefined,
      hasDeferredTools: false,
    };
  }

  const mcpToolDefs = mcpTools.map(extractMCPToolDefinition);
  const toolRegistry: LCToolRegistry = buildToolRegistry(
    mcpToolDefs,
    agentToolOptions,
    toolNameMaxLength,
  );

  /** Clean up temporary mcpJsonSchema property from tools now that registry is populated */
  cleanupMCPToolSchemas(mcpTools);

  /**
   * Check if this agent actually has tools configured for these features.
   * Only enable PTC if code/programmatic capabilities allow the agent's programmatic tools.
   * Only enable tool search if the agent has deferred tools AND the capability is enabled.
   */
  const hasProgrammaticTools =
    programmaticToolsEnabled && codeExecutionEnabled && agentHasProgrammaticTools(toolRegistry);
  const hasDeferredTools = deferredToolsEnabled && agentHasDeferredTools(toolRegistry);

  /** Clear defer_loading if capability disabled */
  if (!deferredToolsEnabled) {
    for (const toolDef of toolRegistry.values()) {
      if (toolDef.defer_loading !== true) {
        continue;
      }
      toolDef.defer_loading = false;
    }
  }

  /** Build toolDefinitions array from registry (single pass, reused) */
  const toolDefinitions: LCTool[] = Array.from(toolRegistry.values());

  /** No programmatic or deferred tools - skip PTC/ToolSearch */
  if (!hasProgrammaticTools && !hasDeferredTools) {
    logger.debug(
      `[buildToolClassification] Agent ${agentId} has no programmatic or deferred tools, skipping PTC/ToolSearch`,
    );
    return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools: false };
  }

  /** Tool search uses local mode (no API key needed) */
  if (hasDeferredTools) {
    if (!definitionsOnly) {
      const toolSearchTool = createToolSearch({
        mode: 'local',
        toolRegistry,
      });
      additionalTools.push(toolSearchTool);
    }

    /** Add ToolSearch definition for event-driven mode */
    toolDefinitions.push({
      name: ToolSearchToolDefinition.name,
      description: ToolSearchToolDefinition.description,
      parameters: ToolSearchToolDefinition.schema as unknown as LCTool['parameters'],
    });
    toolRegistry.set(ToolSearchToolDefinition.name, {
      name: ToolSearchToolDefinition.name,
      allowed_callers: ['direct'],
    });

    logger.debug(`[buildToolClassification] Tool Search enabled for agent ${agentId}`);
  }

  if (!hasProgrammaticTools) {
    return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
  }

  /** In definitions-only mode, add PTC definition without creating the tool instance */
  if (definitionsOnly) {
    toolDefinitions.push({
      name: BashProgrammaticToolCallingDefinition.name,
      description: BashProgrammaticToolCallingDefinition.description,
      parameters: BashProgrammaticToolCallingDefinition.schema as unknown as LCTool['parameters'],
    });
    toolRegistry.set(BashProgrammaticToolCallingDefinition.name, {
      name: BashProgrammaticToolCallingDefinition.name,
      allowed_callers: ['direct'],
    });
    logger.debug(
      `[buildToolClassification] PTC definition added for agent ${agentId} (definitions only)`,
    );
    return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
  }

  try {
    const ptcTool = createBashProgrammaticToolCallingTool({ authHeaders } as Parameters<
      typeof createBashProgrammaticToolCallingTool
    >[0] & { authHeaders?: BuildToolClassificationParams['authHeaders'] });
    additionalTools.push(ptcTool);

    /** Add PTC definition for event-driven mode */
    toolDefinitions.push({
      name: BashProgrammaticToolCallingDefinition.name,
      description: BashProgrammaticToolCallingDefinition.description,
      parameters: BashProgrammaticToolCallingDefinition.schema as unknown as LCTool['parameters'],
    });
    toolRegistry.set(BashProgrammaticToolCallingDefinition.name, {
      name: BashProgrammaticToolCallingDefinition.name,
      allowed_callers: ['direct'],
    });

    logger.debug(`[buildToolClassification] PTC tool enabled for agent ${agentId}`);
  } catch (error) {
    logger.error('[buildToolClassification] Error creating PTC tool:', error);
  }

  return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
}
