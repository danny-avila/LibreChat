import type {
  Agents,
  TMessage,
  TSubmission,
  TConversation,
  TPendingSteer,
} from 'librechat-data-provider';
import type { GenerationProtocolVersion } from '../protocol';
import type { RunEnd } from '../steer/types';

/** Where a resumable run reports what it is doing. The app passes its own logger. */
export interface ResumableLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Whether the page is in the foreground, and a way to hear when that changes. */
export interface PageVisibility {
  isVisible: () => boolean;
  /** Calls `listener` on every visibility change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
}

/** The document's own visibility. */
export const documentVisibility: PageVisibility = {
  isVisible: () => document.visibilityState === 'visible',
  subscribe: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
};

/** The status route's answer for a conversation's generation. */
export interface StreamStatusResponse {
  /** Exact protocol selected by the job. Missing/1 is always legacy. */
  generationProtocolVersion?: number;
  active: boolean;
  /** Client-local cache marker used to force useResumeOnLoad to replace a
   * stale generation attachment with the newer epoch occupying this stream. */
  generationHandoff?: boolean;
  streamId?: string;
  status?: 'running' | 'complete' | 'error' | 'aborted' | 'requires_action';
  aggregatedContent?: Array<{ type: string; text?: string }>;
  createdAt?: number;
  /** Generation age computed on the server's clock, so a reattaching client
   *  can rebuild a clock-local elapsed baseline free of cross-machine skew. */
  elapsedMs?: number;
  resumeState?: Agents.ResumeState;
  /** The run's temporary state as the server recorded it at admission, so a rebuilt
   *  submission keeps a hidden chat out of history and titling after a reload. */
  isTemporary?: boolean;
  /** Live pending approval when `status === 'requires_action'`; mirrors
   *  `resumeState.pendingAction`, surfaced top-level for the resume-on-load path. */
  pendingAction?: Agents.PendingAction;
  /** Acknowledged steers a terminal drain parked because no subscriber was
   *  live for the final/abort event. Reads are replayable until an exact
   *  recovery turn persists or the user discards the item. */
  unrecoveredSteers?: TPendingSteer[];
}

/** Reads a conversation's generation status. */
export type FetchStreamStatus = (conversationId: string) => Promise<StreamStatusResponse>;

/** The generation one subscription attaches to, and how. */
export interface SubscriptionTarget {
  streamId: string;
  submission: TSubmission;
  /** Asks the server to replay the run's state (`sync`) before live events. */
  isResume: boolean;
  generationCreatedAt?: number;
  generationProtocolVersion: GenerationProtocolVersion;
  /** The pane's lifecycle: once aborted, nothing this subscription does lands. */
  signal?: AbortSignal;
}

/** How a subscription reaches the stream and decides when to re-attach. */
export interface SubscriptionHost {
  logger: ResumableLogger;
  visibility: PageVisibility;
  fetchStatus: FetchStreamStatus;
  /** Attaches a fresh subscription to `target`; how a subscription re-attaches itself. */
  subscribe: (target: SubscriptionTarget) => void;
}

/** How steers the run never injected are turned into queued follow-ups. */
export interface SteerQueueOptions {
  /** Reconcile the parked server copy of live-delivered terminal steers. */
  claimParked?: boolean;
  /** Protocol selected for the source generation. */
  generationProtocolVersion?: GenerationProtocolVersion;
  /** Exact recovery sources a post-terminal status read proved were not consumed. */
  allowPreviouslyConvertedIds?: readonly string[];
  /** Local failures have no durable receipt to reclaim on a later send. */
  bindRecoverySource?: boolean;
  /** Leave the converted rows for an explicit send instead of the run-end drain. */
  needsExplicitSend?: boolean;
}

/** The pane's steer chips: what the composer shows for steers sent into the running turn. */
export interface ResumableSteers {
  /** Re-seeds the chips from the server's still-queued steers. */
  seed: (
    conversationId: string,
    steers: TPendingSteer[],
    generationCreatedAt?: number,
    generationProtocolVersion?: GenerationProtocolVersion,
  ) => void;
  /** The steer ids the given messages or content parts already hold as applied parts. */
  appliedIds: (values: unknown[] | undefined) => string[];
  /** Settles the chips whose steers the given content already holds. */
  settleApplied: (conversationId: string, values: unknown[] | undefined) => void;
  convertToQueued: (
    conversationId: string,
    steers: TPendingSteer[],
    options?: SteerQueueOptions,
  ) => void;
  /** Sweeps the pane's local chips into queued follow-ups. */
  convertLocalToQueued: (
    conversationId: string,
    options?: {
      claimParked?: boolean;
      statuses?: readonly ('sending' | 'pending' | 'failed')[];
      excludeSteerIds?: Iterable<string>;
      generationProtocolVersion?: GenerationProtocolVersion;
    },
  ) => void;
}

/** The app's query cache, as far as a resumable run reads and refreshes it. */
export interface ResumableCache {
  /** Marks the conversation's messages stale; `all` refetches them now, `none` leaves that to
   *  the next read. */
  invalidateMessages: (conversationId: string, refetch: 'all' | 'none') => Promise<void>;
  /** Fetches the conversation's messages through its query. `fallback` reads them directly
   *  when no query for the conversation is mounted yet. */
  fetchMessages: (conversationId: string, fallback?: boolean) => Promise<unknown>;
  /** Marks the conversation stale and refetches it. */
  refreshConversation: (conversationId: string) => Promise<void>;
  /** Refetches every conversation list. */
  refreshConversationLists: () => Promise<void>;
  refreshPinnedConversations: () => Promise<void>;
  setStreamStatus: (conversationId: string, status: StreamStatusResponse) => void;
  removeStreamStatus: (conversationId: string) => void;
  invalidateStreamStatus: (conversationId: string) => void;
  addActiveJob: (streamId: string) => void;
  removeActiveJob: (streamId: string) => void;
  /** Reads the conversation's saved record; rejects with the HTTP failure, a 404 included. */
  fetchConversation: (conversationId: string) => Promise<TConversation | undefined>;
  setConversation: (conversationId: string, conversation: TConversation) => void;
  /** Places the conversation's snapshot into every conversation list. */
  upsertConversation: (conversation: TConversation) => void;
  /** Drops the conversation from every conversation list. */
  removeConversation: (conversationId: string) => void;
}

/** The pane's controls and run bookkeeping a resumable run drives. */
export interface ResumablePane {
  setIsSubmitting: (isSubmitting: boolean) => void;
  setShowStopButton: (show: boolean) => void;
  setSubmission: (submission: TSubmission | null) => void;
  setStreamId: (streamId: string | null) => void;
  /** Records the generation epoch a conversation's controls fence against; with `expected`,
   *  only while it still holds that epoch. Returns whether it was written. */
  setGenerationEpoch: (
    conversationId: string,
    next: number | null,
    expected?: number,
    generationProtocolVersion?: GenerationProtocolVersion,
  ) => boolean;
  setPendingAction: (conversationId: string, action: Agents.PendingAction | null) => void;
  /** Drops the composer drafts the finished run consumed. */
  clearComposerDrafts: (
    conversationId: string | null | undefined,
    options: { includeNewChatDraft: boolean },
  ) => void;
  publishRunEnd: (end: RunEnd, options?: { retainDetached?: boolean }) => void;
  /** Consumes an armed "interrupt & send" for exactly this generation. */
  clearDrainAfterAbort: (conversationId: string, generationCreatedAt?: number) => void;
  /** Refreshes the token balance, when the deployment tracks one. */
  refreshBalance: () => void;
  /** Updates the pane's conversation; absent for a pane that only adds a comparison response. */
  updateConversation?: (update: (current: TConversation | null) => TConversation | null) => void;
  /**
   * The end of a run this pane left mid-stream and is now reattached to, as `messages` record
   * it. `resolvable` is false when no such run is remembered or the user stopped it.
   */
  resolveDetachedEnd: (
    conversationId: string,
    messages: TMessage[] | undefined,
  ) => { resolvable: boolean; end: RunEnd | null };
}

/** What the event handlers that render the stream expose to the run. */
export interface ResumableEvents {
  clearStepMaps: () => void;
  flushPendingDeltas: () => void;
  /** Discards the live usage estimate for a run that stopped streaming. */
  resetLive: (submission: TSubmission) => void;
  /** Writes the failed turn's error card from the text (or raw error value) the server sent. */
  showError: (text: string | boolean | { message?: string }, submission: TSubmission) => void;
}

/** The pane's message list. */
export interface ResumableMessages {
  get: () => TMessage[] | undefined;
  set: (messages: TMessage[]) => void;
}

/** Everything a resumable run needs from the app it runs in. */
export interface ResumableHost extends SubscriptionHost {
  cache: ResumableCache;
  pane: ResumablePane;
  steers: ResumableSteers;
  events: ResumableEvents;
  messages: ResumableMessages;
}
