/**
 * @fileoverview Background tool calls.
 *
 * Lets the model dispatch an eligible (event-driven) tool call detached: the
 * host executor returns a synthetic handle immediately so the graph superstep
 * resolves, while the real work runs as a floating promise whose result lands
 * in an in-process registry. The model retrieves it via the
 * `check_background_task` poll tool. No `@librechat/agents` change is required —
 * a backgrounded call and the poll call are both synchronous from the graph's
 * view.
 *
 * Scope: cross-turn parallelism on a single Node process. The run's abort
 * signal does not reach the detached invoke (the graph forwards only
 * `configurable`/`metadata` to the tool-execute handler, never `signal`), so
 * the floating promise keeps running past turn completion and its result stays
 * in the in-process registry for a later turn to poll. Two boundaries: results
 * are lost on restart and are not shared across replicas (durable follow-up),
 * and ephemeral request-scoped MCP tools (runtime `{{LIBRECHAT_BODY_*}}`
 * placeholders) are never backgrounded — their connection is torn down at
 * request end, so the executor runs them in the foreground instead.
 *
 * Opt-in mirrors `deferred_tools`: an admin capability
 * (`AgentCapabilities.run_in_background`) gates the feature, and a per-tool
 * `tool_options[name].run_in_background` flag turns it on for a given tool,
 * which injects a `run_in_background` boolean into that tool's schema.
 *
 * @module packages/api/src/agents/background
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { Constants as AgentConstants } from '@librechat/agents';
import { Tools, Constants, imageGenTools } from 'librechat-data-provider';
import type { LCTool, LCToolRegistry, JsonSchemaType } from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import { SET_MEMORY_TOOL_NAME, DELETE_MEMORY_TOOL_NAME } from './memory';
import { ASK_USER_QUESTION_TOOL_NAME } from './hitl/askUserQuestionTool';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from './tools';
import { truncateMiddle } from '~/utils';

/** Argument the model sets on a tool call to dispatch it in the background. */
export const RUN_IN_BACKGROUND_ARG = 'run_in_background';

/**
 * `type` of the synthetic attachment emitted on a poll turn when a harvested
 * code task settles — the live "this backgrounded call finished" signal for
 * the original tool-call card (stdout-only runs emit no file attachments, so
 * attachment presence alone can't signal completion). Rides the existing
 * `attachment` SSE channel; never persisted. Mirrored in
 * `client/src/components/Chat/Messages/Content/Parts/handle.ts`.
 */
export const BACKGROUND_STATUS_ATTACHMENT_TYPE = 'background_task_status';

/** Poll tool name (LibreChat host-special-cased, not an SDK tool). */
export const CHECK_BACKGROUND_TASK_NAME: string = Constants.CHECK_BACKGROUND_TASK;

/**
 * Tools that must never be backgrounded — they either run through the SDK's
 * direct/host-special path (so the host `ON_TOOL_EXECUTE` interception never
 * sees them), depend on synchronous artifact/code-session continuity, or are
 * the background machinery itself.
 *
 * `execute_code`/`bash_tool` are NOT excluded: they flow through the generic
 * `ON_TOOL_EXECUTE` path, the detached invoke carries their code-session
 * config, and their completion is harvested onto the dispatch turn's message
 * (files persisted + tool-call output patched), with the exec session folded
 * back into the run's shared code session on poll.
 */
const EXCLUDED_BACKGROUND_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  AgentConstants.READ_FILE,
  AgentConstants.SKILL_TOOL,
  AgentConstants.TOOL_SEARCH,
  AgentConstants.PROGRAMMATIC_TOOL_CALLING,
  AgentConstants.BASH_PROGRAMMATIC_TOOL_CALLING,
  AgentConstants.SUBAGENT,
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  SET_MEMORY_TOOL_NAME,
  DELETE_MEMORY_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  CHECK_BACKGROUND_TASK_NAME,
  /**
   * Built-ins whose results are turned into user-visible attachments/citations
   * by the foreground `toolEndCallback`; a detached run stores only content, so
   * backgrounding them would silently drop those sources/files. Image-generation
   * tools are artifact-first — their files can't be reliably attached to an
   * already-saved turn — so they're excluded rather than degraded. Sourced from
   * the shared `imageGenTools` set plus the OAI toolkit ids it doesn't cover.
   */
  Tools.web_search,
  Tools.file_search,
  ...imageGenTools,
  'image_gen_oai',
  'image_edit_oai',
]);

/**
 * The `execute_code` capability marker expands into the `bash_tool` definition
 * at load time (there is one code-execution tool path end-to-end), so a code
 * background opt-in keyed by EITHER name covers the pair. Synthesized
 * ephemeral/model-spec options and hand-edited agents typically carry only the
 * `execute_code` key; without this the actual runtime def (`bash_tool`) would
 * silently never receive the injected param.
 */
