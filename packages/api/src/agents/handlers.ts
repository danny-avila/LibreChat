import { logger } from '@librechat/data-schemas';
import type {
  EventHandler,
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import { GraphEvents } from '@librechat/agents';
import type { StructuredToolInterface } from '@langchain/core/tools';

export interface ToolExecuteOptions {
  /** Loads tools by name, using agentId to look up agent-specific context */
  loadTools: (
    toolNames: string[],
    agentId?: string,
  ) => Promise<{
    loadedTools: StructuredToolInterface[];
    /** Additional configurable properties to merge (e.g., userMCPAuthMap) */
    configurable?: Record<string, unknown>;
  }>;
}

/**
 * Creates the ON_TOOL_EXECUTE handler for event-driven tool execution.
 * This handler receives batched tool calls, loads the required tools,
 * executes them in parallel, and resolves with the results.
 */
export function createToolExecuteHandler(options: ToolExecuteOptions): EventHandler {
  return {
    handle: async (_event: string, data: ToolExecuteBatchRequest) => {
      const { toolCalls, agentId, configurable, metadata, resolve, reject } = data;

      try {
        const toolNames = [...new Set(toolCalls.map((tc: ToolCallRequest) => tc.name))];
        const { loadedTools, configurable: toolConfigurable } = await options.loadTools(
          toolNames,
          agentId,
        );
        const toolMap = new Map(loadedTools.map((t) => [t.name, t]));
        const mergedConfigurable = { ...configurable, ...toolConfigurable };

        const results: ToolExecuteResult[] = await Promise.all(
          toolCalls.map(async (tc: ToolCallRequest) => {
            const tool = toolMap.get(tc.name);

            if (!tool) {
              return {
                toolCallId: tc.id,
                status: 'error' as const,
                content: '',
                errorMessage: `Tool ${tc.name} not found`,
              };
            }

            try {
              const result = await tool.invoke(tc.args, {
                toolCall: {
                  id: tc.id,
                  stepId: tc.stepId,
                  turn: tc.turn,
                } as unknown as Record<string, unknown>,
                configurable: mergedConfigurable,
                metadata,
              } as Record<string, unknown>);

              return {
                toolCallId: tc.id,
                content: result.content,
                artifact: result.artifact,
                status: 'success' as const,
              };
            } catch (toolError) {
              const error = toolError as Error;
              logger.error(`[ON_TOOL_EXECUTE] Tool ${tc.name} error:`, error);
              return {
                toolCallId: tc.id,
                status: 'error' as const,
                content: '',
                errorMessage: error.message,
              };
            }
          }),
        );

        resolve(results);
      } catch (error) {
        logger.error('[ON_TOOL_EXECUTE] Fatal error:', error);
        reject(error as Error);
      }
    },
  };
}

/**
 * Creates a handlers object that includes ON_TOOL_EXECUTE.
 * Can be merged with other handler objects.
 */
export function createToolExecuteHandlers(
  options: ToolExecuteOptions,
): Record<string, EventHandler> {
  return {
    [GraphEvents.ON_TOOL_EXECUTE]: createToolExecuteHandler(options),
  };
}
