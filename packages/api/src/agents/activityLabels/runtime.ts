import { logger } from '@librechat/data-schemas';
import { initializeModel } from '@librechat/agents';
import type { ClientOptions, HookCallback, HookInputByEvent, Providers } from '@librechat/agents';

type PostToolBatchInput = HookInputByEvent['PostToolBatch'];
type BatchEntry = PostToolBatchInput['entries'][number];

/** Resolved provider + client options for the label model call. */
export interface ActivityLabelLLM {
  provider: Providers;
  clientOptions: ClientOptions;
}

/** Deterministic classification of a batch — computed from tool names, no LLM. */
export interface ToolBatchCounts {
  searches: number;
  reads: number;
  writes: number;
  commands: number;
  other: number;
}

/** Batch metadata handed to the host at slot-claim time (all deterministic). */
export interface ActivityLabelBatchMeta {
  toolCallIds: string[];
  counts: ToolBatchCounts;
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
  /** Cap on labels per run (cost guard). Default 20. */
  maxPerRun?: number;
  /** Per-entry output truncation for the prompt. Default 600 chars. */
  charLimit?: number;
}

const DEFAULT_MAX_PER_RUN = 20;
const DEFAULT_CHAR_LIMIT = 600;
const INPUT_CHAR_LIMIT = 200;
const SUMMARY_TIMEOUT_MS = 12_000;

export function isActivityLabelPocEnabled(): boolean {
  return process.env.ACTIVITY_LABELS_POC === 'true';
}

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
 * Tool-name classification, mirroring Claude Code's streamlined-mode
 * taxonomy (searches/reads/writes/commands/other) with LibreChat tool names.
 * Prefix match covers MCP tool naming (`<tool>_mcp_<server>`).
 */
const SEARCH_TOOLS = ['web_search', 'file_search', 'tool_search'];
const READ_TOOLS = ['read_file', 'retrieval'];
const WRITE_TOOLS = ['create_file', 'edit_file'];
const COMMAND_TOOLS = ['execute_code', 'bash_tool'];

function categorizeToolName(toolName: string): keyof ToolBatchCounts {
  if (SEARCH_TOOLS.some((t) => toolName.startsWith(t))) return 'searches';
  if (READ_TOOLS.some((t) => toolName.startsWith(t))) return 'reads';
  if (WRITE_TOOLS.some((t) => toolName.startsWith(t))) return 'writes';
  if (COMMAND_TOOLS.some((t) => toolName.startsWith(t))) return 'commands';
  return 'other';
}

export function classifyBatch(entries: BatchEntry[]): ActivityLabelBatchMeta {
  const counts: ToolBatchCounts = { searches: 0, reads: 0, writes: 0, commands: 0, other: 0 };
  const toolCallIds: string[] = [];
  let failures = 0;
  for (const entry of entries) {
    counts[categorizeToolName(entry.toolName)] += 1;
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
  return { toolCallIds, counts, status };
}

const INSTRUCTION = [
  'You write short labels for collapsed activity groups in a chat UI while an AI agent works.',
  'Describe what this block of reasoning and tool calls accomplished in 5 to 9 words.',
  'Past-tense verb first, distinctive nouns, outcomes not mechanics. If a call failed, say so plainly.',
  'Output only the label — no quotes, no markdown, no preamble, no trailing punctuation.',
].join(' ');

function buildPrompt(
  entries: BatchEntry[],
  charLimit: number,
  context?: ActivityLabelBlockContext,
): string {
  const sections: string[] = [INSTRUCTION];
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
  sections.push(`Tool calls:\n${lines.join('\n')}`);
  sections.push('Label:');
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

function buildSignal(runSignal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
  if (runSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([runSignal, timeout]);
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
  let generated = 0;
  let llmPromise: Promise<ActivityLabelLLM> | null = null;

  const getLLM = (): Promise<ActivityLabelLLM> => {
    llmPromise = llmPromise ?? opts.resolveLLM();
    return llmPromise;
  };

  return async (input: PostToolBatchInput, hookSignal?: AbortSignal) => {
    const runSignal = hookSignal ?? opts.signal;
    /** Subagent scopes are skipped (`input.agentId` set), mirroring the steer
     *  drain: subagent content is buffered per spawning tool call, so a slot
     *  claimed here would land in the WRONG transcript (the main message). */
    if (input.agentId != null) {
      return {};
    }
    if (generated >= maxPerRun || input.entries.length === 0 || runSignal?.aborted === true) {
      return {};
    }
    generated += 1;
    const slot = opts.claimSlot({
      ...classifyBatch(input.entries),
      executingAgentId: input.executingAgentId,
    });

    void (async () => {
      try {
        const signal = buildSignal(runSignal);
        let text: string | null = null;
        if (opts.generateLabel != null) {
          /** SDK-backed path: session-grouped Langfuse tracing via
           *  `run.generateActivityLabel()` (host bridges the call). */
          text = await opts.generateLabel({
            entries: input.entries,
            context: slot.context ?? {},
            traceSeed: `${input.runId}-activity-${slot.index}`,
            signal,
          });
        } else {
          const { provider, clientOptions } = await getLLM();
          const model = initializeModel({
            provider,
            clientOptions: { ...clientOptions, streaming: false } as ClientOptions,
          });
          const response = await (
            model as { invoke: (input: string, config?: object) => Promise<{ content?: unknown }> }
          ).invoke(buildPrompt(input.entries, charLimit, slot.context), { signal });
          text = extractText(response?.content);
        }
        await slot.fill(text != null && text.length > 0 ? text : null);
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
