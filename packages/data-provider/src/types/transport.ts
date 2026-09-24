import type {
  StepEvents,
  UsageEvents,
  SteerEvents,
  ApprovalEvents,
  ActivityLabelEvents,
  ReasoningLabelEvents,
  TPendingSteer,
  SubagentUpdateEvent,
  TTokenUsageEvent,
  PtcToolCallEvent,
  TContextUsageEvent,
  TSteerAppliedEvent,
  TSteerUpdatedEvent,
  TActivityLabelEvent,
  TReasoningLabelEvent,
  SandboxStartingEvent,
  TReasoningLabelAttemptEvent,
} from './runs';
import type { TMessage, TPayload, TConversation } from '../types';
import type { TAttachment } from '../schemas';
import type { TContentData } from './content';
import type { Agents } from './agents';

/**
 * Wire frames: the JSON the server writes into the `data:` line of an SSE
 * `message` event. The server tells them apart by their keys, not by a tag,
 * so these mirror the emitters (`sendEvent` in `packages/api/src/utils/events.ts`
 * and the `ServerSentEvent` types beside it) and are normalized into
 * {@link ChatEvent} by the client transport.
 */

/** `{ created: true }`: the user message was saved and generation started. */
export type ChatCreatedFrame = {
  created: true;
  message: Partial<TMessage>;
  /** Present on resumable streams only. */
  streamId?: string;
};

/**
 * `{ sync: true }`: server-assigned ids for the turn (Assistants), or the
 * snapshot a reconnecting client rebuilds from (resumable streams).
 */
export type ChatSyncFrame = {
  sync: true;
  conversationId?: string;
  thread_id?: string;
  messages?: TMessage[];
  requestMessage?: Partial<TMessage>;
  responseMessage?: Partial<TMessage>;
  resumeState?: Agents.ResumeState;
  /** Frames published before the reconnect that the snapshot does not cover. */
  pendingEvents?: ChatFrame[];
};

/** `{ final: true }`: the terminal frame of a completed, errored or aborted turn. */
export type ChatFinalFrame = {
  final: true;
  /** The terminal status committed without its payload; refetch instead of rendering. */
  reconcile?: boolean;
  reconcileReason?: 'terminal_payload_missing' | 'generation_replaced' | 'abort_persistence_failed';
  terminalStatus?: 'complete' | 'error' | 'aborted';
  generationCreatedAt?: number;
  generationProtocolVersion?: number;
  requestMessage?: TMessage | null;
  responseMessage?: TMessage | null;
  conversation?: Partial<TConversation> | null;
  runMessages?: TMessage[];
  title?: string;
  aborted?: boolean;
  earlyAbort?: boolean;
  /** Steers that never reached an injection boundary, handed back as queued turns. */
  pendingSteers?: TPendingSteer[];
  error?: { message: string };
};

/** `{ event: 'title' }`: a generated conversation title. */
export type ChatTitleFrame = {
  event: 'title';
  data?: {
    conversationId?: string;
    title?: string;
  };
};

/** `{ event, data }` for the agent graph's step events, dispatched to the step handler. */
export type ChatStepFrame =
  | { event: StepEvents.ON_RUN_STEP; data: Agents.RunStep }
  | { event: StepEvents.ON_AGENT_UPDATE; data: Agents.AgentUpdate }
  | { event: StepEvents.ON_MESSAGE_DELTA; data: Agents.MessageDeltaEvent }
  | { event: StepEvents.ON_REASONING_DELTA; data: Agents.ReasoningDeltaEvent }
  | { event: StepEvents.ON_RUN_STEP_DELTA; data: Agents.RunStepDeltaEvent }
  | { event: StepEvents.ON_RUN_STEP_COMPLETED; data: { result: Agents.ToolEndEvent } }
  | { event: StepEvents.ON_RUN_STEP_CLOSED; data: Agents.RunStepClosedEvent }
  | { event: StepEvents.ON_SUMMARIZE_START; data: Agents.SummarizeStartEvent }
  | { event: StepEvents.ON_SUMMARIZE_DELTA; data: Agents.SummarizeDeltaEvent }
  | { event: StepEvents.ON_SUMMARIZE_COMPLETE; data: Agents.SummarizeCompleteEvent }
  | { event: StepEvents.ON_SUBAGENT_UPDATE; data: SubagentUpdateEvent }
  | { event: StepEvents.ON_SANDBOX_STARTING; data: SandboxStartingEvent }
  | { event: StepEvents.ON_PTC_TOOL_CALL; data: PtcToolCallEvent };

/** Any `{ event, data }` frame: step events plus the named side channels. */
export type ChatEventFrame =
  | ChatTitleFrame
  | ChatStepFrame
  | { event: 'attachment'; data: TAttachment }
  | { event: UsageEvents.ON_CONTEXT_USAGE; data: TContextUsageEvent }
  | { event: UsageEvents.ON_TOKEN_USAGE; data: TTokenUsageEvent }
  | { event: ApprovalEvents.ON_PENDING_ACTION; data: Agents.PendingAction }
  | { event: SteerEvents.ON_STEER_APPLIED; data: TSteerAppliedEvent }
  | { event: SteerEvents.ON_STEER_UPDATED; data: TSteerUpdatedEvent }
  | { event: ActivityLabelEvents.ON_ACTIVITY_LABEL; data: TActivityLabelEvent }
  | { event: ReasoningLabelEvents.ON_REASONING_LABEL; data: TReasoningLabelEvent }
  | { event: ReasoningLabelEvents.ON_REASONING_LABEL_ATTEMPT; data: TReasoningLabelAttemptEvent };

