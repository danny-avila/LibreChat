/**
 * @fileoverview Utility functions for building tool registries from agent tool_options.
 * Tool classification (deferred_tools, allowed_callers) is configured via the agent UI.
 *
 * @module packages/api/src/tools/classification
 */

import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import {
  EnvVar,
  createToolSearch,
  ToolSearchToolDefinition,
  createProgrammaticToolCallingTool,
  ProgrammaticToolCallingDefinition,
} from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import type {
  LCToolRegistry,
  JsonSchemaType,
  AllowedCaller,
  GenericTool,
  LCTool,
} from '@librechat/agents';

export type { LCTool, LCToolRegistry, AllowedCaller, JsonSchemaType };

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: JsonSchemaType;
  /** MCP server name extracted from tool name */
  serverName?: string;
}

/**
 * Extracts the MCP server name from a tool name.
 * Tool names follow the pattern: toolName_mcp_ServerName
 * @param toolName - The full tool name
 * @returns The server name or undefined if not an MCP tool
 */
export function getServerNameFromTool(toolName: string): string | undefined {
  const parts = toolName.split(Constants.mcp_delimiter);
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return undefined;
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
): LCToolRegistry {
  const registry: LCToolRegistry = new Map();

  for (const tool of tools) {
    const { name, description, parameters } = tool;
    const agentOptions = agentToolOptions[name];

    const allowed_callers: AllowedCaller[] =
      agentOptions?.allowed_callers && agentOptions.allowed_callers.length > 0
        ? agentOptions.allowed_callers
        : ['direct'];

    const defer_loading = agentOptions?.defer_loading === true;

    const toolDef: LCTool = {
      name,
      allowed_callers,
      defer_loading,
      toolType: 'mcp',
    };

    if (description) {
      toolDef.description = description;
    }
    if (parameters) {
      toolDef.parameters = parameters;
    }
    if (tool.serverName) {
      toolDef.serverName = tool.serverName;
    }

    registry.set(name, toolDef);
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
  const def: ToolDefinition = { name: tool.name };

  if (tool.description) {
    def.description = tool.description;
  }

  if (tool.mcpJsonSchema) {
    def.parameters = tool.mcpJsonSchema;
  }

  const serverName = getServerNameFromTool(tool.name);
  if (serverName) {
    def.serverName = serverName;
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
): LCToolRegistry {
  if (agentToolOptions && Object.keys(agentToolOptions).length > 0) {
    return buildToolRegistryFromAgentOptions(mcpToolDefs, agentToolOptions);
  }

  /** No agent options - build basic definitions for event-driven mode */
  const registry: LCToolRegistry = new Map<string, LCTool>();
  for (const toolDef of mcpToolDefs) {
    registry.set(toolDef.name, {
      name: toolDef.name,
      description: toolDef.description,
      parameters: toolDef.parameters,
      serverName: toolDef.serverName,
      toolType: 'mcp',
    });
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
  /** When true, skip creating tool instances (for event-driven mode) */
  definitionsOnly?: boolean;
  /** Function to load auth values (dependency injection) */
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
  }) => Promise<Record<string, string>>;
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
 * 4. Creates PTC tool only if agent has tools configured for programmatic calling
 * 5. Creates tool search tool only if agent has deferred tools
 *
 * @param params - Parameters including loaded tools, userId, agentId, agentToolOptions, and dependencies
 * @returns Tool registry and any additional tools created
 */
export async function buildToolClassification(
  params: BuildToolClassificationParams,
): Promise<BuildToolClassificationResult> {
  const {
    userId,
    agentId,
    loadedTools,
    agentToolOptions,
    definitionsOnly = false,
    deferredToolsEnabled = true,
    loadAuthValues,
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
  const toolRegistry: LCToolRegistry = buildToolRegistry(mcpToolDefs, agentToolOptions);

  /** Clean up temporary mcpJsonSchema property from tools now that registry is populated */
  cleanupMCPToolSchemas(mcpTools);

  /**
   * Check if this agent actually has tools configured for these features.
   * Only enable PTC if the agent has programmatic tools.
   * Only enable tool search if the agent has deferred tools AND the capability is enabled.
   */
  const hasProgrammaticTools = agentHasProgrammaticTools(toolRegistry);
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

  /** PTC requires CODE_API_KEY for sandbox execution */
  if (!hasProgrammaticTools) {
    return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
  }

  /** In definitions-only mode, add PTC definition without creating the tool instance */
  if (definitionsOnly) {
    toolDefinitions.push({
      name: ProgrammaticToolCallingDefinition.name,
      description: ProgrammaticToolCallingDefinition.description,
      parameters: ProgrammaticToolCallingDefinition.schema as unknown as LCTool['parameters'],
    });
    toolRegistry.set(ProgrammaticToolCallingDefinition.name, {
      name: ProgrammaticToolCallingDefinition.name,
      allowed_callers: ['direct'],
    });
    logger.debug(
      `[buildToolClassification] PTC definition added for agent ${agentId} (definitions only)`,
    );
    return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
  }

  try {
    const authValues = await loadAuthValues({
      userId,
      authFields: [EnvVar.CODE_API_KEY],
    });
    const codeApiKey = authValues[EnvVar.CODE_API_KEY];

    if (!codeApiKey) {
      logger.warn('[buildToolClassification] PTC configured but CODE_API_KEY not available');
      return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
    }

    const ptcTool = createProgrammaticToolCallingTool({ apiKey: codeApiKey });
    additionalTools.push(ptcTool);

    /** Add PTC definition for event-driven mode */
    toolDefinitions.push({
      name: ProgrammaticToolCallingDefinition.name,
      description: ProgrammaticToolCallingDefinition.description,
      parameters: ProgrammaticToolCallingDefinition.schema as unknown as LCTool['parameters'],
    });
    toolRegistry.set(ProgrammaticToolCallingDefinition.name, {
      name: ProgrammaticToolCallingDefinition.name,
      allowed_callers: ['direct'],
    });

    logger.debug(`[buildToolClassification] PTC tool enabled for agent ${agentId}`);
  } catch (error) {
    logger.error('[buildToolClassification] Error creating PTC tool:', error);
  }

  return { toolRegistry, toolDefinitions, additionalTools, hasDeferredTools };
}
