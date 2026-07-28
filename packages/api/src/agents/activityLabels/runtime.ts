import { logger } from '@librechat/data-schemas';
import { initializeModel } from '@librechat/agents';
import type { ClientOptions, HookCallback, HookInputByEvent, Providers } from '@librechat/agents';

type PostToolBatchInput = HookInputByEvent['PostToolBatch'];
type BatchEntry = PostToolBatchInput['entries'][number];

/** Resolved provider + client options for the label model call. */
export interface ActivityLabelLLM {
  provider: Providers;
  clientOptions: ClientOptions;
  /**
   * Token config of the endpoint the LABEL runs on, which differs from the
   * agent's whenever `activityEndpoint` is set. Pricing must use this or a
   * cross-endpoint label is costed at the wrong rates.
   */
  endpointTokenConfig?: unknown;
  /**
   * True when the label resolved to the agent's OWN endpoint. Callers need
   * this to read an undefined `endpointTokenConfig` correctly: for a built-in
   * label endpoint undefined means "price from the shared table", so
   * inheriting the agent's custom rates there would misprice the label.
   */
  sameEndpoint?: boolean;
}

/**
 * Batch metadata handed to the host at slot-claim time (all deterministic).
 *
 * Deliberately carries no tool-type tally. A tally can only restate the tool
 * cards rendered directly beneath the header ("ran 1 command"), so it has no
 * place in either the prompt or the UI; the header earns its row solely by
 * saying something the cards cannot.
 */
export interface ActivityLabelBatchMeta {
  toolCallIds: string[];
  /** ok = all succeeded, failed = all failed, partial = mixed. */
  status: 'ok' | 'partial' | 'failed';
  /** Owning agent in multi-agent graphs — lets the host stamp the part for lane grouping. */
  executingAgentId?: string;
}

/**
 * Block context captured host-side at claim time (before more parts stream
 * in): reasoning excerpts from the block and the assistant's preceding text.
 * Never contains human messages.
 */
export interface ActivityLabelBlockContext {
  thinkingExcerpts?: string[];
  lastAssistantText?: string;
}

/**
 * A content slot claimed synchronously at the batch boundary. `fill` is
 * called later (or with `null` on failure) once the label resolves.
 */
export interface ActivityLabelSlot {
  index: number;
  /**
   * Resolves `true` when the fill COMMITTED (mutated content + emitted) and
   * `false` when the host dropped it because the response already finalized.
   * Usage accounting keys on this: a dropped label must not be billed.
   */
  fill: (text: string | null) => boolean | Promise<boolean>;
  /** Snapshot of block context, captured synchronously at claim time. */
  context?: ActivityLabelBlockContext;
}

/** Payload handed to the host's `generateLabel` (SDK-backed) implementation. */
export interface GenerateLabelPayload {
  entries: BatchEntry[];
  context: ActivityLabelBlockContext;
  /** Deterministic Langfuse trace seed, unique per slot. */
  traceSeed: string;
  signal: AbortSignal;
  /** Effective per-entry truncation, forwarded so host and SDK prompts agree. */
  charLimit: number;
  /**
   * Instruction for the label model. Always sent: left unset, the SDK falls
   * back to its own generic past-tense prompt and the register defined here
   * never reaches the preferred path.
   */
  prompt?: string;
  /**
   * Owning agent of the batch. Selects that agent's tracing metadata AND its
   * tool-output redaction policy on the SDK path, so a handoff is not traced
   * or redacted under the default agent's configuration.
   */
  executingAgentId?: string;
  /**
   * Defers usage accounting until AFTER the slot commits. A generator that
   * bills inline consumes the settlement window with its balance write, so
   * the deadline can expire mid-write — the charge lands but the fill is
   * then dropped as out-of-scope: billed, never shown. Registering the
   * accounting here instead lets the hook commit the visible label first and
   * only then run it, and only for a committed fill.
   */
  deferUsage: (collect: () => void | Promise<void>) => void;
}

/** Per-generation LLM callbacks for usage accounting on the fallback path. */
export interface ActivityLabelInvokeCallbacks {
  callbacks: Array<Record<string, unknown>>;
  collect: () => void | Promise<void>;
}

