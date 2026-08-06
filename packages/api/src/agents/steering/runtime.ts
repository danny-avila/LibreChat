import * as agentsSdk from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type {
  StreamPreemption,
  HookCallback,
  HookInputByEvent,
  HookOutputByEvent,
  InjectedMessage,
} from '@librechat/agents';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';

type SteerDrainOutput = HookOutputByEvent['PostToolBatch'];

/**
 * Whether the installed `@librechat/agents` supports the FULL steering
 * contract — both halves are required before any steer part may be created:
 * 1. `HOOK_INJECTED_MESSAGES_CAPABLE`: hook-returned `injectedMessages`
 *    convert into graph-state HumanMessages at the PostToolBatch boundary
 *    (draining the queue without this silently drops the user's words).
 * 2. `ContentTypes.STEER`: the SDK's `formatAgentMessages` replays persisted
 *    steer parts as user turns on later prompts (the replay branch ships in
 *    the same SDK commit as the enum member). Without it, a persisted steer
 *    part would fall through the formatter's catch-all INTO the assistant's
 *    provider content — so an SDK that can inject but not replay must still
 *    501 the steer route.
 * The pinned dependency (^3.2.62) carries both; the runtime probe stays (read
 * via the namespace so an older install yields `undefined` → false, not a
 * missing-binding failure) as the defensive gate for mismatched deployments.
 */
export function isSteeringSupported(): boolean {
  const sdk = agentsSdk as {
    HOOK_INJECTED_MESSAGES_CAPABLE?: boolean;
    ContentTypes?: { STEER?: string };
  };
  return sdk.HOOK_INJECTED_MESSAGES_CAPABLE === true && sdk.ContentTypes?.STEER === 'steer';
}

/** Encoded multimodal content for a steer that carried attachments. */
export interface SteerMediaResult {
  /** Full ordered content array for graph injection (text part included). */
  content: Array<Record<string, unknown>>;
  /** Validated file refs (from the DB, not the client). */
  files?: SteerQueueItem['files'];
}

export interface SteerDrainHookOptions {
  streamId: string;
  /**
   * The job's `createdAt` captured when this run was wired. A steer route can
   * only enqueue against the CURRENT job, so if the live job's `createdAt`
   * differs, this run was replaced — it must not consume the new job's steers.
   */
  jobCreatedAt?: number;
  /**
   * Applies one drained steer to host state — appends the steer content part
   * at the live content index, bumps the shared index offset, and emits the
   * `on_steer_applied` SSE event. Called FIFO, BEFORE the item's media encode:
   * once a steer leaves the durable queue, the part must be persisted before
   * any slow/abortable work, or an abort during the encode loses the user's
   * words (the terminal drain sees an empty queue and the content snapshot
   * lacks the part). Failures are logged per item and never block injection.
   */
  applySteer: (item: SteerQueueItem) => void | Promise<void>;
  /**
   * Resolves a steer's attachment refs into encoded model content (owner-scoped
   * fetch + provider encoding, host-side). Only consulted for items that carry
   * files. Any failure degrades that steer to text-only — the user's words are
   * never dropped because an attachment could not be encoded.
   */
  buildMedia?: (item: SteerQueueItem) => Promise<SteerMediaResult | undefined>;
}

/**
 * Shared drain body for BOTH injection boundaries (PostToolBatch and
 * PreemptBoundary) — the provider-safety argument rests on the two sites
 * emitting identical `InjectedMessage` shapes, so they must share one body.
 *
 * Every part is durably applied before ANY slow media encoding begins. A
 * failed applied write restores that claimed item at the queue front; a crash
 * before restoration leaves its receipt `claimed`, which repairs to leftover
 * when the generation dies instead of claiming false delivery. The injections
 * array then builds from only the durably applied items. `noteSteersRemoved`
 * runs in `finally` —
 * the drained items are out of the queue no matter what, so any armed
 * preempt request for them must clear even on the failure path, or a
 * satisfied preempt could seal a later, unrelated stretch of generation.
 */
