/** SSE streaming event (on_run_step, on_message_delta, etc.) */
export type StreamEvent = {
  event: string;
  data: string | Record<string, unknown>;
};

/** Control event emitted when user message is created and generation starts */
export type CreatedEvent = {
  created: true;
  message: Record<string, unknown>;
  streamId: string;
};

/** Terminal event emitted when generation completes or is aborted */
export type FinalEvent = {
  final: true;
  requestMessage?: Record<string, unknown> | null;
  responseMessage?: Record<string, unknown> | null;
  conversation?: Record<string, unknown> | null;
  title?: string;
  aborted?: boolean;
  earlyAbort?: boolean;
  runMessages?: Record<string, unknown>[];
};

export type ServerSentEvent = StreamEvent | CreatedEvent | FinalEvent;
