/**
 * @fileoverview Background tool calls.
 *
 * Lets the model dispatch an eligible (event-driven) tool call detached: the
 * host executor returns a synthetic handle immediately so the graph superstep
 * resolves, while the real work runs as a floating promise whose result lands
 * in an in-process registry. The model retrieves it later with the
 * `check_background_task` poll tool. No `@librechat/agents` change is required —
 * a backgrounded call and the poll call are both synchronous from the graph's
 * view.
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
import { Tools, Constants } from 'librechat-data-provider';
import { Constants as AgentConstants } from '@librechat/agents';
import type { LCTool, LCToolRegistry } from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import { SET_MEMORY_TOOL_NAME, DELETE_MEMORY_TOOL_NAME } from './memory';
import { ASK_USER_QUESTION_TOOL_NAME } from './hitl/askUserQuestionTool';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from './tools';

/** Argument the model sets on a tool call to dispatch it in the background. */
export const RUN_IN_BACKGROUND_ARG = 'run_in_background';

/** Poll tool name (LibreChat host-special-cased, not an SDK tool). */
export const CHECK_BACKGROUND_TASK_NAME: string = Constants.CHECK_BACKGROUND_TASK;

/**
 * Tools that must never be backgrounded — they either run through the SDK's
 * direct/host-special path (so the host `ON_TOOL_EXECUTE` interception never
 * sees them), depend on synchronous artifact/code-session continuity, or are
 * the background machinery itself.
 */
const EXCLUDED_BACKGROUND_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  AgentConstants.EXECUTE_CODE,
  AgentConstants.BASH_TOOL,
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
   * already-saved turn — so they're excluded rather than degraded.
   */
  Tools.web_search,
  Tools.file_search,
  'dalle',
  'flux',
  'gemini_image_gen',
  'image_gen_oai',
  'image_edit_oai',
]);

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

const RUN_IN_BACKGROUND_PROPERTY = Object.freeze({
  type: 'boolean',
  description:
    'Set true to run this tool call in the background: it returns immediately with a background_task_id instead of blocking. Poll check_background_task with that id to get progress and the final result. Use only for genuinely long-running calls when you have other useful work to do meanwhile.',
});