export interface ActivityLabelHookOptions {
  /**
   * Synchronously claims the next live content index on the host (push
   * placeholder part + bump the shared index offset, exactly like steering's
   * `applySteerPart`). Receives deterministic batch metadata so the
   * placeholder is informative before the LLM label lands. Must be cheap
   * — it runs inside the awaited hook.
   */
  claimSlot: (meta: ActivityLabelBatchMeta) => ActivityLabelSlot;
  /**
   * Preferred generation path: host bridges to the SDK's
   * `run.generateActivityLabel()` (session-grouped Langfuse tracing).
   *
   * Resolve `undefined` to decline — the SDK lacks the API — and the hook
   * falls back to a direct, untraced model call via `resolveLLM`. `null`
   * means the opposite: this path ran and produced no label, so the slot
   * fills empty. Hosts wire this bridge unconditionally (the run does not
   * exist yet at construction time), which is why declining has to be
   * expressible at call time rather than by omitting the option.
   */
  generateLabel?: (payload: GenerateLabelPayload) => Promise<string | null | undefined>;
  /**
   * Fallback model resolution for the direct-call path. Memoized here so
   * hosts can pass a fresh thunk without caching concerns.
   */
  resolveLLM: () => Promise<ActivityLabelLLM>;
  /** Run abort signal; in-flight label calls are also bounded by a timeout. */
  signal?: AbortSignal;
  /**
   * Factory for per-generation LLM callbacks (fallback path only): fresh
   * aggregator per call, `collect()` invoked after a successful response so
   * label calls participate in usage accounting like titles do.
   */
  getInvokeCallbacks?: () => ActivityLabelInvokeCallbacks;
  /** Cap on labels per run (cost guard). Default 20. */
  maxPerRun?: number;
  /** Per-entry output truncation for the prompt. Default 600 chars. */
  charLimit?: number;
  /**
   * `activityPrompt` override. Applies to BOTH paths: the SDK bridge passes
   * it through, and the direct fallback seeds `buildPrompt` with it instead
   * of the built-in instruction.
   */
  prompt?: string;
  /**
   * Labels already present on the response (HITL resume rebuilds the hook
   * with pre-pause content), so the per-response cap counts them instead of
   * restarting at zero after every approval.
   */
  initialGeneratedCount?: number;
  /**
   * Receives the whole detached task (generate → fill → deferred usage) so
   * the host's bounded settle covers the accounting too. Deferring usage
   * until after the commit moved it PAST the fill's resolution, so a settle
   * keyed on fills alone could let finalization flush the usage sink and
   * snapshot metadata while the label's billing was still in flight. The
   * task never rejects.
   */
  trackTask?: (task: Promise<void>) => void;
}

const DEFAULT_MAX_PER_RUN = 20;
const DEFAULT_CHAR_LIMIT = 600;
const INPUT_CHAR_LIMIT = 200;
const SUMMARY_TIMEOUT_MS = 12_000;

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * Serializes at most `limit + 1` characters of an arbitrary value. Tool
 * outputs are unbounded — a multi-megabyte result would otherwise be fully
 * materialized by `JSON.stringify` on EVERY detached label task just to keep
 * a few hundred characters, blocking the event loop for prompt fodder that
 * is immediately discarded. Traversal stops the moment the budget is spent
 * (the overshoot marks that `truncate` must append its ellipsis), which also
 * bounds cyclic structures: every level emits before recursing, so depth can
 * never exceed the budget. Output is JSON-shaped, not guaranteed JSON.
 */
function stringifyBounded(value: unknown, limit: number): string {
  const out: string[] = [];
  let length = 0;
  const push = (chunk: string): boolean => {
    out.push(chunk);
    length += chunk.length;
    return length <= limit;
  };
  const walk = (val: unknown): boolean => {
    if (typeof val === 'string') {
      /** Slice BEFORE quoting — quoting is what materializes the copy. */
      return push(JSON.stringify(val.length > limit + 1 ? val.slice(0, limit + 1) : val));
    }
    if (val == null || typeof val === 'number' || typeof val === 'boolean') {
      return push(String(val));
    }
    if (Array.isArray(val)) {
      if (!push('[')) {
        return false;
      }
      for (let i = 0; i < val.length; i++) {
        if ((i > 0 && !push(',')) || !walk(val[i])) {
          return false;
        }
      }
      return push(']');
    }
    if (typeof val === 'object') {
      const toJSON = (val as { toJSON?: () => unknown }).toJSON;
      if (typeof toJSON === 'function') {
        try {
          return walk(toJSON.call(val));
        } catch {
          return push(String(val).slice(0, limit + 1));
        }
      }
      if (!push('{')) {
        return false;
      }
      let first = true;
      for (const key of Object.keys(val)) {
        const entry = (val as Record<string, unknown>)[key];
        if (entry === undefined || typeof entry === 'function') {
          continue;
        }
        if ((!first && !push(',')) || !push(`${JSON.stringify(key)}:`) || !walk(entry)) {
          return false;
        }
        first = false;
      }
      return push('}');
    }
    return push(String(val).slice(0, limit + 1));
  };
  walk(value);
  return out.join('').slice(0, limit + 1);
}

