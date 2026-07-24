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
  fill: (text: string | null) => void | Promise<void>;
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
   * `run.generateActivityLabel()` (session-grouped Langfuse tracing). When
   * absent — SDK too old — the hook falls back to a direct, untraced model
   * call via `resolveLLM`.
   */
  generateLabel?: (payload: GenerateLabelPayload) => Promise<string | null>;
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
}

const DEFAULT_MAX_PER_RUN = 20;
const DEFAULT_CHAR_LIMIT = 600;
const INPUT_CHAR_LIMIT = 200;
const SUMMARY_TIMEOUT_MS = 12_000;

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function stringifyUnknown(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
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
    const input = truncate(stringifyUnknown(entry.toolInput), INPUT_CHAR_LIMIT);
    const outcome =
      entry.status === 'error'
        ? `ERROR: ${truncate(entry.error ?? 'unknown error', charLimit)}`
        : truncate(stringifyUnknown(entry.toolOutput), charLimit);
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

    void (async () => {
      try {
        /** Host run-abort signal AND the dispatch signal both cancel the
         *  label call — a user abort must not keep paying for generation
         *  until the timeout. */
        const signal = buildSignal(opts.signal, hookSignal);
        let text: string | null = null;
        if (opts.generateLabel != null) {
          /** SDK-backed path: session-grouped Langfuse tracing via
           *  `run.generateActivityLabel()` (host bridges the call). */
          text = await opts.generateLabel({
            entries: input.entries,
            context: slot.context ?? {},
            traceSeed: `${input.runId}-activity-${slot.index}`,
            signal,
            charLimit,
            ...(opts.prompt != null && { prompt: opts.prompt }),
          });
        } else {
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
          text = extractText(response?.content);
          await invokeCallbacks?.collect();
        }
        /** Trim centrally: a whitespace-only label from either path must
         *  fill null so the UI keeps the deterministic counts fallback. */
        const trimmed = text?.trim() ?? '';
        await slot.fill(trimmed.length > 0 ? trimmed : null);
      } catch (error) {
        logger.warn(
          `[activityLabel] label generation failed (slot ${slot.index}): ${(error as Error)?.message ?? error}`,
        );
        try {
          await slot.fill(null);
        } catch {
          /* host fill must never throw into the void chain */
        }
      }
    })();

    return {};
  };
}
