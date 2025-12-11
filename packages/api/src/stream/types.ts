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
  /** Buffered chunks for replay on reconnect */
  chunks: ServerSentEvent[];
  /** Final event when job completes */
  finalEvent?: ServerSentEvent;
  /** Aggregated content parts for saving partial response */
  aggregatedContent?: ContentPart[];
  /** Tracked run steps for reconnection - maps step ID to step data */
  runSteps: Map<string, Agents.RunStep>;
  /** Flag to indicate if a sync event was already sent (prevent duplicate replays) */
  syncSent?: boolean;
}

export type ContentPart = Agents.ContentPart;
export type ResumeState = Agents.ResumeState;

export type ChunkHandler = (event: ServerSentEvent) => void;
export type DoneHandler = (event: ServerSentEvent) => void;
export type ErrorHandler = (error: string) => void;
export type UnsubscribeFn = () => void;
