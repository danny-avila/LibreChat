import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { IJobStore } from '~/stream/interfaces/IJobStore';

/**
 * The guarded lifecycle of a run paused for human review (`requires_action`).
 *
 * Owns the legal transitions — pause, resolve, expire — behind one interface,
 * on top of the store's atomic {@link IJobStore.transitionStatus}. Callers
 * (approval routes, the status endpoint, the run seam) cross this seam instead
 * of re-implementing the "is this transition legal from the current state, and
 * is it safe under a concurrent second submit" logic at each site.
 *
 * Race-safety is the point. Two approval clicks racing to resume the same job
 * must not both drive the run — a double-drive re-executes tools and
 * double-bills. {@link resolve} returns `true` to exactly one caller; the loser
 * gets `false`. The same guard protects {@link pause} (don't pause a job that
 * was aborted between the interrupt firing and the mark) and {@link expire}.
 *
 * State machine:
 * ```
 *   running ──pause(pendingAction)──▶ requires_action
 *   requires_action ──resolve()──────▶ running
 *   requires_action ──expire()───────▶ aborted   (the edge that was undefined)
 * ```
 */
export class ApprovalLifecycle {
  constructor(private readonly store: IJobStore) {}

  /**
   * `running → requires_action`, attaching the pending review record.
   * Returns `false` when the job was not running (aborted mid-flight, gone),
   * so a late interrupt is dropped rather than pausing a dead job.
   */
  async pause(streamId: string, pendingAction: Agents.PendingAction): Promise<boolean> {
    const ok = await this.store.transitionStatus(streamId, {
      from: 'running',
      to: 'requires_action',
      patch: { pendingAction },
    });
    if (ok) {
      logger.debug(
        `[ApprovalLifecycle] paused for review: ${streamId} action=${pendingAction.actionId}`,
      );
    }
    return ok;
  }

  /**
   * The pending review record, or `null` when the job isn't awaiting review.
   * A past-`expiresAt` record reads as `null` (lazy expiry) so a stale prompt
   * is never surfaced to a UI or fed to a resume.
   */
  async peek(streamId: string): Promise<Agents.PendingAction | null> {
    const job = await this.store.getJob(streamId);
    if (!job || job.status !== 'requires_action' || !job.pendingAction) {
      return null;
    }
    return this.isExpired(job.pendingAction) ? null : job.pendingAction;
  }

  /**
   * `requires_action → running`, atomically. Returns `true` to the single
   * caller that won the transition; `false` if the job was not paused, was
   * already resumed by a racing submit, or had expired — in which case it is
   * moved to a terminal state instead of resumed.
   *
   * The caller MUST treat `false` as "do not drive the run": only the `true`
   * winner may re-enter the agent.
   */
  async resolve(streamId: string): Promise<boolean> {
    const job = await this.store.getJob(streamId);
    if (
      job?.status === 'requires_action' &&
      job.pendingAction &&
      this.isExpired(job.pendingAction)
    ) {
      await this.expire(streamId);
      return false;
    }
    return this.store.transitionStatus(streamId, {
      from: 'requires_action',
      to: 'running',
      clear: ['pendingAction'],
    });
  }

  /**
   * `requires_action → aborted`: the edge that fires when no decision arrives
   * in time. Previously undefined; now an explicit, idempotent terminal
   * transition. Returns `true` to the single caller that expired it.
   */
  async expire(streamId: string): Promise<boolean> {
    const ok = await this.store.transitionStatus(streamId, {
      from: 'requires_action',
      to: 'aborted',
      clear: ['pendingAction'],
      patch: { error: 'Approval expired before a decision was made' },
    });
    if (ok) {
      logger.debug(`[ApprovalLifecycle] expired pending review: ${streamId}`);
    }
    return ok;
  }

  private isExpired(pendingAction: Agents.PendingAction): boolean {
    return pendingAction.expiresAt != null && pendingAction.expiresAt <= Date.now();
  }
}
