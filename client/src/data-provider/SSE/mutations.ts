import { useMutation } from '@tanstack/react-query';
import { apiBaseUrl, request, EModelEndpoint } from 'librechat-data-provider';
import type { Agents, TEphemeralAgent } from 'librechat-data-provider';

export interface AbortStreamParams {
  /** The stream ID to abort (if known) */
  streamId?: string;
  /** The conversation ID to abort (backend will look up the job) */
  conversationId?: string;
}

export interface AbortStreamResponse {
  success: boolean;
  aborted?: string;
  error?: string;
}

/**
 * Abort an ongoing generation stream.
 * The backend will emit a `done` event with `aborted: true` to the SSE stream,
 * allowing the client to handle cleanup via the normal event flow.
 *
 * Can pass either streamId or conversationId - backend will find the job.
 */
export const abortStream = async (params: AbortStreamParams): Promise<AbortStreamResponse> => {
  console.log('[abortStream] Calling abort endpoint with params:', params);
  const result = (await request.post(
    `${apiBaseUrl()}/api/agents/chat/abort`,
    params,
  )) as AbortStreamResponse;
  console.log('[abortStream] Abort response:', result);
  return result;
};

/**
 * React Query mutation hook for aborting a generation stream.
 * Use this when the user explicitly clicks the stop button.
 */
export function useAbortStreamMutation() {
  return useMutation({
    mutationFn: abortStream,
  });
}

/**
 * Agent/endpoint selection fields the resume route needs so its shared
 * `buildEndpointOption` middleware can reconstruct the same agent that paused.
 * Mirrors the fields a normal `POST /api/agents/chat` message carries; sourced
 * from the active conversation (and the conversation's ephemeral-agent state).
 */
export interface ResumeAgentFields {
  conversationId: string;
  endpoint?: EModelEndpoint | string | null;
  endpointType?: EModelEndpoint | string | null;
  agent_id?: string | null;
  model?: string | null;
  spec?: string | null;
  /** Ephemeral agents derive instructions from this; re-sent so resume rebuilds the
   *  same graph (and matches the server's request fingerprint). */
  promptPrefix?: string | null;
  ephemeralAgent?: TEphemeralAgent | null;
  isTemporary?: boolean;
}

/** Successful resume ACK. The continuation streams over the existing SSE. */
export interface ResumeResponse {
  streamId: string;
  conversationId: string;
  status: 'resuming';
}

/**
 * Shared base for both resume payloads: the agent selection fields, plus the
 * `endpoint` defaulted to `agents` (the resume route lives under the agents
 * router and `buildEndpointOption` keys off it).
 */
const buildResumeBase = (fields: ResumeAgentFields) => ({
  ...fields,
  endpoint: fields.endpoint ?? EModelEndpoint.agents,
});

export interface SubmitToolApprovalParams extends ResumeAgentFields {
  /** Identifies the paused action; the server 409s a stale/mismatched id. */
  actionId: string;
  /** One entry per paused tool_call_id — the server 400s a partial batch. */
  decisions: Agents.ToolApprovalResolution[];
}

/**
 * Submit a batch of tool-approval decisions to resume a paused generation.
 * POSTs to the shared resume route; the continuation streams over the existing
 * SSE connection (this only fires the POST — it does not open a new stream).
 */
export const submitToolApproval = async (
  params: SubmitToolApprovalParams,
): Promise<ResumeResponse> => {
  const { actionId, decisions, ...fields } = params;
  return request.post(`${apiBaseUrl()}/api/agents/chat/resume`, {
    ...buildResumeBase(fields),
    actionId,
    decisions,
  }) as Promise<ResumeResponse>;
};

/**
 * React Query mutation hook for submitting tool-approval decisions.
 * Mirrors {@link useAbortStreamMutation}; the resumed stream arrives on the SSE.
 */
export function useSubmitToolApprovalMutation() {
  return useMutation({
    mutationFn: submitToolApproval,
  });
}

export interface SubmitAskAnswerParams extends ResumeAgentFields {
  actionId: string;
  /** Free-form answer to the agent's ask-user question. */
  answer: string;
}

/**
 * Submit an ask-user-question answer to resume a paused generation.
 * POSTs to the shared resume route; the continuation streams over the existing SSE.
 */
export const submitAskAnswer = async (params: SubmitAskAnswerParams): Promise<ResumeResponse> => {
  const { actionId, answer, ...fields } = params;
  return request.post(`${apiBaseUrl()}/api/agents/chat/resume`, {
    ...buildResumeBase(fields),
    actionId,
    answer,
  }) as Promise<ResumeResponse>;
};

/**
 * React Query mutation hook for submitting an ask-user answer.
 * Mirrors {@link useAbortStreamMutation}; the resumed stream arrives on the SSE.
 */
export function useSubmitAskAnswerMutation() {
  return useMutation({
    mutationFn: submitAskAnswer,
  });
}
