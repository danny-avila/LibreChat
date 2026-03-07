import { Tools, Constants, ToolCallTypes } from 'librechat-data-provider';
import type { ContentPart } from 'librechat-data-provider';

export type ToolRendererType =
  | 'execute_code'
  | 'openai_image_gen'
  | 'web_search'
  | 'agent_handoff'
  | 'generic_tool_call'
  | 'code_interpreter'
  | 'retrieval'
  | 'function'
  | null;

/**
 * Determines which renderer to use for a tool call part.
 * Used by grouping logic to identify groupable vs special tool calls.
 */
export function resolveToolRendererType(toolCall: ContentPart): ToolRendererType {
  const isStandardToolCall =
    'args' in toolCall && (!toolCall.type || toolCall.type === ToolCallTypes.TOOL_CALL);

  if (isStandardToolCall) {
    const name = ('name' in toolCall ? (toolCall as { name: string }).name : '') ?? '';
    if (name === Tools.execute_code || name === Constants.PROGRAMMATIC_TOOL_CALLING) {
      return 'execute_code';
    }
    if (name === 'image_gen_oai' || name === 'image_edit_oai' || name === 'gemini_image_gen') {
      return 'openai_image_gen';
    }
    if (name === Tools.web_search) {
      return 'web_search';
    }
    if (name.startsWith(Constants.LC_TRANSFER_TO_)) {
      return 'agent_handoff';
    }
    return 'generic_tool_call';
  }

  if ('type' in toolCall) {
    if (toolCall.type === ToolCallTypes.CODE_INTERPRETER) {
      return 'code_interpreter';
    }
    if (toolCall.type === ToolCallTypes.RETRIEVAL || toolCall.type === ToolCallTypes.FILE_SEARCH) {
      return 'retrieval';
    }
    if (toolCall.type === ToolCallTypes.FUNCTION) {
      return 'function';
    }
  }

  return null;
}
