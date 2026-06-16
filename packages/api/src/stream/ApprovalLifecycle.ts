import { logger } from '@librechat/data-schemas';
import type { Agents } from 'librechat-data-provider';
import type { IJobStore } from '~/stream/interfaces/IJobStore';
import { isPendingActionExpired, isPendingActionStale } from '~/stream/interfaces/IJobStore';

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
      // pendingActionId is the flat mirror the atomic resolve/expire guard on.
      patch: { pendingAction, pendingActionId: pendingAction.actionId },
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
    if (!job || job.status !== 'requires_action') {
      return null;
    }
    // isPendingActionStale covers both a missing record and a past-expiry one.
    return isPendingActionStale(job) ? null : (job.pendingAction ?? null);
  }

  /**
   * `requires_action → running`, atomically. Returns `true` to the single
   * caller that won the transition; `false` if the job was not paused, was
   * already resumed by a racing submit, no longer matches `expectedActionId`,
   * or had expired — in which case it is moved to a terminal state instead of
   * resumed.
   *
   * Pass `expectedActionId` (the id the user actually decided on, from the
   * approval route) so a stale decision can't resume a job that has since
   * paused for a *different* action. Omit it only for callers with no specific
   * action in hand.
   *
   * The caller MUST treat `false` as "do not drive the run": only the `true`
   * winner may re-enter the agent.
   */
  async resolve(streamId: string, expectedActionId?: string): Promise<boolean> {
    const job = await this.store.getJob(streamId);
    if (job?.status === 'requires_action' && !job.pendingAction) {
      // The prompt was lost (e.g. a malformed record dropped on deserialize).
      // It can't be reviewed, so finalize the job instead of driving a resumed
      // run with no reviewed interrupt payload — consistent with how the active
      // listing and cleanup treat a stale pending action.
      await this.expire(streamId);
      return false;
    }
    if (job?.status === 'requires_action' && job.pendingAction && isPendingActionExpired(job)) {
      // Target the exact record observed as expired. If the caller didn't pin an
      // actionId, fall back to the one just read — otherwise a concurrent
      // resume + re-pause for a new action could let this expire abort it.
      await this.expire(streamId, expectedActionId ?? job.pendingAction.actionId);
      return false;
    }
    return this.store.transitionStatus(streamId, {
      from: 'requires_action',
      to: 'running',
      clear: ['pendingAction', 'pendingActionId'],
      // Refresh the liveness basis so a long-paused run isn't reaped as stale
      // immediately after resuming (cleanup keys off lastActiveAt).
      patch: { lastActiveAt: Date.now() },
      expectActionId: expectedActionId,
    });
  }

  /**
   * `requires_action → aborted`: the edge that fires when no decision arrives
   * in time. Previously undefined; now an explicit, idempotent terminal
   * transition. Returns `true` to the single caller that expired it. Honors
   * `expectedActionId` for the same stale-decision protection as `resolve`.
   */
  async expire(streamId: string, expectedActionId?: string): Promise<boolean> {
    const ok = await this.store.transitionStatus(streamId, {
      from: 'requires_action',
      to: 'aborted',
      clear: ['pendingAction', 'pendingActionId'],
      // completedAt lets the stores' terminal-cleanup reclaim the job; without
      // it an expired approval lingers in the in-memory map indefinitely.
      patch: { error: 'Approval expired before a decision was made', completedAt: Date.now() },
      expectActionId: expectedActionId,
    });
    if (ok) {
      logger.debug(`[ApprovalLifecycle] expired pending review: ${streamId}`);
    }
    return ok;
  }
}