/** Cumulative text from legacy (non-agent) streams, keyed by `message: true`. */
export type ChatTextFrame = {
  message: true;
  text?: string;
  /** Older emitters name the cumulative text `response`. */
  response?: string;
  messageId?: string;
  parentMessageId?: string;
};

/** Every JSON body the server writes on the `message` event. */
export type ChatFrame =
  | ChatCreatedFrame
  | ChatSyncFrame
  | ChatFinalFrame
  | ChatEventFrame
  | TContentData
  | ChatTextFrame;

/**
 * The body of the SSE `error` event: the serialized error the server reports
 * (`handleError` writes a JSON string; a failed turn writes the partial
 * request/response pair), or `undefined` when the body did not parse.
 */
export type ChatErrorData = {
  text?: string;
  message?: string;
  conversation?: Partial<TConversation>;
  requestMessage?: TMessage;
  responseMessage?: TMessage;
};

/**
 * A stream event after normalization, discriminated by `type` the way
 * `TMessageContentParts` is. The AI SDK counterpart of this union is
 * `UIMessageChunk`; the equivalents are noted per member where one exists.
 */
export type ChatEvent =
  /** The connection opened. No AI SDK chunk; the SDK tracks this as `status: 'submitted'`. */
  | { type: 'open' }
  /** AI SDK: `start` (carries `messageId`). */
  | { type: 'created'; data: ChatCreatedFrame }
  /** No AI SDK equivalent: server id reconciliation and resume snapshots. */
  | { type: 'sync'; data: ChatSyncFrame }
  /** AI SDK: `finish`. A `reconcile` frame is still `final`; the consumer decides. */
  | { type: 'final'; data: ChatFinalFrame }
  /** AI SDK: a `data-*` part. */
  | { type: 'title'; data: ChatTitleFrame }
  /**
   * AI SDK: `file` / `source-url`. Arrives as a named SSE `attachment` event
   * on standard streams and as `{ event: 'attachment' }` on resumable ones.
   */
  | { type: 'attachment'; data: TAttachment }
  /** AI SDK: `message-metadata`. */
  | { type: 'context_usage'; data: TContextUsageEvent }
  /** AI SDK: `message-metadata`. */
  | { type: 'token_usage'; data: TTokenUsageEvent }
  /** AI SDK: `tool-approval-request`. */
  | { type: 'pending_action'; data: Agents.PendingAction }
  /** No AI SDK equivalent: steering. */
  | { type: 'steer_applied'; data: TSteerAppliedEvent }
  /** No AI SDK equivalent: steering. */
  | { type: 'steer_updated'; data: TSteerUpdatedEvent }
  /** AI SDK: a transient `data-*` part. */
  | { type: 'activity_label'; data: TActivityLabelEvent }
  /** AI SDK: a transient `data-*` part. */
  | { type: 'reasoning_label'; data: TReasoningLabelEvent }
  /** Server bookkeeping that clients deliberately do not render. */
  | { type: 'reasoning_label_attempt'; data: TReasoningLabelAttemptEvent }
  /**
   * AI SDK: `text-delta`, `reasoning-delta`, `tool-input-*`, `tool-output-*`,
   * `start-step` and `finish-step`, which LibreChat carries as graph step events.
   */
  | { type: 'step'; data: ChatStepFrame }
  /** AI SDK: `text-delta` and friends, for content-part streams (Assistants). */
  | { type: 'content'; data: TContentData }
  /** AI SDK: `text-delta`, except the text is cumulative rather than a delta. */
  | { type: 'text'; data: ChatTextFrame }
  /** AI SDK: `error`. `data` is `undefined` when the error body was not JSON. */
  | { type: 'error'; data?: ChatErrorData | null }
  /** AI SDK: `abort`. The caller closed a stream that was still open. */
  | { type: 'abort' };

export type ChatEventType = ChatEvent['type'];

/** The route and JSON body `createPayload` builds for one turn. */
export type ChatTransportRequest = {
  server: string;
  payload: TPayload;
};

export type ChatTransportOptions = {
  /**
   * Aborting closes the connection. When it interrupts a stream that was still
   * open, the transport emits `{ type: 'abort' }` synchronously before going quiet.
   */
  signal: AbortSignal;
  /** Called synchronously for every event, in wire order. */
  onEvent: (event: ChatEvent) => void;
};

/**
 * Carries one turn from request to terminal event. Implementations own the
 * wire (connection, framing, auth refresh); callers only see {@link ChatEvent}s.
 *
 * AI SDK: `ChatTransport`. `send` corresponds to `sendMessages`, returning
 * through a callback rather than a `ReadableStream` so handlers keep running
 * synchronously inside the frame that produced them. `reconnectToStream` has
 * no counterpart yet; resume still lives in `useResumableSSE`.
 */
export interface ChatTransport<TRequest = ChatTransportRequest> {
  send(request: TRequest, options: ChatTransportOptions): void;
}