function stringifyUnknown(value: unknown, limit: number): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.length > limit + 1 ? value.slice(0, limit + 1) : value;
  }
  try {
    return stringifyBounded(value, limit);
  } catch {
    return String(value).slice(0, limit + 1);
  }
}

/**
 * Deterministic batch facts: which tool calls the label covers (for lane
 * stamping) and whether they succeeded (for failure tinting). No tool-type
 * tally — see {@link ActivityLabelBatchMeta}.
 */
export function classifyBatch(entries: BatchEntry[]): ActivityLabelBatchMeta {
  const toolCallIds: string[] = [];
  let failures = 0;
  for (const entry of entries) {
    toolCallIds.push(entry.toolUseId);
    if (entry.status === 'error') {
      failures += 1;
    }
  }
  let status: ActivityLabelBatchMeta['status'] = 'partial';
  if (failures === 0) {
    status = 'ok';
  } else if (failures === entries.length) {
    status = 'failed';
  }
  return { toolCallIds, status };
}

/**
 * The header sits directly above the tool cards it summarizes, so anything
 * the cards already display — tool names, how many ran, the arguments — is
 * noise when repeated. What the cards cannot show is the point of the batch
 * and how it came out, and that is the only thing worth a row of screen.
 *
 * Because this fires after the batch, the tool OUTPUTS are available: prefer
 * the answer the calls produced over a restatement of what was attempted.
 */
export const ACTIVITY_INSTRUCTION: string = [
  'You write the one-line header above a group of tool calls an AI agent just made.',
  'Write it like a git commit subject: past tense, verb first, leading with the most distinctive file, name, or finding.',
  'Say what the calls established or produced — the outcome, not the attempt. If they answered a question, the answer is the line.',
  'Never name the tools, never count them, never echo the arguments: the cards below the header already show all three.',
  'Write 4 to 9 words, sentence case, no trailing punctuation, no quotes or markdown.',
  'Good: "Confirmed /mnt/data resets between calls". "Traced the leak to formatAgentMessages". "Found 3 failing auth tests".',
  'Bad: "Ran 1 command". "Used bash_tool twice". "Executed ls /mnt/data". "Searched the codebase".',
  'If every call failed, say what failed and why, plainly.',
  'Output only the line.',
].join(' ');

export function buildPrompt(
  entries: BatchEntry[],
  charLimit: number,
  context?: ActivityLabelBlockContext,
  instruction?: string,
): string {
  const sections: string[] = [instruction ?? ACTIVITY_INSTRUCTION];
  if (context?.lastAssistantText) {
    sections.push(
      `Intent (assistant's last message): ${truncate(context.lastAssistantText, INPUT_CHAR_LIMIT)}`,
    );
  }
  if (context?.thinkingExcerpts?.length) {
    sections.push(
      'Reasoning excerpts:\n' +
        context.thinkingExcerpts
          .slice(0, 4)
          .map((excerpt) => `- ${truncate(excerpt, charLimit)}`)
          .join('\n'),
    );
  }
  const lines = entries.map((entry) => {
    const input = truncate(stringifyUnknown(entry.toolInput, INPUT_CHAR_LIMIT), INPUT_CHAR_LIMIT);
    const outcome =
      entry.status === 'error'
        ? `ERROR: ${truncate(entry.error ?? 'unknown error', charLimit)}`
        : truncate(stringifyUnknown(entry.toolOutput, charLimit), charLimit);
    return `- ${entry.toolName}(${input}) → ${outcome}`;
  });
  /** Flagged as reference material: without this the model tends to read the
   *  list as the thing to summarize and hands back a transcription of it. */
  sections.push(`What it called, and what came back (do not restate these):\n${lines.join('\n')}`);
  sections.push('Header:');
  return sections.join('\n\n');
}

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        typeof block === 'string' ? block : ((block as { text?: string })?.text ?? ''),
      )
      .join('')
      .trim();
  }
  return '';
}

function buildSignal(runSignal?: AbortSignal, hookSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
  const signals = [runSignal, hookSignal].filter((signal): signal is AbortSignal => signal != null);
  if (signals.length > 0 && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([...signals, timeout]);
  }
  return timeout;
}

/**
 * PoC PostToolBatch hook: claims a content slot synchronously, then generates
 * a one-line batch summary on a cheap model as a DETACHED promise — the hook
 * returns immediately so the next model call is never delayed. Failures fill
 * the slot with `null` (host renders nothing for empty summaries).
 */
