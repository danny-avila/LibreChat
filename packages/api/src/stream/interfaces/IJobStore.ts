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
 *
 * Content state is tied to jobs:
 * - In-memory: Holds WeakRef to graph for live content/run steps access
 * - Redis: Persists chunks, reconstructs content on reconnect
 *
 * This consolidates job metadata + content state into a single interface.
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

  /**
   * Get active job IDs for a user.
   * Returns conversation IDs of running jobs belonging to the user.
   * Also performs self-healing cleanup of stale entries.
   *
   * @param userId - The user ID to query
   * @returns Array of conversation IDs with active jobs
   */
  getActiveJobIdsByUser(userId: string): Promise<string[]>;

  // ===== Content State Methods =====
  // These methods manage volatile content state tied to each job.
  // In-memory: Uses WeakRef to graph for live access
  // Redis: Persists chunks and reconstructs on demand

  /**
   * Set the graph reference for a job (in-memory only).
   * The graph provides live access to contentParts and contentData (run steps).
   *
   * In-memory: Stores WeakRef to graph
   * Redis: No-op (graph not transferable, uses chunks instead)
   *
   * @param streamId - The stream identifier
   * @param graph - The StandardGraph instance
   */
  setGraph(streamId: string, graph: StandardGraph): void;

  /**
   * Set content parts reference for a job.
   *
   * In-memory: Stores direct reference to content array
   * Redis: No-op (content built from chunks)
   *
   * @param streamId - The stream identifier
   * @param contentParts - The content parts array
   */
  setContentParts(streamId: string, contentParts: Agents.MessageContentComplex[]): void;

  /**
   * Get aggregated content for a job.
   *
   * In-memory: Returns live content from graph.contentParts or stored reference
   * Redis: Reconstructs from stored chunks
   *
   * @param streamId - The stream identifier
   * @returns Content parts or null if not available
   */
  getContentParts(streamId: string): Promise<{
    content: Agents.MessageContentComplex[];
  } | null>;

  /**
   * Get run steps for a job (for resume state).
   *
   * In-memory: Returns live run steps from graph.contentData
   * Redis: Fetches from persistent storage
   *
   * @param streamId - The stream identifier
   * @returns Run steps or empty array
   */
  getRunSteps(streamId: string): Promise<Agents.RunStep[]>;

  /**
   * Append a streaming chunk for later reconstruction.
   *
   * In-memory: No-op (content available via graph reference)
   * Redis: Uses XADD for append-only log efficiency
   *
   * @param streamId - The stream identifier
   * @param event - The SSE event to append
   */
  appendChunk(streamId: string, event: unknown): Promise<void>;

  /**
   * Clear all content state for a job.
   * Called on job completion/cleanup.
   *
   * @param streamId - The stream identifier
   */
  clearContentState(streamId: string): void;

  /**
   * Save run steps to persistent storage.
   * In-memory: No-op (run steps accessed via graph reference)
   * Redis: Persists for resume across instances
   *
   * @param streamId - The stream identifier
   * @param runSteps - Run steps to save
   */
  saveRunSteps?(streamId: string, runSteps: Agents.RunStep[]): Promise<void>;
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

  /**
   * Publish an abort signal to all replicas (Redis mode).
   * Enables cross-replica abort: user aborts on Replica B,
   * generating Replica A receives signal and stops.
   * Optional - only implemented in Redis transport.
   */
  emitAbort?(streamId: string): void;

  /**
   * Register callback for abort signals from any replica (Redis mode).
   * Called when abort is triggered from any replica.
   * Optional - only implemented in Redis transport.
   */
  onAbort?(streamId: string, callback: () => void): void;

  /** Get subscriber count for a stream */
  getSubscriberCount(streamId: string): number;

  /** Check if this is the first subscriber (for ready signaling) */
  isFirstSubscriber(streamId: string): boolean;

  /** Listen for all subscribers leaving */
  onAllSubscribersLeft(streamId: string, callback: () => void): void;

  /** Cleanup transport resources for a specific stream */
  cleanup(streamId: string): void;

  /** Get all tracked stream IDs (for orphan cleanup) */
  getTrackedStreamIds(): string[];

  /** Destroy all transport resources */
  destroy(): void;
}
