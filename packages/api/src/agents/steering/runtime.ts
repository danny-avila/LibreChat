import * as agentsSdk from '@librechat/agents';
import { logger } from '@librechat/data-schemas';
import type { HookCallback, HookInputByEvent, HookOutputByEvent } from '@librechat/agents';
import type { SteerQueueItem } from '~/stream/interfaces/IJobStore';
import { GenerationJobManager } from '~/stream/GenerationJobManager';

/**
 * Structural mirror of the SDK's hook `injectedMessages` entries. Typed
 * locally — not as `InjectedMessage` — because the field ships in
 * `@librechat/agents` versions with `HOOK_INJECTED_MESSAGES_CAPABLE`; older
 * SDKs ignore it at runtime and their `PostToolBatchHookOutput` predates it.
 * Switch to the SDK types once the dependency is bumped. Content mirrors the
 * SDK's `string | MessageContentComplex[]` (arrays pass through to a
 * multimodal HumanMessage unchanged).
 */
interface SteerInjectedMessage {
  role: 'user';
  content: string | Array<Record<string, unknown>>;
  source: 'steer';
}

type SteerDrainOutput = HookOutputByEvent['PostToolBatch'] & {
  injectedMessages?: SteerInjectedMessage[];
};

/**
 * Whether the installed `@librechat/agents` converts hook-returned
 * `injectedMessages` into graph-state HumanMessages at the PostToolBatch
 * boundary. Steering wiring MUST gate on this: draining the queue on an SDK
 * that ignores `injectedMessages` would silently drop the user's words.
 * Read via the namespace so an older SDK yields `undefined` (→ false)
 * instead of a missing-binding failure.
 */
export function isSteeringSupported(): boolean {
  return (
    (agentsSdk as { HOOK_INJECTED_MESSAGES_CAPABLE?: boolean }).HOOK_INJECTED_MESSAGES_CAPABLE ===
    true
  );
}

/** Encoded multimodal content for a steer that carried attachments. */
export interface SteerMediaResult {
  /** Full ordered content array for graph injection (text part included). */
  content: Array<Record<string, unknown>>;
  /** Validated file refs (from the DB, not the client) for the persisted part. */
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
   * `on_steer_applied` SSE event. Called FIFO, before the graph injection is
   * returned. Failures are logged per item and never block the injection.
   */
  applySteer: (item: SteerQueueItem, media?: SteerMediaResult) => void | Promise<void>;
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
    const injectedMessages: SteerInjectedMessage[] = [];
    for (const item of steers) {
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
      try {
        await applySteer(item, media);
      } catch (error) {
        logger.error(
          `[steering] Failed to apply steer part for ${streamId} steer=${item.steerId}:`,
          error,
        );
      }
      injectedMessages.push({
        role: 'user' as const,
        content: media?.content ?? item.text,
        source: 'steer' as const,
      });
    }
    return { injectedMessages };
  };
}
