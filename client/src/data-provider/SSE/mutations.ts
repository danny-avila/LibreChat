import { useMutation } from '@tanstack/react-query';
import { apiBaseUrl, request } from 'librechat-data-provider';

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
