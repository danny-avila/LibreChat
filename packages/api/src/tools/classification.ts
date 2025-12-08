/**
 * @fileoverview Utility functions for building tool registries from environment variables.
 * This is a temporary solution for tool classification until UI-based configuration is available.
 *
 * Environment Variables:
 * - TOOL_PROGRAMMATIC_ONLY: Comma-separated tool names or server patterns (sys__all__sys_mcp_ServerName)
 * - TOOL_PROGRAMMATIC_ONLY_EXCLUDE: Comma-separated tool names to exclude from programmatic only
 * - TOOL_DUAL_CONTEXT: Comma-separated tool names or server patterns callable BOTH by LLM and PTC
 * - TOOL_DUAL_CONTEXT_EXCLUDE: Comma-separated tool names to exclude from dual context
 * - TOOL_DEFERRED: Comma-separated tool names or server patterns for deferred tools
 * - TOOL_DEFERRED_EXCLUDE: Comma-separated tool names to exclude from deferred
 * - TOOL_CLASSIFICATION_AGENT_IDS: Optional comma-separated agent IDs to restrict classification features
 *
 * Server patterns: Use `sys__all__sys_mcp_ServerName` to match all tools from an MCP server.
 * Example: `sys__all__sys_mcp_Google-Workspace` matches all Google Workspace tools.
 *
 * Agent restriction: If TOOL_CLASSIFICATION_AGENT_IDS is set, only those agents will get
 * PTC and tool search tools. If not set, all agents with matching tools get them.
 *
 * Smart enablement: PTC/tool search are only created if the agent has tools that actually
 * match the classification patterns. An agent with no programmatic/deferred tools won't
 * get PTC/tool search even if the env vars are set.
 *
 * @module packages/api/src/tools/classification
 */

import {
  EnvVar,
  createProgrammaticToolCallingTool,
  createToolSearchRegexTool,
} from '@librechat/agents';
import type {
  LCTool,
  LCToolRegistry,
  AllowedCaller,
  JsonSchemaType,
  GenericTool,
} from '@librechat/agents';
import { Constants } from 'librechat-data-provider';
import { logger } from '@librechat/data-schemas';

export type { LCTool, LCToolRegistry, AllowedCaller, JsonSchemaType };

/** Pattern prefix for matching all tools from an MCP server */
const MCP_ALL_PATTERN = `${Constants.mcp_all}${Constants.mcp_delimiter}`;

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: JsonSchemaType;
}

/**
 * Parses a comma-separated tool list from an environment variable.
 * @param envValue - The environment variable value
 * @returns Set of tool names or server patterns
 */