export function createActivityLabelHook(
  opts: ActivityLabelHookOptions,
): HookCallback<'PostToolBatch'> {
  const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const charLimit = opts.charLimit ?? DEFAULT_CHAR_LIMIT;
  let generated = opts.initialGeneratedCount ?? 0;
  let llmPromise: Promise<ActivityLabelLLM> | null = null;

  const getLLM = (): Promise<ActivityLabelLLM> => {
    llmPromise = llmPromise ?? opts.resolveLLM();
    return llmPromise;
  };

  return async (input: PostToolBatchInput, hookSignal?: AbortSignal) => {
    /** Subagent scopes are skipped (`input.agentId` set), mirroring the steer
     *  drain: subagent content is buffered per spawning tool call, so a slot
     *  claimed here would land in the WRONG transcript (the main message). */
    if (input.agentId != null) {
      return {};
    }
    if (
      generated >= maxPerRun ||
      input.entries.length === 0 ||
      opts.signal?.aborted === true ||
      hookSignal?.aborted === true
    ) {
      return {};
    }
    generated += 1;
    const slot = opts.claimSlot({
      ...classifyBatch(input.entries),
      executingAgentId: input.executingAgentId,
    });

    const task = (async () => {
      /**
       * Usage accounting registered by whichever generation path ran, invoked
       * only after `slot.fill` settles. Billing BEFORE the commit let the
       * settlement deadline expire during the accounting's balance write —
       * the charge landed, then the fill was dropped as out-of-scope: billed,
       * never shown. Committing first makes the charge conditional on the
       * label actually surfacing.
       */
      let deferredUsage: (() => void | Promise<void>) | undefined;
      const collectDeferredUsage = async (committed: boolean) => {
        if (!committed || deferredUsage == null) {
          return;
        }
        try {
          await deferredUsage();
        } catch (error) {
          logger.warn(
            `[activityLabel] usage accounting failed (slot ${slot.index}): ${(error as Error)?.message ?? error}`,
          );
        }
      };
      try {
        /** Host run-abort signal AND the dispatch signal both cancel the
         *  label call — a user abort must not keep paying for generation
         *  until the timeout. */
        const signal = buildSignal(opts.signal, hookSignal);
        /** Direct, untraced call: the fallback when no SDK bridge is wired or
         *  when the bridge declines because the package is too old. */
        const generateDirect = async (): Promise<string | null> => {
          const { provider, clientOptions } = await getLLM();
          const model = initializeModel({
            provider,
            clientOptions: { ...clientOptions, streaming: false } as ClientOptions,
          });
          const invokeCallbacks = opts.getInvokeCallbacks?.();
          const response = await (
            model as { invoke: (input: string, config?: object) => Promise<{ content?: unknown }> }
          ).invoke(buildPrompt(input.entries, charLimit, slot.context, opts.prompt), {
            signal,
            ...(invokeCallbacks && { callbacks: invokeCallbacks.callbacks }),
          });
          const direct = extractText(response?.content);
          deferredUsage = invokeCallbacks?.collect;
          return direct;
        };

        let text: string | null = null;
        if (opts.generateLabel != null) {
          /** SDK-backed path: session-grouped Langfuse tracing via
           *  `run.generateActivityLabel()` (host bridges the call). */
          const bridged = await opts.generateLabel({
            entries: input.entries,
            context: slot.context ?? {},
            traceSeed: `${input.runId}-activity-${slot.index}`,
            signal,
            charLimit,
            deferUsage: (collect) => {
              deferredUsage = collect;
            },
            ...(opts.prompt != null && { prompt: opts.prompt }),
            ...(input.executingAgentId != null && { executingAgentId: input.executingAgentId }),
          });
          /** Declined (no SDK support) — not the same as "no label". */
          text = bridged === undefined ? await generateDirect() : bridged;
        } else {
          text = await generateDirect();
        }
        /** Trim centrally: a whitespace-only label from either path must
         *  fill null so the UI keeps the deterministic counts fallback. */
        const trimmed = text?.trim() ?? '';
        const committed = (await slot.fill(trimmed.length > 0 ? trimmed : null)) === true;
        await collectDeferredUsage(committed);
      } catch (error) {
        logger.warn(
          `[activityLabel] label generation failed (slot ${slot.index}): ${(error as Error)?.message ?? error}`,
        );
        let committed = false;
        try {
          committed = (await slot.fill(null)) === true;
        } catch {
          /* host fill must never throw into the void chain */
        }
        /** A throw after the provider responded still consumed tokens; bill
         *  them when the empty fill committed, on the same shown-iff-billed
         *  rule (collect itself never throws past its own catch). */
        await collectDeferredUsage(committed);
      }
    })();
    opts.trackTask?.(task);

    return {};
  };
}
