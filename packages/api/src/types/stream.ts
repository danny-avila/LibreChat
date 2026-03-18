import type { EventEmitter } from 'events';
import type { Agents } from 'librechat-data-provider';
import type { ServerSentEvent } from '~/types';

export interface GenerationJobMetadata {
  userId: string;
  conversationId?: string;
  /** User message data for rebuilding submission on reconnect */
  userMessage?: Agents.UserMessageMeta;
  /** Response message ID for tracking */
  responseMessageId?: string;
  /** Sender label for the response (e.g., "GPT-4.1", "Claude") */
  sender?: string;
  /** Endpoint identifier for abort handling */
  endpoint?: string;
  /** Icon URL for UI display */
  iconURL?: string;
  /** Model name for token tracking */
  model?: string;
  /** Prompt token count for abort token spending */
  promptTokens?: number;
}

export type GenerationJobStatus = 'running' | 'complete' | 'error' | 'aborted';

export interface GenerationJob {
  streamId: string;
  emitter: EventEmitter;
  status: GenerationJobStatus;
  createdAt: number;
  completedAt?: number;
  abortController: AbortController;
  error?: string;
  metadata: GenerationJobMetadata;
  readyPromise: Promise<void>;
  resolveReady: () => void;
  /** Final event when job completes */
  finalEvent?: ServerSentEvent;
  /** Flag to indicate if a sync event was already sent (prevent duplicate replays) */
  syncSent?: boolean;
}

export type ContentPart = Agents.ContentPart;
export type ResumeState = Agents.ResumeState;

export type ChunkHandler = (event: ServerSentEvent) => void;
export type DoneHandler = (event: ServerSentEvent) => void;
export type ErrorHandler = (error: string) => void;
export type UnsubscribeFn = () => void;

/** Options for subscribing to a job event stream */
export interface SubscribeOptions {
  /**
   * When true, skips replaying the earlyEventBuffer.
   * Use for resume connections after a sync event has been sent.
   */
  skipBufferReplay?: boolean;
}

/** Result of an atomic subscribe-with-resume operation */
export interface SubscribeWithResumeResult {
  subscription: { unsubscribe: UnsubscribeFn } | null;
  resumeState: ResumeState | null;
  /**
   * Events that arrived between the resume snapshot and the subscribe call.
   * In-memory mode: drained from earlyEventBuffer (only place they exist).
   * Redis mode: empty — chunks are persisted to the store and appear in aggregatedContent on next resume.
   */
  pendingEvents: ServerSentEvent[];
}