async function drainAndBuildInjections(opts: SteerDrainHookOptions): Promise<InjectedMessage[]> {
  const { streamId, jobCreatedAt, applySteer, buildMedia } = opts;
  // The replacement guard lives INSIDE the store's atomic drain: a separate
  // check-then-drain could still consume a replacement job's queue if
  // createJob landed between the two steps.
  /**
   * Snapshotted BEFORE the drain so an empty boundary disarms only the
   * requests it was responsible for. A second steer can enqueue and arm while
   * the drain is in flight; that arm is backed by a live queue item and must
   * survive.
   */
  const armedBeforeDrain = GenerationJobManager.getArmedPreemptIds(streamId, jobCreatedAt);
  const steers = await GenerationJobManager.steering.drain(streamId, jobCreatedAt);
  if (steers.length === 0) {
    /**
     * Nothing to inject. The snapshotted ids point at steers that have
     * already left the queue (drained at the other boundary, cancelled, or a
     * late cross-replica arm), so disarm them — a level-triggered poll left
     * true would seal again on the next chunk and truncate an unrelated
     * answer.
     */
    GenerationJobManager.clearPreemptRequests(streamId, armedBeforeDrain, jobCreatedAt);
    return [];
  }
  const injectedMessages: InjectedMessage[] = [];
  const appliedSteers: SteerQueueItem[] = [];
  const restoredIds = new Set<string>();
  try {
    let failedSteers: SteerQueueItem[] = [];
    for (let i = 0; i < steers.length; i++) {
      const item = steers[i];
      try {
        await applySteer(item);
        appliedSteers.push(item);
      } catch (error) {
        logger.error(
          `[steering] Failed to apply steer part for ${streamId} steer=${item.steerId}:`,
          error,
        );
        /** FIFO is semantic instruction order. Once one durable write fails,
         * no later item may overtake it; restore the failed item plus the
         * untouched suffix as one ordered front batch. */
        failedSteers = steers.slice(i);
        break;
      }
    }

    if (failedSteers.length > 0) {
      try {
        if (
          await GenerationJobManager.steering.restoreClaimed(streamId, failedSteers, jobCreatedAt)
        ) {
          for (const item of failedSteers) {
            restoredIds.add(item.steerId);
          }
        } else {
          logger.error(
            `[steering] Could not restore ${failedSteers.length} claimed steer(s) for ${streamId}; ` +
              'their receipts remain recoverable after this generation ends',
          );
        }
      } catch (error) {
        logger.error(
          `[steering] Failed to restore claimed steers for ${streamId}; ` +
            'their receipts remain recoverable after this generation ends:',
          error,
        );
      }
    }

    for (const item of appliedSteers) {
      let media: SteerMediaResult | undefined;
      if (buildMedia != null && (item.files?.length ?? 0) > 0) {
        try {
          media = await buildMedia(item);
        } catch (error) {
          logger.error(
            `[steering] Failed to encode steer media for ${streamId} steer=${item.steerId}; injecting text only:`,
            error,
          );
        }
      }
      injectedMessages.push({
        role: 'user' as const,
        content: (media?.content ?? item.text) as InjectedMessage['content'],
        source: 'steer' as const,
      });
    }
  } catch (error) {
    logger.error(`[steering] Drain interrupted for ${streamId}; injecting applied items:`, error);
  } finally {
    /**
     * Everything armed at snapshot time PLUS everything just drained. The
     * boundary has spent its seal, so a snapshotted id that did NOT come back
     * from the drain is stale — its steer left the queue by another route
     * (typically a cancel whose cross-replica clear was lost). Clearing only
     * the drained ids would leave that one level-triggered, sealing the very
     * continuation meant to answer the steer we just injected and landing on
     * an empty boundary as `preempt_incomplete`.
     *
     * Ids armed AFTER the snapshot are deliberately excluded: their queue
     * items are live and uninjected, and disarming them would strand an
     * interrupt the client was already told about.
     *
     * Not awaited: this runs on the OWNER, where the local disarm is
     * synchronous and already effective — the publish only informs other
     * replicas, and blocking a boundary drain on it would delay injection.
     */
    const spent = new Set(armedBeforeDrain.filter((steerId) => !restoredIds.has(steerId)));
    for (const item of steers) {
      if (!restoredIds.has(item.steerId)) {
        spent.add(item.steerId);
      }
    }
    void GenerationJobManager.noteSteersRemoved(streamId, [...spent], jobCreatedAt);
  }
  return injectedMessages;
}

/**
 * Build the run-scoped `PostToolBatch` hook that drains the job's steer queue
 * at each tool-batch boundary and injects each steer into graph state as its
 * own user message (`role: 'user'`, `source: 'steer'` — never consolidated
 * with hook context). Steers with attachments inject as multimodal content
 * arrays via `buildMedia`.
 *
 * Subagent scopes are skipped (`input.agentId` set): a steer targets the
 * top-level conversation, not a child agent's context. Hook errors are
 * swallowed by the SDK's `executeHooks`, so a broken drain can never kill the
 * run.
 */
export function createSteerDrainHook(opts: SteerDrainHookOptions): HookCallback<'PostToolBatch'> {
  return async (input: HookInputByEvent['PostToolBatch']): Promise<SteerDrainOutput> => {
    if (input.agentId != null) {
      return {};
    }
    const injectedMessages = await drainAndBuildInjections(opts);
    if (injectedMessages.length === 0) {
      return {};
    }
    return { injectedMessages };
  };
}

/**
 * The PreemptBoundary twin of {@link createSteerDrainHook}: fires after the
 * SDK seals a model stream mid-generation, drains the same durable queue
 * through the same shared body, and injects the same message shapes. Because
 * `noteSteersRemoved` lives in that shared body, a preempt satisfied at an
 * ordinary tool boundary clears its request there and cannot cause a
 * spurious seal later.
 */
export function createSteerPreemptBoundaryHook(
  opts: SteerDrainHookOptions,
): HookCallback<'PreemptBoundary'> {
  return async (
    input: HookInputByEvent['PreemptBoundary'],
  ): Promise<HookOutputByEvent['PreemptBoundary']> => {
    if (input.agentId != null) {
      return {};
    }
    const injectedMessages = await drainAndBuildInjections(opts);
    if (injectedMessages.length === 0) {
      return {};
    }
    return { injectedMessages };
  };
}

/**
 * The run's `RunConfig.preemption` — a level-triggered O(1) poll over the
 * job's armed preempt requests, exactly as the SDK contract requires: it
 * keeps returning true until the boundary drain (either boundary) clears the
 * request via `noteSteersRemoved`. Never consumes on read.
 */
export function createSteerPreemptPoll(streamId: string): StreamPreemption {
  return {
    shouldPreempt: () => GenerationJobManager.isPreemptRequested(streamId),
  };
}

/**
 * Whether the installed SDK can seal a generation mid-stream and inject at
 * the resulting boundary. A SEPARATE probe from `isSteeringSupported()`:
 * reusing that flag would arm an interrupt affordance that silently does
 * nothing on an SDK that can only inject at tool boundaries.
 */
export function isSteerPreemptSupported(): boolean {
  const sdk = agentsSdk as { HOOK_PREEMPT_BOUNDARY_CAPABLE?: boolean };
  return isSteeringSupported() && sdk.HOOK_PREEMPT_BOUNDARY_CAPABLE === true;
}
