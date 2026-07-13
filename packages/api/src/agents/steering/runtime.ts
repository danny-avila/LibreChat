import * as agentsSdk from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type {
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
  const { streamId, jobCreatedAt, applySteer, buildMedia } = opts;
  return async (input: HookInputByEvent['PostToolBatch']): Promise<SteerDrainOutput> => {
    if (input.agentId != null) {
      return {};
    }
    // The replacement guard lives INSIDE the store's atomic drain: a separate
    // check-then-drain could still consume a replacement job's queue if
    // createJob landed between the two steps.
    const steers = await GenerationJobManager.steering.drain(streamId, jobCreatedAt);
    if (steers.length === 0) {
      return {};
    }
    const injectedMessages: InjectedMessage[] = [];
    for (const item of steers) {
      try {
        await applySteer(item);
      } catch (error) {
        logger.error(
          `[steering] Failed to apply steer part for ${streamId} steer=${item.steerId}:`,
          error,
        );
      }
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
    return { injectedMessages };
  };
}