interface JsonSchemaObject {
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Returns a copy of the tool definition with a `run_in_background` boolean
 * added to its parameters. Never mutates the input (built-in defs are frozen
 * and MCP defs may be shared), and is a no-op if the property already exists.
 */
export function injectRunInBackgroundParam(def: LCTool): LCTool {
  const params = def.parameters as JsonSchemaObject | undefined;
  const existingProps = params?.properties ?? {};
  if (RUN_IN_BACKGROUND_ARG in existingProps) {
    return def;
  }
  const nextParams: JsonSchemaObject = {
    ...(params ?? {}),
    type: 'object',
    properties: { ...existingProps, [RUN_IN_BACKGROUND_ARG]: RUN_IN_BACKGROUND_PROPERTY },
  };
  return { ...def, parameters: nextParams as unknown as LCTool['parameters'] };
}

/**
 * Whether the `run_in_background` param can be cleanly injected into a tool.
 * False for non-object (e.g. string-input/DynamicTool) schemas — rewriting them
 * to an object would break the tool's input contract — and for tools that
 * already declare their own `run_in_background` parameter (which the executor
 * would otherwise hijack/strip).
 */
function canInjectRunInBackgroundParam(def: LCTool): boolean {
  const params = def.parameters as JsonSchemaObject | undefined;
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
  const params = def.parameters as JsonSchemaObject | undefined;
  if (params?.properties == null || !(RUN_IN_BACKGROUND_ARG in params.properties)) {
    return def;
  }
  const { [RUN_IN_BACKGROUND_ARG]: _omit, ...restProps } = params.properties;
  return {
    ...def,
    parameters: { ...params, properties: restProps } as unknown as LCTool['parameters'],
  };
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
  const hasPoll = defs.some((d) => d.name === CHECK_BACKGROUND_TASK_NAME);
  if (bgSet.size === 0 && !hasPoll) {
    return defs;
  }
  return defs
    .filter((d) => d.name !== CHECK_BACKGROUND_TASK_NAME)
    .map((d) => (bgSet.has(d.name) ? removeRunInBackgroundParam(d) : d));
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

Provide a background_task_id to poll one task; omit it to list every background task in this conversation. A task is only finished when its status is "completed" or "error" — never assume completion without polling. Results are not pushed to you; you must call this tool to collect them.`;

const CHECK_BACKGROUND_TASK_PARAMETERS: LCTool['parameters'] = Object.freeze({
  type: 'object',
  properties: {
    background_task_id: {
      type: 'string',
      description:
        'The id returned when the tool call was dispatched. Omit to list the status of all background tasks in this conversation.',
    },
  },
  required: [],
}) as unknown as LCTool['parameters'];

const CHECK_BACKGROUND_TASK_DEF: LCTool = Object.freeze({
  name: CHECK_BACKGROUND_TASK_NAME,
  description: CHECK_BACKGROUND_TASK_DESCRIPTION,
  parameters: CHECK_BACKGROUND_TASK_PARAMETERS,
}) as LCTool;

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
  enabled: boolean;
}): { toolDefinitions: LCTool[]; enabled: boolean; backgroundToolNames: string[] } {
  const { toolRegistry, toolOptions } = params;
  const defs = params.toolDefinitions ?? [];
  if (!params.enabled || !toolOptions) {
    return { toolDefinitions: defs, enabled: false, backgroundToolNames: [] };
  }

  const backgroundToolNames: string[] = [];
  const nextDefs = defs.map((def) => {
    const optedIn = toolOptions[def.name]?.run_in_background === true;
    if (!optedIn || !isBackgroundEligibleToolName(def.name)) {
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
    return { toolDefinitions: defs, enabled: false, backgroundToolNames: [] };
  }

  const withPoll = registerBackgroundTaskTool({ toolRegistry, toolDefinitions: nextDefs });
  return { toolDefinitions: withPoll.toolDefinitions, enabled: true, backgroundToolNames };
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
  enabled: boolean,
): AgentToolOptions | undefined {
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
  status: BackgroundTaskStatus;
  /** Coarse progress 0..1 (best-effort): 0 while running, 1 when settled. */
  progress: number;
  /** Tool result content once completed. */
  result?: string;
  /** True when the completed tool produced an artifact (not returned inline). */
  hasArtifact?: boolean;
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

function toStoredContent(content: unknown): string {
  const asString = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  return asString.length > MAX_RESULT_CHARS ? asString.slice(0, MAX_RESULT_CHARS) : asString;
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

  private key(userId: string, conversationId: string): string {
    return `${userId}::${conversationId}`;
  }

  private sweep(now: number): void {
    for (const [bucketKey, bucket] of this.buckets) {
      if (now - bucket.lastAccess > IDLE_BUCKET_TTL_MS) {
        this.buckets.delete(bucketKey);
        continue;
      }
      for (const [taskId, task] of bucket.tasks) {
        if (task.status === 'running' && now - task.createdAt > RUNNING_TASK_TTL_MS) {
          /** Reap a stuck task: freeing the running slot (it no longer counts
           *  toward the cap) and letting the completed-task TTL evict it. */
          task.status = 'error';
          task.progress = 1;
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
    runId?: string;
    agentId?: string;
  }): { task: BackgroundTask; isNew: boolean } | { atCapacity: true } {
    const now = Date.now();
    this.sweep(now);
    const bucket = this.getBucket(params.userId, params.conversationId, now);

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
    if (running >= MAX_RUNNING_PER_BUCKET || bucket.tasks.size >= MAX_TASKS_PER_BUCKET) {
      return { atCapacity: true };
    }

    const task: BackgroundTask = {
      id: randomUUID(),
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      status: 'running',
      progress: 0,
      createdAt: now,
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
    result: { content: unknown; hasArtifact?: boolean },
  ): void {
    this.update(userId, conversationId, taskId, {
      status: 'completed',
      progress: 1,
      result: toStoredContent(result.content),
      hasArtifact: result.hasArtifact === true,
    });
  }

  fail(userId: string, conversationId: string, taskId: string, error: string): void {
    this.update(userId, conversationId, taskId, { status: 'error', progress: 1, error });
  }

  get(userId: string, conversationId: string, taskId: string): BackgroundTask | undefined {
    const now = Date.now();
    /** Sweep before returning so repeated polling of a known id can't keep an
     *  expired task (and its retained result) alive past the completed TTL. */
    this.sweep(now);
    const bucket = this.buckets.get(this.key(userId, conversationId));
    if (bucket) {
      bucket.lastAccess = now;
    }
    return bucket?.tasks.get(taskId);
  }

  list(userId: string, conversationId: string): BackgroundTask[] {
    const now = Date.now();
    this.sweep(now);
    const bucket = this.buckets.get(this.key(userId, conversationId));
    if (!bucket) {
      return [];
    }
    bucket.lastAccess = now;
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
    message: `Started "${task.toolName}" in the background. Call ${CHECK_BACKGROUND_TASK_NAME} with background_task_id "${task.id}" to check progress and retrieve the result. Do not assume it has finished until you have polled and seen status "completed".`,
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
function resultFields(task: BackgroundTask, includeResult: boolean): Record<string, unknown> {
  if (task.result === undefined) {
    return {};
  }
  if (includeResult) {
    return { result: task.result };
  }
  return { result_available: true, result_chars: task.result.length };
}

function serializeTask(
  task: BackgroundTask,
  { includeResult }: { includeResult: boolean },
): Record<string, unknown> {
  return {
    background_task_id: task.id,
    tool: task.toolName,
    status: task.status,
    progress: task.progress,
    ...resultFields(task, includeResult),
    ...(task.hasArtifact
      ? { note: 'The tool produced an artifact that is not included inline.' }
      : {}),
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
