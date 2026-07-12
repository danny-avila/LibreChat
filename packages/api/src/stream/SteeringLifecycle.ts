import { logger } from '@librechat/data-schemas';
import type { TPendingSteer } from 'librechat-data-provider';
import type { IJobStore, SteerQueueItem } from '~/stream/interfaces/IJobStore';

/** Client-safe projection of a queued steer (drops the server-only userId). */
export function toPendingSteer(item: SteerQueueItem): TPendingSteer {
  return {
    steerId: item.steerId,
    text: item.text,
    createdAt: item.createdAt,
    ...(item.files && item.files.length > 0 && { files: item.files }),
  };
}

/**
 * The FIFO queue of mid-run steering messages for a generation job.
 *
 * A steer is a user message submitted while a run is generating. The steer
 * route (any instance) enqueues it against the job; the owning process's
 * run-scoped `PostToolBatch` hook drains the queue at the next tool-batch
 * boundary and injects each entry into graph state as its own user message.
 *
 * Race-safety mirrors {@link ApprovalLifecycle}: enqueue is status-guarded in
 * the store (a steer can never land on a completed/aborted job — the caller
 * gets a rejection code instead), and drain is an atomic take-all so a steer
 * is delivered to exactly one drain. Steers left in the queue when the run
 * reaches a terminal state are drained by the finalization paths and reported
 * to the client, which converts them to queued follow-up turns.
 */
export class SteeringLifecycle {
  constructor(private readonly store: IJobStore) {}

  /**
   * Append a steer, guarded on the job being `running`. Returns the new queue
   * depth, or a rejection code ({@link STEER_ENQUEUE_NOT_RUNNING} /
   * {@link STEER_ENQUEUE_QUEUE_FULL}).
   */
  async enqueue(streamId: string, item: SteerQueueItem): Promise<number> {
    const depth = await this.store.enqueueSteer(streamId, item);
    if (depth > 0) {
      logger.debug(
        `[SteeringLifecycle] queued steer: ${streamId} steer=${item.steerId} depth=${depth}`,
      );
    }
    return depth;
  }

  /** Atomically take ALL queued steers, FIFO. `expectedCreatedAt` refuses the
   *  drain inside the store when the job was replaced. */
  drain(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]> {
    return this.store.drainSteers(streamId, expectedCreatedAt);
  }

  /**
   * Terminal drain: atomically CLOSE the queue to new steers, then take all
   * queued items. Finalization paths use this so a steer POST racing the
   * final/abort event can never be ACKed after the last drain and then
   * silently cleared — once closed, enqueue rejects (the client falls back to
   * a normal send) until the next `createJob` reopens the stream id.
   * `expectedCreatedAt` keeps a stale run's finalization from closing or
   * stealing a replacement job's queue.
   */
  closeAndDrain(streamId: string, expectedCreatedAt?: number): Promise<SteerQueueItem[]> {
    return this.store.closeAndDrainSteers(streamId, expectedCreatedAt);
  }

  /** Non-destructive FIFO read (status/resume surfaces). */
  peek(streamId: string): Promise<SteerQueueItem[]> {
    return this.store.peekSteers(streamId);
  }

  /** Drop any queued steers (terminal cleanup backstop). */
  clear(streamId: string): Promise<void> {
    return this.store.clearSteers(streamId);
  }
}
