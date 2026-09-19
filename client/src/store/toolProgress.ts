import { atomFamily } from 'recoil';
import type { ToolProgressEvent } from 'librechat-data-provider';

export type ToolProgressState = Pick<ToolProgressEvent, 'progress' | 'total' | 'message'>;

/** Providers reuse tool-call ids across parallel agents, so live progress is
 *  scoped by the run's response message id AND the owning run-step id (parallel
 *  agents share a run but own distinct steps). */
export const toolProgressKey = (
  runId: string | undefined,
  stepId: string | undefined,
  toolCallId: string,
): string => `${runId ?? ''}:${stepId ?? ''}:${toolCallId}`;

/**
 * Live MCP progress per tool call id (transient — populated from
 * `on_tool_progress` stream events, reset alongside the subagent atoms).
 */
export const toolProgressByToolCallId = atomFamily<ToolProgressState | null, string>({
  key: 'toolProgressByToolCallId',
  default: null,
});
