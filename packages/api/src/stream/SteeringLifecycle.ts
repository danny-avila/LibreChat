import { logger } from '@librechat/data-schemas';
import { ContentTypes, SteerEvents } from 'librechat-data-provider';
import type { TPendingSteer } from 'librechat-data-provider';
import type { IJobStore, SteerQueueItem } from '~/stream/interfaces/IJobStore';
import type { ServerSentEvent } from '~/types';

/** Client-safe projection of a queued steer (drops the server-only userId). */
export function toPendingSteer(item: SteerQueueItem): TPendingSteer {
  return {
    steerId: item.steerId,
    text: item.text,
    createdAt: item.createdAt,
    ...(item.files && item.files.length > 0 && { files: item.files }),
  };
}

/** Who a parked payload belongs to — the claim surface can outlive the job
 *  record, so ownership must travel with the payload itself. */
export interface SteerOwner {
  userId: string;
  tenantId?: string;
}

interface ParkedSteers extends SteerOwner {
  steers: TPendingSteer[];
}

/** The exact JSON substring the stores gate the atomic claim on — matches the
 *  `userId` member as {@link SteeringLifecycle.park} serializes it. */
export function toOwnerFragment(userId: string): string {
  return `"userId":${JSON.stringify(userId)}`;
}

/** Loosely-shaped content part for steer-id inspection across content views. */
export type SteerContentView = Array<{ type?: string; steerId?: string } | undefined>;

/**
 * Synthesize the `on_steer_applied` events a reconnecting subscriber missed in
 * the snapshot→subscribe window. Sourced from the FRESH content view, not the
 * snapshot queue: a steer accepted AND applied inside the gap never had a
 * snapshot id, so any steer part neither in the snapshot's applied set nor
 * still queued live was applied in the gap. Over-emitting a part the client
 * already holds is benign: re-delivery is idempotent client-side (applied-id
 * dedupe; the part is index-stable).
 */
export function synthesizeAppliedSteerEvents(
  snapshotContent: SteerContentView,
  liveQueue: SteerQueueItem[],
  freshContent: SteerContentView,
  meta: { conversationId: string; responseMessageId?: string },
): ServerSentEvent[] {
  const knownIds = new Set<string>();
  for (const part of snapshotContent) {
    if (part?.type === ContentTypes.STEER && part.steerId != null) {
      knownIds.add(part.steerId);
    }
  }
  for (const item of liveQueue) {
    knownIds.add(item.steerId);
  }
  const events: ServerSentEvent[] = [];
  for (let i = 0; i < freshContent.length; i++) {
    const part = freshContent[i];
    if (part?.type !== ContentTypes.STEER || part.steerId == null || knownIds.has(part.steerId)) {
      continue;
    }
    events.push({
      event: SteerEvents.ON_STEER_APPLIED,
      data: {
        steerId: part.steerId,
        index: i,
        part,
        conversationId: meta.conversationId,
        ...(meta.responseMessageId && { responseMessageId: meta.responseMessageId }),
      },
    } as ServerSentEvent);
  }
  return events;
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

  /**
   * User-cancelled before injection. Races with a drain settle inside the
   * store's atomic removal — `false` means the steer already injected (the
   * inline part is authoritative) or the run ended (the terminal paths own
   * delivery), and the cancel is simply too late.
   */
  cancel(streamId: string, steerId: string): Promise<boolean> {
    return this.store.removeSteer(streamId, steerId);
  }

  /** Drop any queued steers (terminal cleanup backstop). */
  clear(streamId: string): Promise<void> {
    return this.store.clearSteers(streamId);
  }

  /**
   * Parks terminally-drained leftovers under their own bounded-TTL store key
   * so a client with NO live subscriber (closed tab, reload racing the final
   * event) can still recover them via the status route — even after the
   * default `completeJob` path deletes the job record itself. The owner
   * identity travels WITH the payload for exactly that reason: the jobless
   * claim path has no job record left to authorize against. Live clients keep
   * using the final/abort event copy; recovery is idempotent (queued chips
   * dedupe by steer id).
   */
  async park(streamId: string, steers: TPendingSteer[], owner: SteerOwner): Promise<void> {
    if (steers.length === 0) {
      return;
    }
    const payload: ParkedSteers = {
      userId: owner.userId,
      ...(owner.tenantId != null && { tenantId: owner.tenantId }),
      steers,
    };
    try {
      await this.store.parkSteers(streamId, JSON.stringify(payload));
    } catch (error) {
      logger.warn(`[SteeringLifecycle] Failed to park leftover steers: ${streamId}`, error);
    }
  }

  /**
   * Claim-on-read: returns parked leftovers and clears them, so a second
   * reload cannot re-mint chips the user already dismissed. The user check
   * runs INSIDE the store's atomic claim (substring gate on the payload), so
   * a non-owner probe never deletes the payload — not even transiently. The
   * parse below stays authoritative (a steer text could embed the fragment);
   * a tenant mismatch re-parks so it cannot destroy the owner's recovery.
   */
  async claim(streamId: string, requester: SteerOwner): Promise<TPendingSteer[]> {
    let raw: string | undefined;
    try {
      raw = await this.store.claimParkedSteers(streamId, toOwnerFragment(requester.userId));
    } catch (error) {
      logger.warn(`[SteeringLifecycle] Failed to claim leftover steers: ${streamId}`, error);
      return [];
    }
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as ParkedSteers;
      const ownerMatch =
        parsed.userId === requester.userId &&
        (parsed.tenantId == null || parsed.tenantId === requester.tenantId);
      if (!ownerMatch) {
        await this.store.parkSteers(streamId, raw);
        return [];
      }
      return Array.isArray(parsed.steers) ? parsed.steers : [];
    } catch (error) {
      logger.warn(`[SteeringLifecycle] Failed to parse leftover steers: ${streamId}`, error);
      return [];
    }
  }
}
