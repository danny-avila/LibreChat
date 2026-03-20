import { DynamicStructuredTool } from '@langchain/core/tools';
import { Constants } from 'librechat-data-provider';
import type { Agent, TEphemeralAgent } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { Logger } from 'winston';
import type { MCPManager } from '~/mcp/MCPManager';

/**
 * Agent type with optional tools array that can contain DynamicStructuredTool or string.
 * For context operations, we only require id and instructions, other Agent fields are optional.
 */
export type AgentWithTools = Pick<Agent, 'id'> &
  Partial<Omit<Agent, 'id' | 'tools'>> & {
    tools?: Array<DynamicStructuredTool | string>;
    /** Serializable tool definitions for event-driven mode */
    toolDefinitions?: LCTool[];
  };

/**
 * Extracts unique MCP server names from an agent's tools or tool definitions.
 * Supports both full tool instances (tools) and serializable definitions (toolDefinitions).
 * @param agent - The agent with tools and/or tool definitions
 * @returns Array of unique MCP server names
 */
export function extractMCPServers(agent: AgentWithTools): string[] {
  const mcpServers = new Set<string>();

  /** Check tool instances (non-event-driven mode) */
  if (agent?.tools?.length) {
    for (const tool of agent.tools) {
      if (tool instanceof DynamicStructuredTool && tool.name.includes(Constants.mcp_delimiter)) {
        const serverName = tool.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  /** Check tool definitions (event-driven mode) */
  if (agent?.toolDefinitions?.length) {
    for (const toolDef of agent.toolDefinitions) {
      if (toolDef.name?.includes(Constants.mcp_delimiter)) {
        const serverName = toolDef.name.split(Constants.mcp_delimiter).pop();
        if (serverName) {
          mcpServers.add(serverName);
        }
      }
    }
  }

  return Array.from(mcpServers);
}

/**
 * Fetches MCP instructions for the given server names.
 * @param {string[]} mcpServers - Array of MCP server names
 * @param {MCPManager} mcpManager - MCP manager instance
 * @param {Logger} [logger] - Optional logger instance
 * @returns {Promise<string>} MCP instructions string, empty if none
 */
export async function getMCPInstructionsForServers(
  mcpServers: string[],
  mcpManager: MCPManager,
  logger?: Logger,
): Promise<string> {
  if (!mcpServers.length) {
    return '';
  }
  try {
    const mcpInstructions = await mcpManager.formatInstructionsForContext(mcpServers);
    if (mcpInstructions && logger) {
      logger.debug('[AgentContext] Fetched MCP instructions for servers:', mcpServers);
    }
    return mcpInstructions || '';
  } catch (error) {
    if (logger) {
      logger.error('[AgentContext] Failed to get MCP instructions:', error);
    }
    return '';
  }
}

/**
 * Builds final instructions for an agent by combining shared run context and agent-specific context.
 * Order: sharedRunContext -> baseInstructions -> mcpInstructions
 *
 * @param {Object} params
 * @param {string} [params.sharedRunContext] - Run-level context shared by all agents (file context, RAG, memory)
 * @param {string} [params.baseInstructions] - Agent's base instructions
 * @param {string} [params.mcpInstructions] - Agent's MCP server instructions
 * @returns {string | undefined} Combined instructions, or undefined if empty
 */
export function buildAgentInstructions({
  sharedRunContext,
  baseInstructions,
  mcpInstructions,
}: {
  sharedRunContext?: string;
  baseInstructions?: string;
  mcpInstructions?: string;
}): string | undefined {
  const parts = [sharedRunContext, baseInstructions, mcpInstructions].filter(Boolean);
  const combined = parts.join('\n\n').trim();
  return combined || undefined;
}

/**
 * Applies run context and MCP instructions to an agent's configuration.
 * Mutates the agent object in place.
 *
 * @param {Object} params
 * @param {Agent} params.agent - The agent to update
 * @param {string} params.sharedRunContext - Run-level shared context
 * @param {MCPManager} params.mcpManager - MCP manager instance
 * @param {Object} [params.ephemeralAgent] - Ephemeral agent config (for MCP override)
 * @param {string} [params.agentId] - Agent ID for logging
 * @param {Logger} [params.logger] - Optional logger instance
 * @returns {Promise<void>}
 */
export async function applyContextToAgent({
  agent,
  sharedRunContext,
  mcpManager,
  ephemeralAgent,
  agentId,
  logger,
}: {
  agent: AgentWithTools;
  sharedRunContext: string;
  mcpManager: MCPManager;
  ephemeralAgent?: TEphemeralAgent;
  agentId?: string;
  logger?: Logger;
}): Promise<void> {
  const baseInstructions = agent.instructions || '';

  try {
    const mcpServers = ephemeralAgent?.mcp?.length ? ephemeralAgent.mcp : extractMCPServers(agent);
    const mcpInstructions = await getMCPInstructionsForServers(mcpServers, mcpManager, logger);

    agent.instructions = buildAgentInstructions({
      sharedRunContext,
      baseInstructions,
      mcpInstructions,
    });

    if (agentId && logger) {
      logger.debug(`[AgentContext] Applied context to agent: ${agentId}`);
    }
  } catch (error) {
    agent.instructions = buildAgentInstructions({
      sharedRunContext,
      baseInstructions,
      mcpInstructions: '',
    });

    if (logger) {
      logger.error(
        `[AgentContext] Failed to apply context to agent${agentId ? ` ${agentId}` : ''}, using base instructions only:`,
        error,
      );
    }
  }
}
