import { atomFamily } from 'recoil';
import type { PtcToolCallStatus } from 'librechat-data-provider';

/** One tool call a programmatic (PTC) program made from inside the sandbox. */
export interface PtcTraceEntry {
  /** Stable id from the backend; the settle event updates this row in place. */
  callId: string;
  /** Inner tool id, e.g. `search_code_mcp_github`. */
  name: string;
  status: PtcToolCallStatus;
  /** `key=value` preview of the call's input. */
  args?: string;
  /** Truncated failure message on a failed call. */
  error?: string;
  durationMs?: number;
}

/**
 * Stable identity for one PTC invocation in its parent message. Providers
 * reuse `tool_call_id` across turns and agents, so the raw id is not
 * sufficient identity for live progress — the same rule `subagentProgressKey`
 * exists for. Without the message scope, a later program's rows would land in
 * an earlier card that happened to share `call_0`.
 */
export const ptcTraceKey = (parentMessageId: string, toolCallId: string) =>
  `${parentMessageId}\u0000${toolCallId}`;

/**
 * Live trace of the inner tool calls made by one PTC run step, in the order
 * the sandbox started them (`on_ptc_tool_call` SSE events). Keyed by
 * {@link ptcTraceKey} — one concrete invocation in one message.
 *
 * Session-scoped like the subagent ticker: inner calls open no run step, so
 * nothing persists them on the message. Cleared on conversation switch rather
 * than at run boundaries, so a finished program's trace stays readable.
 */
export const ptcTraceByToolCallId = atomFamily<PtcTraceEntry[], string>({
  key: 'ptcTraceByToolCallId',
  default: [],
});
