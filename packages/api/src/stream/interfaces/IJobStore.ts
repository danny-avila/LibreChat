import type { Agents } from 'librechat-data-provider';
import type { StandardGraph } from '@librechat/agents';

/**
 * Job status enum
 */
export type JobStatus = 'running' | 'complete' | 'error' | 'aborted';

/**
 * Serializable job data - no object references, suitable for Redis/external storage
 */
export interface SerializableJobData {
  streamId: string;
  userId: string;
  status: JobStatus;
  createdAt: number;
  completedAt?: number;
  conversationId?: string;
  error?: string;

  /** User message metadata */
  userMessage?: {
    messageId: string;
    parentMessageId?: string;
    conversationId?: string;
    text?: string;
  };

  /** Response message ID for reconnection */
  responseMessageId?: string;

  /** Sender name for UI display */
  sender?: string;

  /** Whether sync has been sent to a client */
  syncSent: boolean;

  /** Serialized final event for replay */
  finalEvent?: string;

  /** Endpoint metadata for abort handling - avoids storing functions */
  endpoint?: string;
  iconURL?: string;
  model?: string;
  promptTokens?: number;
}

/**
 * Result returned from aborting a job - contains all data needed
 * for token spending and message saving without storing callbacks
 */
export interface AbortResult {
  /** Whether the abort was successful */
  success: boolean;
  /** The job data at time of abort */
  jobData: SerializableJobData | null;
  /** Aggregated content from the stream */
  content: Agents.MessageContentComplex[];
  /** Plain text representation of content */
  text: string;
  /** Final event to send to client */
  finalEvent: unknown;
}

/**
 * Resume state for reconnecting clients
 */
export interface ResumeState {
  runSteps: Agents.RunStep[];
  aggregatedContent: Agents.MessageContentComplex[];
  userMessage?: SerializableJobData['userMessage'];
  responseMessageId?: string;
  conversationId?: string;
  sender?: string;
}

/**
 * Interface for job storage backend.
 * Implementations can use in-memory Map, Redis, KV store, etc.
 */
export interface IJobStore {
  /** Initialize the store (e.g., connect to Redis, start cleanup intervals) */
  initialize(): Promise<void>;

  /** Create a new job */
  createJob(
    streamId: string,
    userId: string,
    conversationId?: string,
  ): Promise<SerializableJobData>;

  /** Get a job by streamId (streamId === conversationId) */
  getJob(streamId: string): Promise<SerializableJobData | null>;

  /** Update job data */
  updateJob(streamId: string, updates: Partial<SerializableJobData>): Promise<void>;

  /** Delete a job */
  deleteJob(streamId: string): Promise<void>;

  /** Check if job exists */
  hasJob(streamId: string): Promise<boolean>;

  /** Get all running jobs (for cleanup) */
  getRunningJobs(): Promise<SerializableJobData[]>;

  /** Cleanup expired jobs */
  cleanup(): Promise<number>;

  /** Get total job count */
  getJobCount(): Promise<number>;

  /** Get job count by status */
  getJobCountByStatus(status: JobStatus): Promise<number>;

  /** Destroy the store and release resources */
  destroy(): Promise<void>;
}

/**
 * Interface for pub/sub event transport.
 * Implementations can use EventEmitter, Redis Pub/Sub, etc.
 */
export interface IEventTransport {
  /** Subscribe to events for a stream */
  subscribe(
    streamId: string,
    handlers: {
      onChunk: (event: unknown) => void;
      onDone?: (event: unknown) => void;
      onError?: (error: string) => void;
    },
  ): { unsubscribe: () => void };

  /** Publish a chunk event */
  emitChunk(streamId: string, event: unknown): void;

  /** Publish a done event */
  emitDone(streamId: string, event: unknown): void;

  /** Publish an error event */
  emitError(streamId: string, error: string): void;

  /** Get subscriber count for a stream */
  getSubscriberCount(streamId: string): number;

  /** Check if this is the first subscriber (for ready signaling) */
  isFirstSubscriber(streamId: string): boolean;

  /** Listen for all subscribers leaving */
  onAllSubscribersLeft(streamId: string, callback: () => void): void;

  /** Cleanup transport resources for a specific stream */
  cleanup(streamId: string): void;

  /** Destroy all transport resources */
  destroy(): void;
}

/**
 * Interface for content state management.
 * Separates volatile content state from persistent job data.
 * In-memory only - not persisted to external storage.
 */
export interface IContentStateManager {
  /** Set content parts reference (in-memory only) */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void;

  /** Get content parts */
  getContentParts(streamId: string): Agents.MessageContentComplex[] | null;

  /** Set graph reference for run steps */
  setGraph(streamId: string, graph: StandardGraph): void;

  /** Get run steps from graph */
  getRunSteps(streamId: string): Agents.RunStep[];

  /** Clear content state for a job */
  clearContentState(streamId: string): void;

  /** Destroy all content state resources */
  destroy(): void;
}
