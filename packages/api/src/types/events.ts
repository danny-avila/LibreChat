/** SSE streaming event (on_run_step, on_message_delta, etc.) */
export type StreamEvent = {
  event: string;
  data: string | Record<string, unknown>;
};

/** Control event emitted when user message is created and generation starts */
export type CreatedEvent = {
  created: true;
  message: {
    messageId: string;
    parentMessageId?: string;
    conversationId?: string;
    text?: string;
    sender: string;
    isCreatedByUser: boolean;
  };
  streamId: string;
};

export type FinalMessageFields = {
  messageId?: string;
  parentMessageId?: string;
  conversationId?: string;
  text?: string;
  content?: unknown[];
  sender?: string;
  isCreatedByUser?: boolean;
  unfinished?: boolean;
  /** Per-message error flag — matches TMessage.error (boolean or error text) */
  error?: boolean | string;
  [key: string]: unknown;
};

/** Terminal event emitted when generation completes or is aborted */
export type FinalEvent = {
  final: true;
  requestMessage?: FinalMessageFields | null;
  responseMessage?: FinalMessageFields | null;
  conversation?: { conversationId?: string; [key: string]: unknown } | null;
  title?: string;
  aborted?: boolean;
  earlyAbort?: boolean;
  runMessages?: FinalMessageFields[];
  /** Top-level event error (abort-during-completion edge case) */
  error?: { message: string };
};

export type ServerSentEvent = StreamEvent | CreatedEvent | FinalEvent;
