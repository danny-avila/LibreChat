/**
 * @fileoverview Tool definitions loader for event-driven mode.
 * Loads tool definitions without creating tool instances for efficient initialization.
 *
 * @module packages/api/src/tools/definitions
 */

import { Constants, actionDelimiter, actionDomainSeparator } from 'librechat-data-provider';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { LCToolRegistry, JsonSchemaType, LCTool, GenericTool } from '@librechat/agents';
import { buildToolClassification, type ToolDefinition } from './classification';

/** Regex to replace domain separators (---) with underscores for tool names */
const domainSeparatorRegex = new RegExp(actionDomainSeparator, 'g');

export interface MCPServerTool {
  function?: {
    name?: string;
    description?: string;
    parameters?: JsonSchemaType;
  };
}

export type MCPServerTools = Record<string, MCPServerTool>;

export interface LoadToolDefinitionsParams {
  /** User ID for MCP server tool lookup */
  userId: string;
  /** Agent ID for tool classification */
  agentId: string;
  /** Agent's tool list (tool names/identifiers) */
  tools: string[];
  /** Agent-specific tool options */
  toolOptions?: AgentToolOptions;
  /** Whether deferred tools feature is enabled */
  deferredToolsEnabled?: boolean;
}

export interface LoadToolDefinitionsDeps {
  /** Gets MCP server tools - first checks cache, then initializes server if needed */
  getOrFetchMCPServerTools: (userId: string, serverName: string) => Promise<MCPServerTools | null>;
  /** Checks if a tool name is a known built-in tool */
  isBuiltInTool: (toolName: string) => boolean;
  /** Loads auth values for tool search (passed to buildToolClassification) */
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
  }) => Promise<Record<string, string>>;
}

export interface LoadToolDefinitionsResult {
  toolDefinitions: (ToolDefinition | LCTool)[];
  toolRegistry: LCToolRegistry;
  hasDeferredTools: boolean;
}

const mcpToolPattern = /_mcp_/;

/**
 * Loads tool definitions without creating tool instances.
 * This is the efficient path for event-driven mode where tools are loaded on-demand.
 */
export async function loadToolDefinitions(
  params: LoadToolDefinitionsParams,
  deps: LoadToolDefinitionsDeps,
): Promise<LoadToolDefinitionsResult> {
  const { userId, agentId, tools, toolOptions = {}, deferredToolsEnabled = false } = params;
  const { getOrFetchMCPServerTools, isBuiltInTool, loadAuthValues } = deps;

  const emptyResult: LoadToolDefinitionsResult = {
    toolDefinitions: [],
    toolRegistry: new Map(),
    hasDeferredTools: false,
  };

  if (!tools || tools.length === 0) {
    return emptyResult;
  }

  const mcpServerToolsCache = new Map<string, MCPServerTools>();
  const mcpToolDefs: ToolDefinition[] = [];
  const builtInToolDefs: ToolDefinition[] = [];
  const actionToolDefs: ToolDefinition[] = [];

  const mcpAllPattern = `${Constants.mcp_all}${Constants.mcp_delimiter}`;

  for (const toolName of tools) {
    if (!mcpToolPattern.test(toolName)) {
      if (toolName.includes(actionDelimiter)) {
        const normalizedName = toolName.replace(domainSeparatorRegex, '_');
        actionToolDefs.push({ name: normalizedName });
      } else if (isBuiltInTool(toolName)) {
        builtInToolDefs.push({ name: toolName });
      }
      continue;
    }

    const parts = toolName.split(Constants.mcp_delimiter);
    const serverName = parts[parts.length - 1];

    if (!mcpServerToolsCache.has(serverName)) {
      const serverTools = await getOrFetchMCPServerTools(userId, serverName);
      mcpServerToolsCache.set(serverName, serverTools || {});
    }

    const serverTools = mcpServerToolsCache.get(serverName);
    if (!serverTools) {
      continue;
    }

    if (toolName.startsWith(mcpAllPattern)) {
      for (const [actualToolName, toolDef] of Object.entries(serverTools)) {
        if (toolDef?.function) {
          mcpToolDefs.push({
            name: actualToolName,
            description: toolDef.function.description,
            parameters: toolDef.function.parameters,
            serverName,
          });
        }
      }
      continue;
    }

    const toolDef = serverTools[toolName];
    if (toolDef?.function) {
      mcpToolDefs.push({
        name: toolName,
        description: toolDef.function.description,
        parameters: toolDef.function.parameters,
        serverName,
      });
    }
  }

  const loadedTools = mcpToolDefs.map((def) => ({
    name: def.name,
    description: def.description,
    mcp: true as const,
    mcpJsonSchema: def.parameters,
  })) as unknown as GenericTool[];

  const classificationResult = await buildToolClassification({
    loadedTools,
    userId,
    agentId,
    agentToolOptions: toolOptions,
    deferredToolsEnabled,
    loadAuthValues,
  });

  const { toolDefinitions, hasDeferredTools } = classificationResult;
  const toolRegistry: LCToolRegistry = classificationResult.toolRegistry ?? new Map();

  for (const actionDef of actionToolDefs) {
    if (!toolRegistry.has(actionDef.name)) {
      toolRegistry.set(actionDef.name, {
        name: actionDef.name,
        allowed_callers: ['direct'],
      });
    }
  }

  for (const builtInDef of builtInToolDefs) {
    if (!toolRegistry.has(builtInDef.name)) {
      toolRegistry.set(builtInDef.name, {
        name: builtInDef.name,
        allowed_callers: ['direct'],
      });
    }
  }

  const allDefinitions: (ToolDefinition | LCTool)[] = [
    ...toolDefinitions,
    ...actionToolDefs.filter((d) => !toolDefinitions.some((td) => td.name === d.name)),
    ...builtInToolDefs.filter((d) => !toolDefinitions.some((td) => td.name === d.name)),
  ];

  return {
    toolDefinitions: allDefinitions,
    toolRegistry,
    hasDeferredTools,
  };
}