export function parseToolList(envValue: string | undefined): Set<string> {
  if (!envValue || envValue.trim() === '') {
    return new Set();
  }
  return new Set(
    envValue
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
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
 * Checks if a tool matches a set of patterns (tool names or server patterns).
 * Supports both exact tool name matches and server-wide patterns like `mcp_all_mcp_ServerName`.
 *
 * @param toolName - The tool name to check
 * @param patterns - Set of patterns (tool names or mcp_all_mcp_ServerName patterns)
 * @param excludes - Set of tool names to exclude (takes precedence over patterns)
 * @returns Whether the tool matches any pattern and is not excluded
 */
export function toolMatchesPatterns(
  toolName: string,
  patterns: Set<string>,
  excludes: Set<string>,
): boolean {
  if (excludes.has(toolName)) {
    return false;
  }

  if (patterns.has(toolName)) {
    return true;
  }

  const serverName = getServerNameFromTool(toolName);
  if (serverName) {
    const serverPattern = `${MCP_ALL_PATTERN}${serverName}`;
    if (patterns.has(serverPattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Builds a tool registry from environment variables for the given tools.
 * This is a temporary solution while UI-based configuration is being developed.
 *
 * Supports server-wide patterns using `mcp_all_mcp_ServerName` syntax.
 * Exclusion env vars take precedence over inclusion patterns.
 *
 * Default behavior (if tool not listed in any env var):
 * - allowed_callers: ['direct']
 * - defer_loading: false
 *
 * @param tools - Array of tool definitions
 * @returns Map of tool name to tool definition with classification
 *
 * @example
 * // Environment for server-wide configuration:
 * // TOOL_PROGRAMMATIC_ONLY=mcp_all_mcp_Google-Workspace
 * // TOOL_DEFERRED=mcp_all_mcp_Google-Workspace
 * // TOOL_DEFERRED_EXCLUDE=list_spreadsheets_mcp_Google-Workspace,read_sheet_values_mcp_Google-Workspace
 *
 * @example
 * // Environment for individual tools:
 * // TOOL_PROGRAMMATIC_ONLY=get_expenses,get_team_members
 * // TOOL_DUAL_CONTEXT=get_weather
 * // TOOL_DEFERRED=generate_report
 */
export function buildToolRegistryFromEnv(tools: ToolDefinition[]): LCToolRegistry {
  const programmaticOnly = parseToolList(process.env.TOOL_PROGRAMMATIC_ONLY);
  const programmaticOnlyExclude = parseToolList(process.env.TOOL_PROGRAMMATIC_ONLY_EXCLUDE);
  const dualContext = parseToolList(process.env.TOOL_DUAL_CONTEXT);
  const dualContextExclude = parseToolList(process.env.TOOL_DUAL_CONTEXT_EXCLUDE);
  const deferred = parseToolList(process.env.TOOL_DEFERRED);
  const deferredExclude = parseToolList(process.env.TOOL_DEFERRED_EXCLUDE);

  const registry: LCToolRegistry = new Map();

  for (const tool of tools) {
    const { name, description, parameters } = tool;

    let allowed_callers: AllowedCaller[];

    if (toolMatchesPatterns(name, programmaticOnly, programmaticOnlyExclude)) {
      allowed_callers = ['code_execution'];
    } else if (toolMatchesPatterns(name, dualContext, dualContextExclude)) {
      allowed_callers = ['direct', 'code_execution'];
    } else {
      // Default: direct only (LLM can call, PTC cannot)
      allowed_callers = ['direct'];
    }

    const toolDef: LCTool = {
      name,
      allowed_callers,
      defer_loading: toolMatchesPatterns(name, deferred, deferredExclude),
    };

    // Include description and parameters if available (needed for tool search and PTC stub generation)
    if (description) {
      toolDef.description = description;
    }
    if (parameters) {
      toolDef.parameters = parameters;
    }

    registry.set(name, toolDef);
  }

  return registry;
}

/**
 * Checks if PTC (Programmatic Tool Calling) should be enabled based on environment configuration.
 * PTC is enabled if any tools or server patterns are configured for programmatic calling.
 * @returns Whether PTC should be enabled
 */
export function shouldEnablePTC(): boolean {
  const programmaticOnly = parseToolList(process.env.TOOL_PROGRAMMATIC_ONLY);
  const dualContext = parseToolList(process.env.TOOL_DUAL_CONTEXT);
  return programmaticOnly.size > 0 || dualContext.size > 0;
}

/**
 * Checks if tool search should be enabled based on environment configuration.
 * Tool search is enabled if any tools or server patterns are configured as deferred.
 * @returns Whether tool search should be enabled
 */
export function shouldEnableToolSearch(): boolean {
  const deferred = parseToolList(process.env.TOOL_DEFERRED);
  return deferred.size > 0;
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

/** Parameters for building tool classification and creating PTC/tool search tools */
export interface BuildToolClassificationParams {
  /** All loaded tools (will be filtered for MCP tools) */
  loadedTools: GenericTool[];
  /** User ID for auth lookup */
  userId: string;
  /** Agent ID (used to check if this agent should have classification features) */
  agentId?: string;
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
  /** Additional tools created (PTC and/or tool search) */
  additionalTools: GenericTool[];
}

/**
 * Checks if an agent is allowed to have classification features based on TOOL_CLASSIFICATION_AGENT_IDS.
 * @param agentId - The agent ID to check
 * @returns Whether the agent is allowed (true if no restriction set, or agent is in the list)
 */
export function isAgentAllowedForClassification(agentId?: string): boolean {
  const allowedAgentIds = parseToolList(process.env.TOOL_CLASSIFICATION_AGENT_IDS);
  if (allowedAgentIds.size === 0) {
    return true;
  }
  if (!agentId) {
    return false;
  }
  return allowedAgentIds.has(agentId);
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
 * 1. Checks if the agent is allowed for classification features (via TOOL_CLASSIFICATION_AGENT_IDS)
 * 2. Filters loaded tools for MCP tools
 * 3. Extracts tool definitions and builds the registry from env vars
 * 4. Cleans up temporary mcpJsonSchema properties
 * 5. Creates PTC tool only if agent has tools configured for programmatic calling
 * 6. Creates tool search tool only if agent has deferred tools
 *
 * @param params - Parameters including loaded tools, userId, agentId, and dependencies
 * @returns Tool registry and any additional tools created
 */
export async function buildToolClassification(
  params: BuildToolClassificationParams,
): Promise<BuildToolClassificationResult> {
  const { loadedTools, userId, agentId, loadAuthValues } = params;
  const additionalTools: GenericTool[] = [];

  const mcpTools = loadedTools.filter(isMCPTool);
  if (mcpTools.length === 0) {
    return { toolRegistry: undefined, additionalTools };
  }

  const mcpToolDefs = mcpTools.map(extractMCPToolDefinition);
  const toolRegistry = buildToolRegistryFromEnv(mcpToolDefs);

  /** Clean up temporary mcpJsonSchema property from tools now that registry is populated */
  cleanupMCPToolSchemas(mcpTools);

  /** Check if this agent is allowed to have classification features */
  if (!isAgentAllowedForClassification(agentId)) {
    logger.debug(
      `[buildToolClassification] Agent ${agentId} not in TOOL_CLASSIFICATION_AGENT_IDS, skipping PTC/ToolSearch`,
    );
    return { toolRegistry, additionalTools };
  }

  /**
   * Check if this agent actually has tools that match the patterns.
   * Only enable PTC if the agent has programmatic tools.
   * Only enable tool search if the agent has deferred tools.
   */
  const hasProgrammaticTools = agentHasProgrammaticTools(toolRegistry);
  const hasDeferredTools = agentHasDeferredTools(toolRegistry);

  if (!hasProgrammaticTools && !hasDeferredTools) {
    logger.debug(
      `[buildToolClassification] Agent ${agentId} has no programmatic or deferred tools, skipping PTC/ToolSearch`,
    );
    return { toolRegistry, additionalTools };
  }

  try {
    const authValues = await loadAuthValues({
      userId,
      authFields: [EnvVar.CODE_API_KEY],
    });
    const codeApiKey = authValues[EnvVar.CODE_API_KEY];

    if (!codeApiKey) {
      logger.warn(
        '[buildToolClassification] PTC/ToolSearch configured but CODE_API_KEY not available',
      );
      return { toolRegistry, additionalTools };
    }

    if (hasProgrammaticTools) {
      const ptcTool = createProgrammaticToolCallingTool({ apiKey: codeApiKey });
      additionalTools.push(ptcTool);
      logger.debug(`[buildToolClassification] PTC tool enabled for agent ${agentId}`);
    }

    if (hasDeferredTools) {
      const toolSearchTool = createToolSearchRegexTool({
        apiKey: codeApiKey,
        toolRegistry,
      });
      additionalTools.push(toolSearchTool);
      logger.debug(`[buildToolClassification] Tool Search enabled for agent ${agentId}`);
    }
  } catch (error) {
    logger.error('[buildToolClassification] Error creating PTC/ToolSearch tools:', error);
  }

  return { toolRegistry, additionalTools };
}
