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
}

export type ChunkHandler = (event: ServerSentEvent) => void;
export type DoneHandler = (event: ServerSentEvent) => void;
export type ErrorHandler = (error: string) => void;
export type UnsubscribeFn = () => void;