function expandCodeToolOptions(toolOptions?: AgentToolOptions): AgentToolOptions | undefined {
  if (!toolOptions) {
    return toolOptions;
  }
  const codeOptIn =
    toolOptions[AgentConstants.EXECUTE_CODE]?.run_in_background === true ||
    toolOptions[AgentConstants.BASH_TOOL]?.run_in_background === true;
  if (!codeOptIn) {
    return toolOptions;
  }
  return {
    ...toolOptions,
    [AgentConstants.EXECUTE_CODE]: {
      ...toolOptions[AgentConstants.EXECUTE_CODE],
      run_in_background: true,
    },
    [AgentConstants.BASH_TOOL]: {
      ...toolOptions[AgentConstants.BASH_TOOL],
      run_in_background: true,
    },
  };
}

/**
 * Whether a tool may be dispatched in the background. Handoff tools
 * (`lc_transfer_to_*`) run through the direct path and are excluded by prefix.
 */
export function isBackgroundEligibleToolName(name: string): boolean {
  if (EXCLUDED_BACKGROUND_TOOL_NAMES.has(name)) {
    return false;
  }
  return !name.startsWith(AgentConstants.LC_TRANSFER_TO_);
}

/**
 * Coerces tool-call args to an object, parsing a stringified JSON object (some
 * providers deliver args as a string). Returns undefined for non-object args.
 */
