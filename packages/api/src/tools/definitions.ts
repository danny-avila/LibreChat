/**
 * @fileoverview Tool definitions loader for event-driven mode.
 * Loads tool definitions without creating tool instances for efficient initialization.
 *
 * @module packages/api/src/tools/definitions
 */

import { Providers } from '@librechat/agents';
import {
  Constants,
  isActionTool,
  splitMCPToolKey,
  buildServerNameAliases,
} from 'librechat-data-provider';
import type { LCToolRegistry, JsonSchemaType, LCTool, GenericTool } from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { ToolDefinition } from './classification';
import { resolveJsonSchemaRefs, normalizeJsonSchema, sanitizeGeminiSchema } from '~/mcp/zod';
import { buildToolClassification } from './classification';
import { getToolDefinition } from './registry/definitions';
import { toolkitExpansion } from './toolkits/mapping';
import { isMCPAllPlaceholder } from '~/mcp/utils';

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
  /** Whether programmatic tool calling is enabled */
  programmaticToolsEnabled?: boolean;
  /** Whether code execution is enabled and requested by this agent */
  codeExecutionEnabled?: boolean;
  /** Agent provider — Gemini/Vertex tool schemas get union-flattened for compatibility */
  provider?: Providers;
  /** Configured server names, used to resolve the tool-key boundary exactly */
  mcpServerNames?: readonly string[];
  /**
   * Configured server names in raw config form. A parsed (normalized) server
   * name resolves back to its raw name for config lookups AND for the
   * `serverName`/`mcpRawServerName` metadata stored on definitions — server
   * instructions and other config-keyed consumers read that field raw.
   */
  rawServerNames?: readonly string[];
  /**
   * Every server the user can reach (operator + user DB), from a COMPLETE
   * collision audit. When a parsed name appears here, it IS a real server —
   * a null tool fetch then means "currently unavailable" (OAuth pending,
   * missing user variables, disconnected) and must NOT fall back to the raw
   * alias, or the aliased server's definitions would be emitted under the
   * unavailable server's names.
   */
  accessibleServerNames?: readonly string[];
}

export interface ActionToolDefinition {
  name: string;
  description?: string;
  parameters?: JsonSchemaType;
}

export interface LoadToolDefinitionsDeps {
  /** Gets MCP server tools - first checks cache, then initializes server if needed */
  getOrFetchMCPServerTools: (userId: string, serverName: string) => Promise<MCPServerTools | null>;
  /** Bypasses a non-empty stale catalog when it does not contain a selected tool. */
  refreshMCPServerTools?: (userId: string, serverName: string) => Promise<MCPServerTools | null>;
  /** Checks if a tool name is a known built-in tool */
  isBuiltInTool: (toolName: string) => boolean;
  /** Loads action tool definitions (schemas) from OpenAPI specs */
  getActionToolDefinitions?: (
    agentId: string,
    actionToolNames: string[],
  ) => Promise<ActionToolDefinition[]>;
}

export interface LoadToolDefinitionsResult {
  toolDefinitions: (ToolDefinition | LCTool)[];
  toolRegistry: LCToolRegistry;
  hasDeferredTools: boolean;
  mcpResolution: {
    expectedToolCount: number;
    resolvedToolCount: number;
  };
}

const mcpToolPattern = /_mcp_/;
const mcpServerPinPrefix = `${Constants.mcp_server}${Constants.mcp_delimiter}`;

/**
 * Loads tool definitions without creating tool instances.
 * This is the efficient path for event-driven mode where tools are loaded on-demand.
 */
