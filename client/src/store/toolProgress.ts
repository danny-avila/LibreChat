import { atomFamily } from 'recoil';
import type { ToolProgressEvent } from 'librechat-data-provider';

export type ToolProgressState = Pick<ToolProgressEvent, 'progress' | 'total' | 'message'>;

/**
 * Live MCP progress per tool call id (transient — populated from
 * `on_tool_progress` stream events, reset alongside the subagent atoms).
 */
export const toolProgressByToolCallId = atomFamily<ToolProgressState | null, string>({
  key: 'toolProgressByToolCallId',
  default: null,
});