function coerceArgsObject(args: unknown): Record<string, unknown> | undefined {
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === 'string' && args.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Whether tool-call args request background dispatch (handles stringified args). */
export function isBackgroundRequested(args: unknown): boolean {
  return coerceArgsObject(args)?.[RUN_IN_BACKGROUND_ARG] === true;
}

/** Whether tool-call args carry the `run_in_background` key at all (any value). */
export function hasRunInBackgroundArg(args: unknown): boolean {
  const obj = coerceArgsObject(args);
  return obj != null && RUN_IN_BACKGROUND_ARG in obj;
}

/**
 * Returns the args without the injected `run_in_background` key so the real
 * tool never receives a parameter it doesn't declare. Parses stringified JSON
 * object args; returns the value unchanged when the flag is absent.
 */
export function stripRunInBackgroundArg(args: unknown): unknown {
  const obj = coerceArgsObject(args);
  if (!obj || !(RUN_IN_BACKGROUND_ARG in obj)) {
    return args;
  }
  const { [RUN_IN_BACKGROUND_ARG]: _omit, ...rest } = obj;
  return rest;
}

const RUN_IN_BACKGROUND_PROPERTY: JsonSchemaType = Object.freeze<JsonSchemaType>({
  type: 'boolean',
  description:
    'Set true to run this tool call in the background: it returns immediately with a background_task_id instead of blocking, so you can keep working while it runs. Poll check_background_task with that id to collect the result. The task persists on this server, so you may collect it later in this turn or in a following turn (it does not survive a server restart). Use for a slow call whose result you do not need right away.',
});

/**
 * Returns a copy of the tool definition with a `run_in_background` boolean
 * added to its parameters. Never mutates the input (built-in defs are frozen
 * and MCP defs may be shared), and is a no-op if the property already exists.
 */
export function injectRunInBackgroundParam(def: LCTool): LCTool {
  const params = def.parameters;
  const existingProps = params?.properties ?? {};
  if (RUN_IN_BACKGROUND_ARG in existingProps) {
    return def;
  }
  const nextParams: JsonSchemaType = {
    ...params,
    type: 'object',
    properties: { ...existingProps, [RUN_IN_BACKGROUND_ARG]: RUN_IN_BACKGROUND_PROPERTY },
  };
  return { ...def, parameters: nextParams };
}

/**
 * Whether the `run_in_background` param can be cleanly injected into a tool.
 * False for non-object (e.g. string-input/DynamicTool) schemas — rewriting them
 * to an object would break the tool's input contract — and for tools that
 * already declare their own `run_in_background` parameter (which the executor
 * would otherwise hijack/strip).
 */
function canInjectRunInBackgroundParam(def: LCTool): boolean {
  const params = def.parameters;
  if (params == null) {
    return true;
  }
  if (params.type != null && params.type !== 'object') {
    return false;
  }
  return !(params.properties != null && RUN_IN_BACKGROUND_ARG in params.properties);
}

/** Returns a copy of the def without the injected `run_in_background` property. */
function removeRunInBackgroundParam(def: LCTool): LCTool {
  const params = def.parameters;
  if (params?.properties == null || !(RUN_IN_BACKGROUND_ARG in params.properties)) {
    return def;
  }
  const { [RUN_IN_BACKGROUND_ARG]: _omit, ...restProps } = params.properties;
  return { ...def, parameters: { ...params, properties: restProps } };
}

/**
 * Removes the background additions (the injected param + the `check_background_task`
 * def) from a tool-definition list. Used to sanitize a self-spawn subagent's
 * inherited inputs so it doesn't advertise a background schema the isolated child
 * path can't honor.
 */
export function stripBackgroundFromToolDefinitions(
  toolDefinitions: LCTool[] | undefined,
  backgroundToolNames: string[] | undefined,
): LCTool[] {
  const defs = toolDefinitions ?? [];
  const bgSet = new Set(backgroundToolNames ?? []);
  const next: LCTool[] = [];
  let changed = false;
  for (const def of defs) {
    if (def.name === CHECK_BACKGROUND_TASK_NAME) {
      changed = true;
      continue;
    }
    const stripped = bgSet.size > 0 && bgSet.has(def.name) ? removeRunInBackgroundParam(def) : def;
    if (stripped !== def) {
      changed = true;
    }
    next.push(stripped);
  }
  return changed ? next : defs;
}

/**
 * Registry counterpart of {@link stripBackgroundFromToolDefinitions}. Returns a
 * NEW registry (never mutates the shared parent one) without the poll tool and
 * with the injected param removed, so a self-spawn child that uses
 * tool_search/deferred loading can't rediscover the host-only background schema.
 */
export function stripBackgroundFromToolRegistry(
  toolRegistry: LCToolRegistry | undefined,
  backgroundToolNames: string[] | undefined,
): LCToolRegistry | undefined {
  if (!toolRegistry) {
    return toolRegistry;
  }
  const bgSet = new Set(backgroundToolNames ?? []);
  if (bgSet.size === 0 && !toolRegistry.has(CHECK_BACKGROUND_TASK_NAME)) {
    return toolRegistry;
  }
  const next: LCToolRegistry = new Map();
  for (const [name, def] of toolRegistry) {
    if (name === CHECK_BACKGROUND_TASK_NAME) {
      continue;
    }
    next.set(name, bgSet.has(name) ? removeRunInBackgroundParam(def) : def);
  }
  return next;
}

const CHECK_BACKGROUND_TASK_DESCRIPTION = `Check the status and retrieve the result of tool calls previously dispatched in the background (with run_in_background: true).

Provide a background_task_id to poll one task; omit it to list every background task in this conversation. A task is only finished when its status is "completed" or "error" — never assume completion without polling. Results are not pushed to you; you must call this tool to collect them. Background tasks persist on this server across turns, so you can collect a result in a later turn; they do not survive a server restart.`;

const CHECK_BACKGROUND_TASK_PARAMETERS: JsonSchemaType = Object.freeze<JsonSchemaType>({
  type: 'object',
  properties: {
    background_task_id: {
      type: 'string',
      description:
        'The id returned when the tool call was dispatched. Omit to list the status of all background tasks in this conversation.',
    },
  },
  required: [],
});

const CHECK_BACKGROUND_TASK_DEF: LCTool = Object.freeze<LCTool>({
  name: CHECK_BACKGROUND_TASK_NAME,
  description: CHECK_BACKGROUND_TASK_DESCRIPTION,
  parameters: CHECK_BACKGROUND_TASK_PARAMETERS,
});

/**
 * Idempotently registers the `check_background_task` poll tool into the run's
 * tool definitions and registry. Mirrors `registerCodeExecutionTools`.
 */
export function registerBackgroundTaskTool(params: {
  toolRegistry: LCToolRegistry | undefined;
  toolDefinitions: LCTool[] | undefined;
}): { toolDefinitions: LCTool[] } {
  const { toolRegistry, toolDefinitions } = params;
  const defs = toolDefinitions ?? [];
  const isOurs = (tool?: { description?: string }): boolean =>
    tool?.description === CHECK_BACKGROUND_TASK_DESCRIPTION;

  const existingDef = defs.find((d) => d.name === CHECK_BACKGROUND_TASK_NAME);
  const existingRegistry = toolRegistry?.get(CHECK_BACKGROUND_TASK_NAME);

  /** Already registered by us — idempotent no-op. */
  if (isOurs(existingDef) || isOurs(existingRegistry)) {
    return { toolDefinitions: defs };
  }

  /**
   * The name is reserved: since the executor intercepts every
   * `check_background_task` call in a background-enabled run, a user/MCP tool
   * with the same name must not be advertised (its schema would mismatch the
   * interception). Overwrite so the model sees the poll schema the host honors,
   * and warn that the colliding tool is shadowed.
   */
  const collides = existingDef != null || existingRegistry != null;
  if (collides) {
    logger.warn(
      `[background] A tool named "${CHECK_BACKGROUND_TASK_NAME}" collides with the reserved background poll tool; the host poll tool takes precedence and the colliding tool is shadowed for this run.`,
    );
  }
  toolRegistry?.set(CHECK_BACKGROUND_TASK_NAME, {
    name: CHECK_BACKGROUND_TASK_NAME,
    description: CHECK_BACKGROUND_TASK_DESCRIPTION,
    parameters: CHECK_BACKGROUND_TASK_PARAMETERS,
    allowed_callers: ['direct'],
  });
  const withoutCollision = collides
    ? defs.filter((d) => d.name !== CHECK_BACKGROUND_TASK_NAME)
    : defs;
  return { toolDefinitions: [...withoutCollision, CHECK_BACKGROUND_TASK_DEF] };
}

/**
 * Injects the `run_in_background` param into every opted-in, eligible tool and
 * registers the poll tool when at least one tool became backgroundable.
 *
 * Opt-in is per tool via `tool_options[name].run_in_background`. Both saved
 * agents and ephemeral/model-spec agents reach this with `tool_options`
 * populated, so the logic is written once.
 */
export function applyBackgroundToolCalls(params: {
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  toolOptions: AgentToolOptions | undefined;
  /**
   * Extra host-context exclusion (e.g. tools of ephemeral request-scoped MCP
   * servers, whose connection dies at request end): a `true` return skips the
   * param injection entirely so the model is never shown an option the
   * executor would silently downgrade to foreground.
   */
  excludeTool?: (toolName: string) => boolean;
}): { toolDefinitions: LCTool[]; backgroundToolNames: string[] } {
  const { toolRegistry, excludeTool } = params;
  const toolOptions = expandCodeToolOptions(params.toolOptions);
  const defs = params.toolDefinitions ?? [];
  if (!toolOptions || !Object.values(toolOptions).some((o) => o?.run_in_background === true)) {
    return { toolDefinitions: defs, backgroundToolNames: [] };
  }

  const backgroundToolNames: string[] = [];
  const nextDefs = defs.map((def) => {
    const optedIn = toolOptions[def.name]?.run_in_background === true;
    if (!optedIn || !isBackgroundEligibleToolName(def.name) || excludeTool?.(def.name) === true) {
      return def;
    }
    if (!canInjectRunInBackgroundParam(def)) {
      logger.warn(
        `[background] Skipping run_in_background for "${def.name}": non-object schema or the tool already declares the parameter.`,
      );
      return def;
    }
    backgroundToolNames.push(def.name);
    const injected = injectRunInBackgroundParam(def);
    if (injected === def) {
      return def;
    }
    const registryEntry = toolRegistry?.get(def.name);
    if (registryEntry) {
      toolRegistry?.set(def.name, { ...registryEntry, parameters: injected.parameters });
    }
    return injected;
  });

  if (backgroundToolNames.length === 0) {
    return { toolDefinitions: defs, backgroundToolNames: [] };
  }

  const withPoll = registerBackgroundTaskTool({ toolRegistry, toolDefinitions: nextDefs });
  return { toolDefinitions: withPoll.toolDefinitions, backgroundToolNames };
}

/**
 * Builds `tool_options` marking each eligible tool as backgroundable. Ephemeral
 * and model-spec agents carry no `tool_options`, so the blanket spec/ephemeral
 * toggle is expanded per-tool here to reuse the same per-tool opt-in the saved
 * agent path uses. Returns undefined when disabled or nothing is eligible.
 *
 * Note: MCP servers that expand lazily (via the `mcp_all` placeholder for
 * overlay/user-connection servers) are not known by name at this point, so
 * their tools are not marked; standard cached MCP servers push real names and
 * are covered.
 */
export function synthesizeBackgroundToolOptions(
  tools: string[],
  sources: {
    ephemeralAgent?: { run_in_background?: boolean } | null;
    modelSpec?: { runInBackground?: boolean } | null;
  },
): AgentToolOptions | undefined {
  const enabled =
    sources.ephemeralAgent?.run_in_background === true ||
    sources.modelSpec?.runInBackground === true;
  if (!enabled) {
    return undefined;
  }
  const toolOptions: AgentToolOptions = {};
  for (const name of tools) {
    if (isBackgroundEligibleToolName(name)) {
      toolOptions[name] = { run_in_background: true };
    }
  }
  return Object.keys(toolOptions).length > 0 ? toolOptions : undefined;
}

export type BackgroundTaskStatus = 'running' | 'completed' | 'error';

export interface BackgroundTask {
  id: string;
  toolName: string;
  toolCallId: string;
  /** The dispatch turn's response messageId, for post-hoc result anchoring. */
  messageId?: string;
  /** The dispatching agent, disambiguating repeated provider tool-call ids
   *  (e.g. `call_0`) across agents when patching the dispatch turn. */
  agentId?: string;
  status: BackgroundTaskStatus;
  /** Tool result content once completed. */
  result?: string;
  /**
   * The completed tool's artifact, held until the poll turn collects it (a
   * backgrounded call's own turn is finalized before the artifact resolves, so
   * it can't ride that turn). Cleared once delivered to free memory.
   */
  artifact?: unknown;
  /**
   * Attachments persisted onto the dispatch turn's message by the
   * completion-time harvest (code tools). Retained until the task is swept so
   * every poll can re-emit them on its live stream (the client upserts by
   * `file_id`, so re-emission is idempotent) and re-anchor the row patch.
   */
  attachments?: unknown[];
  /**
   * True when a completion-time harvest was dispatched for this task (code
   * tools with a wired persister). Suppresses the poll turn's legacy
   * `toolEndCallback` delivery — the harvest already persisted the files with
   * the ORIGINAL tool-call identity.
   */
  harvestStarted?: boolean;
  /** True once the artifact has been handed to a live poll turn's callback. */
  artifactDelivered?: boolean;
  /** Error message when status === 'error'. */
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface TaskBucket {
  tasks: Map<string, BackgroundTask>;
  /** toolCallId -> taskId, for dispatch idempotency across graph re-execution. */
  byToolCall: Map<string, string>;
  lastAccess: number;
}

const COMPLETED_TASK_TTL_MS = 60 * 60 * 1000;
const IDLE_BUCKET_TTL_MS = 6 * 60 * 60 * 1000;
/** Max wall-clock a task may stay `running` before being reaped as timed-out,
 *  so a detached call that never settles (hung network / lost MCP connection)
 *  can't hold a running slot and exhaust the per-conversation cap forever. */
const RUNNING_TASK_TTL_MS = 30 * 60 * 1000;
const MAX_RUNNING_PER_BUCKET = 10;
const MAX_TASKS_PER_BUCKET = 200;
const MAX_RESULT_CHARS = 100_000;
const MAX_ARTIFACT_CHARS = 10_000_000;
const GLOBAL_SWEEP_INTERVAL_MS = 60 * 1000;

let lastDispatchStamp = 0;
/**
 * Strictly-increasing dispatch stamp. `createdAt` orders writers in the
 * stale-output guard (`sourceDispatchedAt`), which accepts equal stamps so
 * idempotent re-commits of the SAME task pass — two same-millisecond
 * dispatches would tie on raw `Date.now()` and let the older task overwrite
 * the newer one's committed file. Process-local, like the registry itself.
 */
function nextDispatchStamp(now: number): number {
  lastDispatchStamp = lastDispatchStamp < now ? now : lastDispatchStamp + 1;
  return lastDispatchStamp;
}

function toStoredContent(content: unknown): string {
  const asString = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return truncateMiddle(asString, MAX_RESULT_CHARS);
}

/**
 * Bounds retained artifact memory: an artifact is held for up to the completed
 * TTL, so a runaway payload (huge base64 blobs) is dropped rather than pinned.
 * Measurement failures (circular refs) keep the artifact.
 */
function toStoredArtifact(taskId: string, artifact: unknown): unknown {
  if (artifact == null) {
    return undefined;
  }
  try {
    const size = JSON.stringify(artifact)?.length ?? 0;
    if (size > MAX_ARTIFACT_CHARS) {
      logger.warn(
        `[background] Dropping oversized artifact for task ${taskId} (${size} chars > ${MAX_ARTIFACT_CHARS}).`,
      );
      return undefined;
    }
  } catch {
    /* unmeasurable artifact: keep it */
  }
  return artifact;
}

/**
 * In-process store of background tool tasks, scoped per user + conversation.
 *
 * MVP scope: single Node process. A task's result survives across turns within
 * the same server process (a floating promise keeps running on the event loop),
 * but is lost on restart and is not shared across Redis replicas — a run resumed
 * on another replica cannot see it. A Redis-backed store would slot in behind
 * this same interface as a follow-up.
 */
export class BackgroundTaskRegistryClass {
  private readonly buckets = new Map<string, TaskBucket>();
  private lastGlobalSweepAt = 0;

  private key(userId: string, conversationId: string): string {
    return `${userId}::${conversationId}`;
  }

  private sweepBucketTasks(bucket: TaskBucket, now: number): void {
    for (const [taskId, task] of bucket.tasks) {
      if (task.status === 'running' && now - task.createdAt > RUNNING_TASK_TTL_MS) {
        /** Reap a stuck task: freeing the running slot (it no longer counts
         *  toward the cap) and letting the completed-task TTL evict it. */
        task.status = 'error';
        task.error = 'Background task timed out';
        task.updatedAt = now;
        continue;
      }
      if (task.status !== 'running' && now - task.updatedAt > COMPLETED_TASK_TTL_MS) {
        bucket.tasks.delete(taskId);
      }
    }
    /** Drop dedupe mappings whose task was evicted (keys are
     *  `agentId::runId::toolCallId`, so they can't be derived from a task alone). */
    for (const [dedupeKey, taskId] of bucket.byToolCall) {
      if (!bucket.tasks.has(taskId)) {
        bucket.byToolCall.delete(dedupeKey);
      }
    }
  }

  /**
   * Accessors always sweep the bucket they touch (so TTLs hold exactly for the
   * data being read), while the all-buckets pass — needed only for idle-bucket
   * eviction and untouched buckets — is throttled so a hot poll loop isn't
   * O(total tasks server-wide) on every call.
   */
  private sweep(now: number): void {
    if (now - this.lastGlobalSweepAt < GLOBAL_SWEEP_INTERVAL_MS) {
      return;
    }
    this.lastGlobalSweepAt = now;
    for (const [bucketKey, bucket] of this.buckets) {
      if (now - bucket.lastAccess > IDLE_BUCKET_TTL_MS) {
        this.buckets.delete(bucketKey);
        continue;
      }
      this.sweepBucketTasks(bucket, now);
    }
  }

  private getBucket(userId: string, conversationId: string, now: number): TaskBucket {
    const bucketKey = this.key(userId, conversationId);
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tasks: new Map(), byToolCall: new Map(), lastAccess: now };
      this.buckets.set(bucketKey, bucket);
    }
    bucket.lastAccess = now;
    return bucket;
  }

  /**
   * Registers a task for a tool call. Returns the existing task (and
   * `isNew: false`) only when the SAME run re-dispatched the same `toolCallId`
   * (a resume/replay) — the caller must not start the work twice. Returns
   * `atCapacity: true` when the per-conversation running cap is reached.
   *
   * The dedupe key includes `agentId` + `runId` because provider tool-call ids
   * repeat across turns AND across agents in one run (e.g. `call_0` per
   * response); keying on `toolCallId` alone would make a later turn's — or a
   * second agent's — identically-named call collide with a prior (retained)
   * task and hand back a stale/foreign result instead of executing.
   */
  create(params: {
    userId: string;
    conversationId: string;
    toolCallId: string;
    toolName: string;
    messageId?: string;
    runId?: string;
    agentId?: string;
    /** Set at dispatch when a settle-time harvest WILL run, so tasks that
     *  never settle (reaped as timed out) still take the marker/heal path
     *  instead of leaving the original card on "running" forever. */
    harvestStarted?: boolean;
  }): { task: BackgroundTask; isNew: boolean } | { atCapacity: true } {
    const now = Date.now();
    this.sweep(now);
    const bucket = this.getBucket(params.userId, params.conversationId, now);
    this.sweepBucketTasks(bucket, now);

    const dedupeKey = `${params.agentId ?? ''}::${params.runId ?? ''}::${params.toolCallId}`;
    const existingId = bucket.byToolCall.get(dedupeKey);
    if (existingId) {
      const existing = bucket.tasks.get(existingId);
      if (existing) {
        return { task: existing, isNew: false };
      }
    }

    let running = 0;
    for (const task of bucket.tasks.values()) {
      if (task.status === 'running') {
        running++;
      }
    }
    /** Only *running* tasks gate dispatch. */
    if (running >= MAX_RUNNING_PER_BUCKET) {
      return { atCapacity: true };
    }
    /** The total-tasks cap bounds memory but must NOT block new work: evict the
     *  oldest SETTLED tasks to make room rather than rejecting (settled tasks
     *  aren't removed by polling, so 200 quick calls would otherwise block for
     *  up to the completed-TTL). Running is already capped, so room always frees. */
    if (bucket.tasks.size >= MAX_TASKS_PER_BUCKET) {
      const settledOldestFirst = [...bucket.tasks.values()]
        .filter((t) => t.status !== 'running')
        .sort((a, b) => a.createdAt - b.createdAt);
      let toEvict = bucket.tasks.size - MAX_TASKS_PER_BUCKET + 1;
      for (const stale of settledOldestFirst) {
        if (toEvict <= 0) {
          break;
        }
        bucket.tasks.delete(stale.id);
        toEvict--;
      }
    }

    const task: BackgroundTask = {
      id: randomUUID(),
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      messageId: params.messageId,
      agentId: params.agentId,
      ...(params.harvestStarted === true ? { harvestStarted: true } : {}),
      status: 'running',
      createdAt: nextDispatchStamp(now),
      updatedAt: now,
    };
    bucket.tasks.set(task.id, task);
    bucket.byToolCall.set(dedupeKey, task.id);
    return { task, isNew: true };
  }

  private update(
    userId: string,
    conversationId: string,
    taskId: string,
    patch: Partial<BackgroundTask>,
  ): void {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (!task) {
      return;
    }
    Object.assign(task, patch, { updatedAt: Date.now() });
  }

  complete(
    userId: string,
    conversationId: string,
    taskId: string,
    result: { content: unknown; artifact?: unknown; harvestStarted?: boolean },
  ): void {
    this.update(userId, conversationId, taskId, {
      status: 'completed',
      result: toStoredContent(result.content),
      artifact: toStoredArtifact(taskId, result.artifact),
      ...(result.harvestStarted === true ? { harvestStarted: true } : {}),
      /** Marks that an artifact existed even after `claimArtifact` clears it,
       *  so re-polls keep the "produced an artifact" note. */
      artifactDelivered: false,
    });
  }

  /**
   * Records the attachments a (possibly still in-flight when polled)
   * completion-time harvest persisted for a settled task. Arrives after
   * `complete()` because the harvest must not gate task completion — the
   * dispatch turn's message row may not exist until that turn finalizes.
   */
  attachHarvest(
    userId: string,
    conversationId: string,
    taskId: string,
    attachments: unknown[],
  ): void {
    if (attachments.length === 0) {
      return;
    }
    this.update(userId, conversationId, taskId, { attachments });
  }

  /**
   * Returns a completed task's artifact exactly once, marking it delivered and
   * clearing it. The poll turn routes it to a live `toolEndCallback` so the
   * artifact isn't lost with the finalized dispatch turn. If handing it to the
   * callback throws synchronously, `restoreArtifact` puts it back so a later
   * poll can retry. Note the callback's own persistence is fire-and-forget
   * (failures are swallowed downstream), so delivery is at-most-once — the
   * same semantics a foreground tool's artifact has.
   */
  claimArtifact(
    userId: string,
    conversationId: string,
    taskId: string,
  ):
    | {
        toolName: string;
        toolCallId: string;
        messageId?: string;
        harvestStarted?: boolean;
        artifact: unknown;
        content?: string;
      }
    | undefined {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (!task || task.status !== 'completed' || task.artifact == null || task.artifactDelivered) {
      return undefined;
    }
    const artifact = task.artifact;
    task.artifactDelivered = true;
    task.artifact = undefined;
    return {
      toolName: task.toolName,
      toolCallId: task.toolCallId,
      messageId: task.messageId,
      harvestStarted: task.harvestStarted,
      artifact,
      content: task.result,
    };
  }

  /**
   * Puts a claimed artifact back after a synchronous delivery failure so the
   * next poll retries it. No-op if the task was swept or already holds an
   * artifact.
   */
  restoreArtifact(userId: string, conversationId: string, taskId: string, artifact: unknown): void {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (!task || task.artifact != null) {
      return;
    }
    /** Same size bound as `complete()` — a restore path must not resurrect
     *  an artifact the memory cap already discarded. */
    task.artifact = toStoredArtifact(taskId, artifact);
    task.artifactDelivered = false;
  }

  fail(
    userId: string,
    conversationId: string,
    taskId: string,
    error: string,
    options?: { harvestStarted?: boolean },
  ): void {
    this.update(userId, conversationId, taskId, {
      status: 'error',
      error,
      ...(options?.harvestStarted === true ? { harvestStarted: true } : {}),
    });
  }

  /**
   * Reverses `harvestStarted` after the detached harvest failed to persist
   * anything, restoring the artifact if a poll already claimed it, so the
   * legacy poll-turn `toolEndCallback` delivery takes over on a later poll
   * instead of the files being silently lost.
   */
  revokeHarvest(userId: string, conversationId: string, taskId: string, artifact?: unknown): void {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (!task) {
      return;
    }
    task.harvestStarted = undefined;
    if (task.artifact == null && artifact != null) {
      task.artifact = artifact;
      task.artifactDelivered = false;
    }
    task.updatedAt = Date.now();
  }

  get(userId: string, conversationId: string, taskId: string): BackgroundTask | undefined {
    const now = Date.now();
    /** Sweep before returning so repeated polling of a known id can't keep an
     *  expired task (and its retained result) alive past the completed TTL. */
    this.sweep(now);
    const bucket = this.buckets.get(this.key(userId, conversationId));
    if (!bucket) {
      return undefined;
    }
    bucket.lastAccess = now;
    this.sweepBucketTasks(bucket, now);
    return bucket.tasks.get(taskId);
  }

  list(userId: string, conversationId: string): BackgroundTask[] {
    const now = Date.now();
    this.sweep(now);
    const bucket = this.buckets.get(this.key(userId, conversationId));
    if (!bucket) {
      return [];
    }
    bucket.lastAccess = now;
    this.sweepBucketTasks(bucket, now);
    return [...bucket.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
}

export const backgroundTaskRegistry = new BackgroundTaskRegistryClass();

/** Content for the synthetic ToolMessage returned when a call is backgrounded. */
export function buildBackgroundHandleContent(task: BackgroundTask): string {
  return JSON.stringify({
    background_task_id: task.id,
    tool: task.toolName,
    status: task.status,
    message: `Started "${task.toolName}" in the background. Call ${CHECK_BACKGROUND_TASK_NAME} with background_task_id "${task.id}" to check progress and retrieve the result; it persists on this server, so you may poll it later in this turn or in a following turn. Do not assume it has finished until you have polled and seen status "completed".`,
  });
}

/** Content returned when the per-conversation background running cap is hit. */
export function buildBackgroundCapacityContent(toolName: string): string {
  return JSON.stringify({
    status: 'rejected',
    tool: toolName,
    message: `Too many background tasks are already running in this conversation (limit ${MAX_RUNNING_PER_BUCKET}). Poll ${CHECK_BACKGROUND_TASK_NAME} to collect finished results before dispatching more, or run this call in the foreground.`,
  });
}

/**
 * Serializes a task for the poll tool. The list path (`includeResult: false`)
 * returns metadata only — never the full `result` — so a status-list poll can't
 * inject megabytes of retained tool output into the next model step. The full
 * result is only returned when a specific `background_task_id` is requested.
 */
interface SerializedBackgroundTask {
  background_task_id: string;
  tool: string;
  status: BackgroundTaskStatus;
  /** Coarse 0..1: no intermediate progress exists, only running vs settled. */
  progress: number;
  result?: string;
  result_available?: boolean;
  result_chars?: number;
  note?: string;
  error?: string;
}

function resultFields(
  task: BackgroundTask,
  includeResult: boolean,
): Pick<SerializedBackgroundTask, 'result' | 'result_available' | 'result_chars'> {
  if (task.result === undefined) {
    return {};
  }
  if (includeResult) {
    return { result: task.result };
  }
  return { result_available: true, result_chars: task.result.length };
}

function taskNote(task: BackgroundTask): Pick<SerializedBackgroundTask, 'note'> {
  if (task.attachments != null && task.attachments.length > 0) {
    return {
      note: 'Generated files were saved and attached to the tool call that dispatched this task.',
    };
  }
  if (task.harvestStarted === true && task.status === 'completed') {
    return {
      note: 'Output and any generated files are being attached to the tool call that dispatched this task.',
    };
  }
  if (task.artifact != null || task.artifactDelivered === true) {
    return { note: 'The tool produced an artifact that is not included inline.' };
  }
  return {};
}

function serializeTask(
  task: BackgroundTask,
  { includeResult }: { includeResult: boolean },
): SerializedBackgroundTask {
  return {
    background_task_id: task.id,
    tool: task.toolName,
    status: task.status,
    progress: task.status === 'running' ? 0 : 1,
    ...resultFields(task, includeResult),
    ...taskNote(task),
    ...(task.error !== undefined ? { error: task.error } : {}),
  };
}

/** Executes a `check_background_task` call and returns the ToolMessage content. */
export function runCheckBackgroundTask(params: {
  userId: string;
  conversationId: string;
  args: unknown;
}): string {
  const { userId, conversationId } = params;
  const rawId = coerceArgsObject(params.args)?.background_task_id;
  const taskId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined;

  if (taskId) {
    const task = backgroundTaskRegistry.get(userId, conversationId, taskId);
    if (!task) {
      return JSON.stringify({
        status: 'not_found',
        background_task_id: taskId,
        message: 'No background task with that id exists in this conversation.',
      });
    }
    return JSON.stringify(serializeTask(task, { includeResult: true }));
  }

  const tasks = backgroundTaskRegistry.list(userId, conversationId);
  logger.debug(`[background] check_background_task listed ${tasks.length} task(s)`);
  return JSON.stringify({
    tasks: tasks.map((task) => serializeTask(task, { includeResult: false })),
  });
}

/**
 * When a `check_background_task` call targets a specific completed task that
 * produced an artifact, returns that artifact once (marking it delivered) so the
 * poll turn's live callback can persist it. Returns undefined for the list form,
 * an unknown id, or an already-delivered/artifact-less task.
 */
export function claimBackgroundArtifact(params: {
  userId: string;
  conversationId: string;
  args: unknown;
  /** Evaluated before claiming; a `false` return leaves the artifact held. */
  shouldClaim?: (task: BackgroundTask) => boolean;
}):
  | {
      taskId: string;
      toolName: string;
      toolCallId: string;
      messageId?: string;
      harvestStarted?: boolean;
      artifact: unknown;
      content?: string;
    }
  | undefined {
  const rawId = coerceArgsObject(params.args)?.background_task_id;
  const taskId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined;
  if (!taskId) {
    return undefined;
  }
  if (params.shouldClaim) {
    const task = backgroundTaskRegistry.get(params.userId, params.conversationId, taskId);
    if (!task || !params.shouldClaim(task)) {
      return undefined;
    }
  }
  const claimed = backgroundTaskRegistry.claimArtifact(
    params.userId,
    params.conversationId,
    taskId,
  );
  return claimed ? { taskId, ...claimed } : undefined;
}

/**
 * Read-only view of a settled code task's harvest state for the poll turn:
 * attachments to re-emit on the live stream and the identity needed to
 * re-anchor the row patch (a HITL-pause/resume full-row save can revert it;
 * re-application is idempotent). Independent of the one-shot artifact claim so
 * late-landing harvests still deliver on subsequent polls.
 */
export function getBackgroundCodeDelivery(params: {
  userId: string;
  conversationId: string;
  args: unknown;
}):
  | {
      taskId: string;
      status: BackgroundTaskStatus;
      toolName: string;
      toolCallId: string;
      messageId?: string;
      agentId?: string;
      harvestStarted?: boolean;
      result?: string;
      error?: string;
      attachments?: unknown[];
    }
  | undefined {
  const rawId = coerceArgsObject(params.args)?.background_task_id;
  const taskId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined;
  if (!taskId) {
    return undefined;
  }
  const task = backgroundTaskRegistry.get(params.userId, params.conversationId, taskId);
  if (!task || task.harvestStarted !== true) {
    return undefined;
  }
  return {
    taskId,
    status: task.status,
    toolName: task.toolName,
    toolCallId: task.toolCallId,
    messageId: task.messageId,
    agentId: task.agentId,
    harvestStarted: task.harvestStarted,
    result: task.result,
    error: task.error,
    attachments: task.attachments,
  };
}

/** Reverses a `claimBackgroundArtifact` after a failed delivery (see `restoreArtifact`). */
export function restoreBackgroundArtifact(params: {
  userId: string;
  conversationId: string;
  taskId: string;
  artifact: unknown;
}): void {
  backgroundTaskRegistry.restoreArtifact(
    params.userId,
    params.conversationId,
    params.taskId,
    params.artifact,
  );
}