export async function loadToolDefinitions(
  params: LoadToolDefinitionsParams,
  deps: LoadToolDefinitionsDeps,
): Promise<LoadToolDefinitionsResult> {
  const {
    userId,
    agentId,
    tools,
    toolOptions = {},
    deferredToolsEnabled = false,
    programmaticToolsEnabled = false,
    codeExecutionEnabled = false,
    provider,
    mcpServerNames,
    rawServerNames,
    accessibleServerNames,
  } = params;
  const {
    getOrFetchMCPServerTools,
    refreshMCPServerTools,
    isBuiltInTool,
    getActionToolDefinitions,
  } = deps;
  const serverNameAliases = buildServerNameAliases(rawServerNames ?? []);

  const isGoogle = provider === Providers.GOOGLE || provider === Providers.VERTEXAI;

  /** Normalizes MCP tool params, additionally union-flattening for the Gemini/Vertex path. */
  const buildMcpParameters = (mcpParams?: JsonSchemaType): JsonSchemaType | undefined => {
    if (!mcpParams) {
      return undefined;
    }
    const normalized = normalizeJsonSchema(resolveJsonSchemaRefs(mcpParams));
    return isGoogle ? sanitizeGeminiSchema(normalized) : normalized;
  };

  const emptyResult: LoadToolDefinitionsResult = {
    toolDefinitions: [],
    toolRegistry: new Map(),
    hasDeferredTools: false,
    mcpResolution: { expectedToolCount: 0, resolvedToolCount: 0 },
  };

  if (!tools || tools.length === 0) {
    return emptyResult;
  }

  const mcpServerToolsCache = new Map<string, MCPServerTools>();
  const refreshedServerNames = new Set<string>();
  /** Parsed key segment → the RAW server name it resolved to (direct-first). */
  const resolvedServerNames = new Map<string, string>();
  const mcpToolDefs: ToolDefinition[] = [];
  const builtInToolDefs: ToolDefinition[] = [];
  let actionToolDefs: ToolDefinition[] = [];
  const actionToolNames: string[] = [];
  let expectedMCPToolCount = 0;
  let resolvedMCPToolCount = 0;

  for (const toolName of tools) {
    if (isActionTool(toolName)) {
      actionToolNames.push(toolName);
      continue;
    }

    if (!mcpToolPattern.test(toolName)) {
      if (!isBuiltInTool(toolName)) {
        continue;
      }
      const registryDef = getToolDefinition(toolName);
      if (!registryDef) {
        continue;
      }
      builtInToolDefs.push({
        name: toolName,
        description: registryDef.description,
        parameters: registryDef.schema as JsonSchemaType | undefined,
      });

      const extraTools = toolkitExpansion[toolName as keyof typeof toolkitExpansion];
      if (extraTools) {
        for (const extra of extraTools) {
          const extraDef = getToolDefinition(extra);
          if (extraDef) {
            builtInToolDefs.push({
              name: extra,
              description: extraDef.description,
              parameters: extraDef.schema as JsonSchemaType | undefined,
            });
          }
        }
      }
      continue;
    }

    if (toolName.startsWith(mcpServerPinPrefix)) {
      continue;
    }

    expectedMCPToolCount++;

    /** Keys carry the normalized server name (raw in pre-normalization data),
     *  so both spellings resolve the boundary. Resolution is DIRECT-FIRST: a
     *  server that resolves under the parsed name as-is wins (a user-DB
     *  server may be named exactly like an operator server's normalized
     *  form), and only when that yields nothing is the parsed name treated
     *  as a normalized spelling of a raw config name. The resolved RAW name
     *  feeds config lookups and definition metadata (`serverName`, then
     *  `mcpRawServerName`) — server instructions are keyed by it. */
    const [, parsedServerName] = splitMCPToolKey(toolName, [
      ...(mcpServerNames ?? []),
      ...(rawServerNames ?? []),
    ]);
    const parsed = parsedServerName ?? toolName;

    if (!mcpServerToolsCache.has(parsed)) {
      let resolvedName = parsed;
      let fetched = await getOrFetchMCPServerTools(userId, parsed);
      if (!fetched) {
        /** Alias fallback is for "server not found" ONLY: when the parsed
         *  name is a known accessible server, a null fetch means it is
         *  temporarily unavailable (OAuth pending, missing user variables,
         *  disconnected) and rerouting to the alias would emit the OTHER
         *  server's definitions under this server's names. */
        const parsedIsKnownServer = accessibleServerNames?.includes(parsed) === true;
        const aliased = serverNameAliases.get(parsed);
        if (!parsedIsKnownServer && aliased != null && aliased !== parsed) {
          fetched = await getOrFetchMCPServerTools(userId, aliased);
          if (fetched) {
            resolvedName = aliased;
          }
        }
      }
      mcpServerToolsCache.set(parsed, fetched || {});
      resolvedServerNames.set(parsed, resolvedName);
    }

    const serverName = resolvedServerNames.get(parsed) ?? parsed;
    let serverTools = mcpServerToolsCache.get(parsed);
    if (!serverTools) {
      continue;
    }

    const selectedToolMissing = isMCPAllPlaceholder(toolName)
      ? Object.keys(serverTools).length === 0
      : !serverTools[toolName]?.function;
    if (selectedToolMissing && refreshMCPServerTools && !refreshedServerNames.has(serverName)) {
      refreshedServerNames.add(serverName);
      const refreshedTools = await refreshMCPServerTools(userId, serverName);
      if (refreshedTools != null) {
        mcpServerToolsCache.set(parsed, refreshedTools);
        serverTools = refreshedTools;
      }
    }

    if (isMCPAllPlaceholder(toolName)) {
      for (const [actualToolName, toolDef] of Object.entries(serverTools)) {
        if (toolDef?.function) {
          mcpToolDefs.push({
            name: actualToolName,
            description: toolDef.function.description || undefined,
            parameters: buildMcpParameters(toolDef.function.parameters),
            serverName,
          });
          resolvedMCPToolCount++;
        }
      }
      continue;
    }

    const toolDef = serverTools[toolName];
    if (toolDef?.function) {
      mcpToolDefs.push({
        name: toolName,
        description: toolDef.function.description || undefined,
        parameters: buildMcpParameters(toolDef.function.parameters),
        serverName,
      });
      resolvedMCPToolCount++;
    }
  }

  if (actionToolNames.length > 0 && getActionToolDefinitions) {
    const fetchedActionDefs = await getActionToolDefinitions(agentId, actionToolNames);
    actionToolDefs = fetchedActionDefs.map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }));
  }

  const loadedTools = mcpToolDefs.map((def) => ({
    name: def.name,
    description: def.description,
    mcp: true as const,
    mcpJsonSchema: def.parameters,
    mcpRawServerName: def.serverName,
  })) as unknown as GenericTool[];

  const classificationResult = await buildToolClassification({
    userId,
    agentId,
    provider,
    loadedTools,
    deferredToolsEnabled,
    programmaticToolsEnabled,
    codeExecutionEnabled,
    definitionsOnly: true,
    agentToolOptions: toolOptions,
  });

  const { toolDefinitions, hasDeferredTools } = classificationResult;
  const toolRegistry: LCToolRegistry = classificationResult.toolRegistry ?? new Map();

  for (const actionDef of actionToolDefs) {
    if (!toolRegistry.has(actionDef.name)) {
      toolRegistry.set(actionDef.name, {
        name: actionDef.name,
        description: actionDef.description,
        parameters: actionDef.parameters,
        allowed_callers: ['direct'],
      });
    }
  }

  for (const builtInDef of builtInToolDefs) {
    if (!toolRegistry.has(builtInDef.name)) {
      toolRegistry.set(builtInDef.name, {
        name: builtInDef.name,
        description: builtInDef.description,
        parameters: builtInDef.parameters,
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
    mcpResolution: {
      expectedToolCount: expectedMCPToolCount,
      resolvedToolCount: resolvedMCPToolCount,
    },
  };
}
