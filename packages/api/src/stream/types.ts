import type { EventEmitter } from 'events';
import type { ServerSentEvent } from '~/types';

export interface GenerationJobMetadata {
  userId: string;
  conversationId?: string;
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
}

export interface ContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export type ChunkHandler = (event: ServerSentEvent) => void;
export type DoneHandler = (event: ServerSentEvent) => void;
export type ErrorHandler = (error: string) => void;
export type UnsubscribeFn = () => void;
