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
 * Scope: execution remains owned by one Node process, independently of the
 * dispatch turn's abort signal. The host gives the detached invoke a separate
 * deadline signal and accepts a timeout only after the invoke settles; an
 * abort-resistant tool remains indeterminate and pollable. Terminal results
 * can also be persisted onto the invoking response so another run or replica
 * can consume them, but process death during execution does not recreate the
 * live tool. Ephemeral request-scoped MCP tools (runtime `{{LIBRECHAT_BODY_*}}`
 * placeholders) are never backgrounded — their connection is torn down at
 * request end, so the executor runs them in the foreground instead. Detached
 * subagents use the separate host task store; Redis-backed hosts may route
 * their poll/control operations to the owning process without moving the live
 * executor or making ordinary background tool results durable.
 *
 * Opt-in mirrors `deferred_tools`: an admin capability
 * (`AgentCapabilities.run_in_background`) gates the feature, and a per-tool
 * `tool_options[name].run_in_background` flag turns it on for a given tool,
 * which injects a `run_in_background` boolean into that tool's schema. The
 * code-execution pair (`execute_code`/`bash_tool`) is background-NATIVE:
 * while the capability is enabled it defaults on without a per-tool flag, and
 * an explicit `run_in_background: false` opts it out.
 *
 * @module packages/api/src/agents/background
 */

import { logger } from '@librechat/data-schemas';
import { createHash, randomUUID } from 'node:crypto';
import { Constants as AgentConstants } from '@librechat/agents';
import { Tools, Constants, imageGenTools } from 'librechat-data-provider';
import type {
  LCTool,
  LCToolRegistry,
  JsonSchemaType,
  SubagentTaskClaim,
  SubagentTaskConfig,
  SubagentTaskSnapshot,
  SubagentTaskControlCommand,
  SubagentTaskControlResult,
  SubagentTaskStore,
} from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import type { CapabilityToolNames } from './selection';
import {
  BACKGROUND_TASK_TIMEOUT_MS,
  type BackgroundToolDeadClaimRecovery,
  type BackgroundToolWakeupAdmission,
} from './backgroundCompletion';
import {
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  SEARCH_WORKSPACE_TOOL_NAME,
  LIST_WORKSPACE_FILES_TOOL_NAME,
} from './tools';
import {
  resolveToolOption,
  getSelectionNames,
  warnUnmatchedSelectionNames,
  synthesizeSelectionToolOptions,
} from './selection';
import { SUBAGENT_WAKEUP_GUIDANCE, agentUsesSubagentCompletionWakeups } from './subagentDelivery';
import { SubagentTaskOwnerUnavailableError } from './subagentTaskRouting';
import { SET_MEMORY_TOOL_NAME, DELETE_MEMORY_TOOL_NAME } from './memory';
import { ASK_USER_QUESTION_TOOL_NAME } from './hitl/askUserQuestionTool';
import { normalizeActionToolName } from '~/actions/tools';
import { truncateMiddle } from '~/utils';

/** Argument the model sets on a tool call to dispatch it in the background. */
export const RUN_IN_BACKGROUND_ARG = 'run_in_background';

/** Log prefix for selection diagnostics, phrased in the spec's own field name. */
const BACKGROUND_SELECTION_LABEL = '[background] runInBackground';
const MAX_BACKGROUND_TASK_ID_CHARS = 256;
const MAX_BACKGROUND_CONTROL_ID_CHARS = 256;
const MAX_BACKGROUND_CONTROL_MESSAGE_CHARS = 64 * 1024;

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
  SEARCH_WORKSPACE_TOOL_NAME,
  LIST_WORKSPACE_FILES_TOOL_NAME,
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
  'video_gen_sora_azure',
]);

/**
 * Agents persist action tool names with the raw encoded domain (`---` for short
 * hostnames), while the runtime definitions those names must match against are
 * always `_`-collapsed. The builder writes `tool_options` keyed by the persisted
 * name, so alias every action-shaped key to its normalized form; without this
 * the opt-in silently never resolves for short-hostname actions. Merge the raw
 * background option into any normalized entry while keeping an explicit
 * normalized background value authoritative.
 */
function expandActionToolOptions(toolOptions: AgentToolOptions): AgentToolOptions {
  let expanded: AgentToolOptions | undefined;
  for (const [name, options] of Object.entries(toolOptions)) {
    const normalized = normalizeActionToolName(name);
    const runInBackground = options?.run_in_background;
    if (
      normalized === name ||
      runInBackground == null ||
      toolOptions[normalized]?.run_in_background != null
    ) {
      continue;
    }
    expanded = expanded ?? { ...toolOptions };
    expanded[normalized] = {
      ...toolOptions[normalized],
      run_in_background: runInBackground,
    };
  }
  return expanded ?? toolOptions;
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
 * Tools that are background-NATIVE: they default INTO background dispatch
 * while the capability is enabled, and an explicit `run_in_background: false`
 * opts one out. Code executions are the paradigmatic slow, detachable call —
 * they flow through the generic execute path and their completion is
 * harvested onto the dispatch turn — so they carry the param without
 * per-agent opt-in, the same way the SDK's coding tools carry `intent`
 * natively. Mirrors `NATIVE_INTENT_TOOL_NAMES` in `intent.ts`.
 */
export const NATIVE_BACKGROUND_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  String(AgentConstants.EXECUTE_CODE),
  String(AgentConstants.BASH_TOOL),
]);

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

const CHECK_BACKGROUND_TASK_DESCRIPTION = `Check, control, and retrieve tool or subagent tasks previously dispatched in the background (with run_in_background: true).

Provide a background_task_id to poll one task; omit it to list every background task in this thread. A task is only finished when its status is "completed", "error", or "cancelled" — never assume completion without polling. Results are not pushed to you; you must call this tool to collect them. Subagent tasks additionally accept steer, queue, interrupt, cancel, and cancel_message actions while running. Live subagent controls route across API replicas but do not survive a restart of the process that owns the executor. A completed subagent thread may be continued later through the subagent tool's durable thread id.`;

const CHECK_BACKGROUND_TASK_WAKEUP_DESCRIPTION = `Check, control, and retrieve tool or subagent tasks previously dispatched in the background (with run_in_background: true).

Provide a background_task_id to inspect one task; omit it to list every background task in this thread. Background tools and detached subagents use automatic completion delivery: continue independent work or end the turn instead of repeatedly polling an unchanged running task, and the host will resume you when one finishes. Use this tool for explicit status, steer, queue, interrupt, cancel, or cancel_message actions, or as a fallback if automatic delivery is unavailable. Ordinary tool execution remains process-local and does not survive restart; once its result is persisted, completion delivery may continue on another replica. Live subagent controls route across API replicas but do not survive a restart of the process that owns the executor. A completed subagent thread may be continued later through the subagent tool's durable thread id.`;

function checkBackgroundTaskDescription(subagentCompletionWakeups: boolean): string {
  return subagentCompletionWakeups
    ? CHECK_BACKGROUND_TASK_WAKEUP_DESCRIPTION
    : CHECK_BACKGROUND_TASK_DESCRIPTION;
}

/**
 * `maxLength` is valid JSON Schema and is honored by providers, but the SDK's
 * `JsonSchemaType` does not declare it, so the model-facing bounds are typed here.
 * Runtime argument validation enforces the same limits as defense in depth.
 */
interface BoundedStringSchema {
  type: 'string';
  maxLength: number;
  description: string;
}

interface CheckBackgroundTaskParameters {
  type: 'object';
  properties: {
    background_task_id: BoundedStringSchema;
    action: { type: 'string'; enum: string[]; description: string };
    message: BoundedStringSchema;
    control_id: BoundedStringSchema;
  };
  required: string[];
}

const CHECK_BACKGROUND_TASK_PARAMETERS = Object.freeze<CheckBackgroundTaskParameters>({
  type: 'object',
  properties: {
    background_task_id: {
      type: 'string',
      maxLength: MAX_BACKGROUND_TASK_ID_CHARS,
      description:
        'The id returned when the tool or subagent was dispatched. Omit to list all background tasks in this thread.',
    },
    action: {
      type: 'string',
      enum: ['poll', 'steer', 'queue', 'interrupt', 'cancel', 'cancel_message'],
      description: 'Defaults to poll. Control actions apply only to a running subagent task.',
    },
    message: {
      type: 'string',
      maxLength: MAX_BACKGROUND_CONTROL_MESSAGE_CHARS,
      description: 'Required for steer, queue, or interrupt.',
    },
    control_id: {
      type: 'string',
      maxLength: MAX_BACKGROUND_CONTROL_ID_CHARS,
      description: 'Required for cancel_message; use the id returned by a prior control action.',
    },
  },
  required: [],
});

function buildCheckBackgroundTaskDefinition(subagentCompletionWakeups: boolean): LCTool {
  return {
    name: CHECK_BACKGROUND_TASK_NAME,
    description: checkBackgroundTaskDescription(subagentCompletionWakeups),
    parameters: CHECK_BACKGROUND_TASK_PARAMETERS,
  };
}

/**
 * Idempotently registers the `check_background_task` poll tool into the run's
 * tool definitions and registry. Mirrors `registerCodeExecutionTools`.
 */
export function registerBackgroundTaskTool(params: {
  toolRegistry: LCToolRegistry | undefined;
  toolDefinitions: LCTool[] | undefined;
  subagentCompletionWakeups?: boolean;
}): { toolDefinitions: LCTool[] } {
  const { toolRegistry, toolDefinitions, subagentCompletionWakeups = false } = params;
  const defs = toolDefinitions ?? [];
  const desiredDescription = checkBackgroundTaskDescription(subagentCompletionWakeups);
  const isOurs = (tool?: { description?: string }): boolean =>
    tool?.description === CHECK_BACKGROUND_TASK_DESCRIPTION ||
    tool?.description === CHECK_BACKGROUND_TASK_WAKEUP_DESCRIPTION;

  const existingDef = defs.find((d) => d.name === CHECK_BACKGROUND_TASK_NAME);
  const existingRegistry = toolRegistry?.get(CHECK_BACKGROUND_TASK_NAME);

  /** Already registered by us — idempotent no-op. */
  if (
    existingDef?.description === desiredDescription &&
    (existingRegistry == null || existingRegistry.description === desiredDescription)
  ) {
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
  const foreignCollision =
    (existingDef != null && !isOurs(existingDef)) ||
    (existingRegistry != null && !isOurs(existingRegistry));
  if (foreignCollision) {
    logger.warn(
      `[background] A tool named "${CHECK_BACKGROUND_TASK_NAME}" collides with the reserved background poll tool; the host poll tool takes precedence and the colliding tool is shadowed for this run.`,
    );
  }
  toolRegistry?.set(CHECK_BACKGROUND_TASK_NAME, {
    name: CHECK_BACKGROUND_TASK_NAME,
    description: desiredDescription,
    parameters: CHECK_BACKGROUND_TASK_PARAMETERS,
    allowed_callers: ['direct'],
  });
  const withoutCollision = collides
    ? defs.filter((d) => d.name !== CHECK_BACKGROUND_TASK_NAME)
    : defs;
  return {
    toolDefinitions: [
      ...withoutCollision,
      buildCheckBackgroundTaskDefinition(subagentCompletionWakeups),
    ],
  };
}

/**
 * Injects the `run_in_background` param into every opted-in, eligible tool and
 * registers the poll tool when at least one tool became backgroundable.
 *
 * Opt-in resolves per FINAL definition via {@link resolveToolOption}
 * (explicit name → capability marker projection → wildcard), so a saved
 * agent's `execute_code` entry reaches `bash_tool` and a spec selection
 * reaches lazily-registered definitions. When no policy speaks at all, the
 * background-native code pair defaults IN — so this pass runs on every
 * capability-enabled request, not just explicitly opted-in agents. Both
 * saved agents and ephemeral/model-spec agents reach this with the same
 * `tool_options` shape, so the logic is written once. When a narrowing
 * selection is present, names that never took effect — including markers
 * whose every runtime definition is background-excluded, like `memory` —
 * are warned about here.
 */
export function applyBackgroundToolCalls(params: {
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  toolOptions: AgentToolOptions | undefined;
  /** Capability marker → registered definition names, from `initializeAgent`. */
  capabilityToolNames?: CapabilityToolNames;
  /**
   * Extra host-context exclusion (e.g. tools of ephemeral request-scoped MCP
   * servers, whose connection dies at request end): a `true` return skips the
   * param injection entirely so the model is never shown an option the
   * executor would silently downgrade to foreground.
   */
  excludeTool?: (toolName: string) => boolean;
}): { toolDefinitions: LCTool[]; backgroundToolNames: string[] } {
  const { toolRegistry, capabilityToolNames, excludeTool } = params;
  const toolOptions = params.toolOptions && expandActionToolOptions(params.toolOptions);
  const defs = params.toolDefinitions ?? [];
  const selectionNames = getSelectionNames(toolOptions, 'run_in_background');
  const effectiveSources = new Set<string>();

  const backgroundToolNames: string[] = [];
  const nextDefs = defs.map((def) => {
    const resolved = resolveToolOption(
      def.name,
      'run_in_background',
      toolOptions,
      capabilityToolNames,
    );
    const optedIn = resolved != null ? resolved.value : NATIVE_BACKGROUND_TOOL_NAMES.has(def.name);
    if (!optedIn || !isBackgroundEligibleToolName(def.name) || excludeTool?.(def.name) === true) {
      return def;
    }
    if (!canInjectRunInBackgroundParam(def)) {
      logger.warn(
        `[background] Skipping run_in_background for "${def.name}": non-object schema or the tool already declares the parameter.`,
      );
      return def;
    }
    if (resolved != null) {
      effectiveSources.add(resolved.source);
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

  warnUnmatchedSelectionNames(selectionNames, effectiveSources, BACKGROUND_SELECTION_LABEL);

  if (backgroundToolNames.length === 0) {
    return { toolDefinitions: defs, backgroundToolNames: [] };
  }

  const withPoll = registerBackgroundTaskTool({ toolRegistry, toolDefinitions: nextDefs });
  return { toolDefinitions: withPoll.toolDefinitions, backgroundToolNames };
}

/**
 * Records the background selection for ephemeral and model-spec agents, which
 * carry no per-tool options of their own. Returns undefined when disabled.
 *
 * A model spec's `runInBackground` selects the scope: `true` opts in every
 * eligible tool, while a string array opts in ONLY the named ones. Selecting
 * per tool matters more here than for intent labels — backgrounding changes
 * execution semantics, so an admin may want it on one slow MCP call without
 * letting the model detach every other tool in the spec. The ephemeral toggle
 * stays boolean and never narrows; it has no per-tool UI to drive it.
 *
 * A spec's `runInBackground: false` is the boolean spelling of the empty
 * list — an explicit "none" that also opts the background-native code pair
 * out. Pre-native, `false` was behaviorally identical to omitting the field,
 * so a config that wrote it must not silently flip to backgrounding code.
 * The EPHEMERAL toggle's `false` stays no-policy — a badge default, not a
 * decision — so the native default holds for ephemeral chats.
 *
 * The selection is recorded as policy (wildcard default + verbatim names)
 * and resolved against the FINAL definition set in
 * `applyBackgroundToolCalls`, so capability markers and lazily-expanded MCP
 * servers are governed, and names that never take effect — a typo, or a
 * marker like `memory` whose runtime definitions are all
 * background-excluded — are diagnosed where the real definitions are known.
 */
export function synthesizeBackgroundToolOptions(sources: {
  ephemeralAgent?: { run_in_background?: boolean } | null;
  modelSpec?: { runInBackground?: boolean | string[] } | null;
}): AgentToolOptions | undefined {
  const specSelection = sources.modelSpec?.runInBackground;
  return synthesizeSelectionToolOptions(
    'run_in_background',
    specSelection === false ? [] : specSelection,
    sources.ephemeralAgent?.run_in_background === true,
    BACKGROUND_SELECTION_LABEL,
  );
}

export type BackgroundTaskStatus = 'running' | 'completed' | 'error';

export interface BackgroundTask {
  id: string;
  toolName: string;
  toolCallId: string;
  /** Stable run-step identity; provider tool-call ids may repeat within one response. */
  stepId?: string;
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
  /** True until completion-time file inspection/persistence accepts or rejects the artifact. */
  harvestPending?: boolean;
  /** True once the artifact has been handed to a live poll turn's callback. */
  artifactDelivered?: boolean;
  /** Terminal policy rejection: blocked artifact bytes must never be restored or claimed. */
  artifactBlocked?: boolean;
  /** Error message when status === 'error'. */
  error?: string;
  /** One consumer owns presentation of the terminal result. A manual claim is
   * copied into the durable receipt when the dispatch row settles. */
  resultClaim?: {
    kind: 'manual' | 'wakeup';
    claimId: string;
    claimedAt: number;
  };
  /** The declared tool may return a process-local live artifact. A terminal
   * same-generation poll may therefore deliver from the local claim after it
   * retires the unclaimed wakeup, without waiting for the dispatch row to
   * finalize and deadlocking that same generation. */
  liveArtifactPollRequired?: boolean;
  completionWakeup?: boolean;
  /** True while the terminal result is being persisted for automatic delivery. */
  completionPersistencePending?: boolean;
  /** Process-local cancellation handle for the preregistered durable delivery.
   * A same-generation manual claim retires it before exposing the result. */
  completionWakeupRetire?: BackgroundToolWakeupAdmission['retire'];
  completionPersistenceFailed?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface TaskBucket {
  key: string;
  userId: string;
  tasks: Map<string, BackgroundTask>;
  /** toolCallId -> taskId, for dispatch idempotency across graph re-execution. */
  byToolCall: Map<string, string>;
  /** Caller-owned local permits acquired before a caller persists external
   * launch authority. They prevent capacity rejection from creating a durable
   * action that was definitely never launched. */
  capacityPermits: Map<string, { dedupeKey: string }>;
  lastAccess: number;
}

interface RetainedPayloadUsage {
  result: number;
  artifact: number;
  attachments: number;
  error: number;
}

export interface BackgroundTaskCapacityPermit {
  id: string;
  userId: string;
  conversationId: string;
}

export type BackgroundTaskCapacityScope =
  | 'conversation_running'
  | 'conversation_retention'
  | 'user_running'
  | 'user_retention'
  | 'global_running'
  | 'global_retention';

type BackgroundTaskCapacityRejection = {
  atCapacity: true;
  scope: BackgroundTaskCapacityScope;
};

const COMPLETED_TASK_TTL_MS = 60 * 60 * 1000;
const IDLE_BUCKET_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_RUNNING_PER_BUCKET = 10;
const MAX_TASKS_PER_BUCKET = 200;
/** Cross-conversation limits prevent one principal from multiplying the bucket allowance. */
const MAX_RUNNING_PER_USER = 40;
const MAX_RUNNING_GLOBAL = 200;
const MAX_TASKS_PER_USER = 400;
const MAX_TASKS_GLOBAL = 2_000;
const MAX_RESULT_CHARS = 100_000;
const MAX_ARTIFACT_CHARS = 10_000_000;
/** JSON-character budgets bound large settled payloads independently of task metadata. */
const MAX_RETAINED_CHARS_PER_USER = 16_000_000;
const MAX_RETAINED_CHARS_GLOBAL = 64_000_000;
const GLOBAL_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Requests cancellation at the invocation deadline, but accepts terminal
 * timeout evidence only when the invocation subsequently settles. Rejecting
 * this wrapper while the underlying tool can still mutate externally would
 * publish a false failure and make a duplicate side effect appear safe.
 */
export function withBackgroundTaskTimeout<T>(
  invocation: Promise<T>,
  requestAbort: () => void,
  timeoutMs: number = BACKGROUND_TASK_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(requestAbort, timeoutMs);
    timeout.unref?.();
    invocation.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

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
  const serialized = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  const asString = serialized ?? String(content ?? '');
  return truncateMiddle(asString, MAX_RESULT_CHARS);
}

/**
 * Bounds retained artifact memory: an artifact is held for up to the completed
 * TTL, so a runaway payload (huge base64 blobs) is dropped rather than pinned.
 * Measurement failures (such as circular references) drop the artifact because
 * an unmeasurable value cannot safely participate in the aggregate budget.
 */
function toStoredArtifact(
  taskId: string,
  artifact: unknown,
): { artifact?: unknown; chars: number } {
  if (artifact == null) {
    return { chars: 0 };
  }
  try {
    const serialized = JSON.stringify(artifact);
    if (serialized == null) {
      logger.warn(`[background] Dropping unmeasurable artifact for task ${taskId}.`);
      return { chars: 0 };
    }
    const size = serialized.length;
    if (size > MAX_ARTIFACT_CHARS) {
      logger.warn(
        `[background] Dropping oversized artifact for task ${taskId} (${size} chars > ${MAX_ARTIFACT_CHARS}).`,
      );
      return { chars: 0 };
    }
    const storedArtifact: unknown = JSON.parse(serialized);
    return { artifact: storedArtifact, chars: size };
  } catch {
    logger.warn(`[background] Dropping unmeasurable artifact for task ${taskId}.`);
    return { chars: 0 };
  }
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
  private readonly retainedUsage = new WeakMap<BackgroundTask, RetainedPayloadUsage>();
  private lastGlobalSweepAt = 0;

  private key(userId: string, conversationId: string): string {
    return `${userId}::${conversationId}`;
  }

  private sweepBucketTasks(bucket: TaskBucket, now: number): void {
    for (const [taskId, task] of bucket.tasks) {
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
      if (now - bucket.lastAccess > IDLE_BUCKET_TTL_MS && bucket.capacityPermits.size === 0) {
        this.buckets.delete(bucketKey);
        continue;
      }
      this.sweepBucketTasks(bucket, now);
      if (bucket.tasks.size === 0 && bucket.capacityPermits.size === 0) {
        this.buckets.delete(bucketKey);
      }
    }
  }

  private getBucket(userId: string, conversationId: string, now: number): TaskBucket {
    const bucketKey = this.key(userId, conversationId);
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: bucketKey,
        userId,
        tasks: new Map(),
        byToolCall: new Map(),
        capacityPermits: new Map(),
        lastAccess: now,
      };
      this.buckets.set(bucketKey, bucket);
    }
    bucket.lastAccess = now;
    return bucket;
  }

  private dedupeKey(params: { toolCallId: string; runId?: string; agentId?: string }): string {
    return `${params.agentId ?? ''}::${params.runId ?? ''}::${params.toolCallId}`;
  }

  private runningCount(bucket: TaskBucket): number {
    let running = 0;
    for (const task of bucket.tasks.values()) {
      if (task.status === 'running') {
        running++;
      }
    }
    return running;
  }

  private payloadUsage(task: BackgroundTask): RetainedPayloadUsage {
    return (
      this.retainedUsage.get(task) ?? {
        result: 0,
        artifact: 0,
        attachments: 0,
        error: 0,
      }
    );
  }

  private payloadChars(task: BackgroundTask): number {
    const usage = this.payloadUsage(task);
    return usage.result + usage.artifact + usage.attachments + usage.error;
  }

  private updatePayloadUsage(task: BackgroundTask, patch: Partial<RetainedPayloadUsage>): void {
    this.retainedUsage.set(task, { ...this.payloadUsage(task), ...patch });
  }

  private aggregateUsage(userId: string): {
    runningForUser: number;
    runningGlobal: number;
    tasksForUser: number;
    tasksGlobal: number;
    retainedForUser: number;
    retainedGlobal: number;
  } {
    let runningForUser = 0;
    let runningGlobal = 0;
    let tasksForUser = 0;
    let tasksGlobal = 0;
    let retainedForUser = 0;
    let retainedGlobal = 0;
    for (const bucket of this.buckets.values()) {
      const isUser = bucket.userId === userId;
      tasksGlobal += bucket.tasks.size + bucket.capacityPermits.size;
      if (isUser) {
        tasksForUser += bucket.tasks.size + bucket.capacityPermits.size;
      }
      for (const task of bucket.tasks.values()) {
        if (task.status === 'running') {
          runningGlobal++;
          if (isUser) {
            runningForUser++;
          }
        }
        const retained = this.payloadChars(task);
        retainedGlobal += retained;
        if (isUser) {
          retainedForUser += retained;
        }
      }
      runningGlobal += bucket.capacityPermits.size;
      if (isUser) {
        runningForUser += bucket.capacityPermits.size;
      }
    }
    return {
      runningForUser,
      runningGlobal,
      tasksForUser,
      tasksGlobal,
      retainedForUser,
      retainedGlobal,
    };
  }

  private runningCapacityScope(userId: string): 'user_running' | 'global_running' | undefined {
    const usage = this.aggregateUsage(userId);
    if (usage.runningForUser >= MAX_RUNNING_PER_USER) {
      return 'user_running';
    }
    if (usage.runningGlobal >= MAX_RUNNING_GLOBAL) {
      return 'global_running';
    }
    return undefined;
  }

  private settledCandidates(params: {
    userId?: string;
    bucket?: TaskBucket;
    excludeTask?: BackgroundTask;
    requirePayload?: boolean;
  }): Array<{ bucket: TaskBucket; task: BackgroundTask }> {
    const candidates: Array<{ bucket: TaskBucket; task: BackgroundTask }> = [];
    for (const bucket of this.buckets.values()) {
      if (params.bucket != null && bucket !== params.bucket) {
        continue;
      }
      if (params.userId != null && bucket.userId !== params.userId) {
        continue;
      }
      for (const task of bucket.tasks.values()) {
        if (
          task.status !== 'running' &&
          task.harvestPending !== true &&
          task.completionPersistencePending !== true &&
          task !== params.excludeTask &&
          (params.requirePayload !== true || this.payloadChars(task) > 0)
        ) {
          candidates.push({ bucket, task });
        }
      }
    }
    return candidates.sort((a, b) => a.task.updatedAt - b.task.updatedAt);
  }

  private evictSelected(selected: Map<BackgroundTask, TaskBucket>): void {
    const touched = new Set<TaskBucket>();
    for (const [task, bucket] of selected) {
      bucket.tasks.delete(task.id);
      touched.add(bucket);
    }
    const now = Date.now();
    for (const bucket of touched) {
      this.sweepBucketTasks(bucket, now);
      if (bucket.tasks.size === 0 && bucket.capacityPermits.size === 0) {
        this.buckets.delete(bucket.key);
      }
    }
  }

  private makeTaskRoom(userId: string, bucket?: TaskBucket): boolean {
    const usage = this.aggregateUsage(userId);
    const bucketRequired = Math.max(
      0,
      (bucket?.tasks.size ?? 0) + (bucket?.capacityPermits.size ?? 0) - MAX_TASKS_PER_BUCKET + 1,
    );
    const userRequired = Math.max(0, usage.tasksForUser - MAX_TASKS_PER_USER + 1);
    const globalRequired = Math.max(0, usage.tasksGlobal - MAX_TASKS_GLOBAL + 1);
    const selected = new Map<BackgroundTask, TaskBucket>();

    const selectCount = (
      candidates: Array<{ bucket: TaskBucket; task: BackgroundTask }>,
      required: number,
    ): boolean => {
      let remaining = required;
      for (const candidate of candidates) {
        if (remaining <= 0) {
          break;
        }
        if (selected.has(candidate.task)) {
          continue;
        }
        selected.set(candidate.task, candidate.bucket);
        remaining--;
      }
      return remaining === 0;
    };

    if (bucket != null && !selectCount(this.settledCandidates({ bucket }), bucketRequired)) {
      return false;
    }
    const selectedForUser = [...selected.values()].filter(
      (selectedBucket) => selectedBucket.userId === userId,
    ).length;
    if (
      !selectCount(this.settledCandidates({ userId }), Math.max(0, userRequired - selectedForUser))
    ) {
      return false;
    }
    if (!selectCount(this.settledCandidates({}), Math.max(0, globalRequired - selected.size))) {
      return false;
    }
    this.evictSelected(selected);
    return true;
  }

  private taskCapacityScope(
    userId: string,
    bucket?: TaskBucket,
  ): 'conversation_retention' | 'user_retention' | 'global_retention' {
    if (bucket != null && bucket.tasks.size + bucket.capacityPermits.size >= MAX_TASKS_PER_BUCKET) {
      return 'conversation_retention';
    }
    return this.aggregateUsage(userId).tasksForUser >= MAX_TASKS_PER_USER
      ? 'user_retention'
      : 'global_retention';
  }

  private makeRetainedRoom(userId: string, task: BackgroundTask, chars: number): boolean {
    const usage = this.aggregateUsage(userId);
    const userRequired = Math.max(0, usage.retainedForUser + chars - MAX_RETAINED_CHARS_PER_USER);
    const globalRequired = Math.max(0, usage.retainedGlobal + chars - MAX_RETAINED_CHARS_GLOBAL);
    const selected = new Map<BackgroundTask, TaskBucket>();

    const selectChars = (
      candidates: Array<{ bucket: TaskBucket; task: BackgroundTask }>,
      required: number,
    ): boolean => {
      let retained = 0;
      for (const candidate of candidates) {
        if (retained >= required) {
          break;
        }
        if (selected.has(candidate.task)) {
          continue;
        }
        selected.set(candidate.task, candidate.bucket);
        retained += this.payloadChars(candidate.task);
      }
      return retained >= required;
    };

    if (
      !selectChars(
        this.settledCandidates({ userId, excludeTask: task, requirePayload: true }),
        userRequired,
      )
    ) {
      return false;
    }
    let selectedChars = 0;
    for (const selectedTask of selected.keys()) {
      selectedChars += this.payloadChars(selectedTask);
    }
    if (
      !selectChars(
        this.settledCandidates({ excludeTask: task, requirePayload: true }),
        Math.max(0, globalRequired - selectedChars),
      )
    ) {
      return false;
    }
    this.evictSelected(selected);
    return true;
  }

  /** Acquires process-local capacity before a caller persists launch authority.
   * The synchronous permit closes the capacity-rejection crash window without
   * making ordinary background tasks durable. */
  reserveCapacity(params: {
    userId: string;
    conversationId: string;
    toolCallId: string;
    runId?: string;
    agentId?: string;
  }):
    | { permit: BackgroundTaskCapacityPermit }
    | { task: BackgroundTask; isNew: false }
    | BackgroundTaskCapacityRejection {
    const now = Date.now();
    this.sweep(now);
    const bucketKey = this.key(params.userId, params.conversationId);
    const existingBucket = this.buckets.get(bucketKey);
    if (existingBucket != null) {
      existingBucket.lastAccess = now;
      this.sweepBucketTasks(existingBucket, now);
    }
    const dedupeKey = this.dedupeKey(params);
    const existingId = existingBucket?.byToolCall.get(dedupeKey);
    const existing = existingId == null ? undefined : existingBucket?.tasks.get(existingId);
    if (existing != null) {
      return { task: existing, isNew: false };
    }
    if (
      existingBucket != null &&
      this.runningCount(existingBucket) + existingBucket.capacityPermits.size >=
        MAX_RUNNING_PER_BUCKET
    ) {
      return { atCapacity: true, scope: 'conversation_running' };
    }
    const runningScope = this.runningCapacityScope(params.userId);
    if (runningScope != null) {
      return { atCapacity: true, scope: runningScope };
    }
    if (!this.makeTaskRoom(params.userId, existingBucket)) {
      return { atCapacity: true, scope: this.taskCapacityScope(params.userId, existingBucket) };
    }
    const bucket =
      this.buckets.get(bucketKey) ?? this.getBucket(params.userId, params.conversationId, now);
    const permit: BackgroundTaskCapacityPermit = {
      id: randomUUID(),
      userId: params.userId,
      conversationId: params.conversationId,
    };
    /** The permit is owned by the in-flight caller until it is consumed or
     * explicitly released. Expiring it by wall clock could strand a durable
     * reservation when MongoDB is slow; process death already clears local
     * permits without pretending the external launch happened. */
    bucket.capacityPermits.set(permit.id, { dedupeKey });
    return { permit };
  }

  releaseCapacity(permit: BackgroundTaskCapacityPermit): void {
    const bucketKey = this.key(permit.userId, permit.conversationId);
    const bucket = this.buckets.get(bucketKey);
    bucket?.capacityPermits.delete(permit.id);
    if (bucket?.tasks.size === 0 && bucket.capacityPermits.size === 0) {
      this.buckets.delete(bucketKey);
    }
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
    taskId?: string;
    userId: string;
    conversationId: string;
    toolCallId: string;
    stepId?: string;
    toolName: string;
    messageId?: string;
    runId?: string;
    agentId?: string;
    /** Set at dispatch when a settle-time harvest WILL run. */
    harvestStarted?: boolean;
    liveArtifactPollRequired?: boolean;
    capacityPermit?: BackgroundTaskCapacityPermit;
  }): { task: BackgroundTask; isNew: boolean } | BackgroundTaskCapacityRejection {
    const now = Date.now();
    this.sweep(now);
    const bucketKey = this.key(params.userId, params.conversationId);
    const existingBucket = this.buckets.get(bucketKey);
    if (existingBucket != null) {
      existingBucket.lastAccess = now;
      this.sweepBucketTasks(existingBucket, now);
    }

    const dedupeKey = this.dedupeKey(params);
    const existingId = existingBucket?.byToolCall.get(dedupeKey);
    if (existingId) {
      const existing = existingBucket?.tasks.get(existingId);
      if (existing) {
        if (params.capacityPermit != null) {
          this.releaseCapacity(params.capacityPermit);
        }
        return { task: existing, isNew: false };
      }
    }

    if (params.capacityPermit != null) {
      if (existingBucket == null) {
        throw new Error('Background task capacity permit is stale');
      }
      const bucket = existingBucket;
      const permit = bucket.capacityPermits.get(params.capacityPermit.id);
      if (
        params.capacityPermit.userId !== params.userId ||
        params.capacityPermit.conversationId !== params.conversationId ||
        permit?.dedupeKey !== dedupeKey
      ) {
        throw new Error('Background task capacity permit is stale');
      }
      bucket.capacityPermits.delete(params.capacityPermit.id);
    }
    /** Only *running* tasks gate dispatch. */
    if (params.capacityPermit == null) {
      if (
        existingBucket != null &&
        this.runningCount(existingBucket) + existingBucket.capacityPermits.size >=
          MAX_RUNNING_PER_BUCKET
      ) {
        return { atCapacity: true, scope: 'conversation_running' };
      }
      const runningScope = this.runningCapacityScope(params.userId);
      if (runningScope != null) {
        return { atCapacity: true, scope: runningScope };
      }
    }
    if (!this.makeTaskRoom(params.userId, existingBucket)) {
      return { atCapacity: true, scope: this.taskCapacityScope(params.userId, existingBucket) };
    }
    /** Aggregate eviction may have removed `existingBucket` when its only
     * settled task was the oldest candidate. Never register into that detached map. */
    const bucket =
      this.buckets.get(bucketKey) ?? this.getBucket(params.userId, params.conversationId, now);
    const task: BackgroundTask = {
      id: params.taskId ?? randomUUID(),
      toolName: params.toolName,
      toolCallId: params.toolCallId,
      stepId: params.stepId,
      messageId: params.messageId,
      agentId: params.agentId,
      ...(params.harvestStarted === true ? { harvestStarted: true, harvestPending: true } : {}),
      ...(params.liveArtifactPollRequired === true ? { liveArtifactPollRequired: true } : {}),
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
  ): boolean {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (!task || (task.artifactBlocked === true && patch.artifactBlocked !== true)) {
      return false;
    }
    Object.assign(task, patch, { updatedAt: Date.now() });
    return true;
  }

  complete(
    userId: string,
    conversationId: string,
    taskId: string,
    result: { content: unknown; artifact?: unknown; harvestStarted?: boolean },
  ): string {
    const storedContent = toStoredContent(result.content);
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task == null || task.status !== 'running' || task.artifactBlocked === true) {
      return storedContent;
    }
    const storedArtifact = toStoredArtifact(taskId, result.artifact);
    const usage = this.payloadUsage(task);
    const desiredChars = storedContent.length + storedArtifact.chars;
    const currentChars = usage.result + usage.artifact;
    const hasRetainedCapacity = this.makeRetainedRoom(
      userId,
      task,
      Math.max(0, desiredChars - currentChars),
    );
    const retainedContent = hasRetainedCapacity ? storedContent : undefined;
    const artifact = hasRetainedCapacity ? storedArtifact.artifact : undefined;
    const artifactChars = hasRetainedCapacity ? storedArtifact.chars : 0;
    const updated = this.update(userId, conversationId, taskId, {
      status: 'completed',
      result: retainedContent,
      artifact,
      error: undefined,
      ...(result.harvestStarted === true ? { harvestStarted: true, harvestPending: true } : {}),
      /** Marks that an artifact existed even after `claimArtifact` clears it,
       *  so re-polls keep the "produced an artifact" note. */
      artifactDelivered: false,
    });
    if (updated) {
      this.updatePayloadUsage(task, {
        result: retainedContent?.length ?? 0,
        artifact: artifactChars,
        error: 0,
      });
    }
    return storedContent;
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
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task == null || task.status !== 'completed' || task.artifactBlocked === true) {
      return;
    }
    const measured = toStoredArtifact(taskId, attachments);
    const additionalChars = Math.max(0, measured.chars - this.payloadUsage(task).attachments);
    if (measured.artifact == null || !this.makeRetainedRoom(userId, task, additionalChars)) {
      return;
    }
    if (this.update(userId, conversationId, taskId, { attachments })) {
      this.updatePayloadUsage(task, { attachments: measured.chars });
    }
  }

  /** Marks completion-time inspection/persistence successful, unlocking artifact collection. */
  finishHarvest(
    userId: string,
    conversationId: string,
    taskId: string,
    attachments: unknown[] = [],
  ): void {
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task == null || task.status !== 'completed' || task.artifactBlocked === true) {
      return;
    }
    if (attachments.length === 0) {
      this.update(userId, conversationId, taskId, { harvestPending: false });
      return;
    }
    const measured = toStoredArtifact(taskId, attachments);
    const additionalChars = Math.max(0, measured.chars - this.payloadUsage(task).attachments);
    const canStoreAttachments =
      measured.artifact != null && this.makeRetainedRoom(userId, task, additionalChars);
    const updated = this.update(userId, conversationId, taskId, {
      harvestPending: false,
      ...(attachments.length > 0 && canStoreAttachments ? { attachments } : {}),
    });
    if (updated && attachments.length > 0 && canStoreAttachments) {
      this.updatePayloadUsage(task, { attachments: measured.chars });
    }
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
        stepId?: string;
        messageId?: string;
        harvestStarted?: boolean;
        artifact: unknown;
        content?: string;
      }
    | undefined {
    const bucket = this.buckets.get(this.key(userId, conversationId));
    const task = bucket?.tasks.get(taskId);
    if (
      !task ||
      task.status !== 'completed' ||
      task.harvestPending === true ||
      task.artifact == null ||
      task.artifactDelivered
    ) {
      return undefined;
    }
    const artifact = task.artifact;
    task.artifactDelivered = true;
    task.artifact = undefined;
    this.updatePayloadUsage(task, { artifact: 0 });
    return {
      toolName: task.toolName,
      toolCallId: task.toolCallId,
      stepId: task.stepId,
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
    if (
      !task ||
      task.status !== 'completed' ||
      task.artifactBlocked === true ||
      task.artifact != null
    ) {
      return;
    }
    /** Same size bound as `complete()` — a restore path must not resurrect
     *  an artifact the memory cap already discarded. */
    const storedArtifact = toStoredArtifact(taskId, artifact);
    if (
      storedArtifact.artifact == null ||
      !this.makeRetainedRoom(userId, task, storedArtifact.chars)
    ) {
      return;
    }
    task.artifact = storedArtifact.artifact;
    task.artifactDelivered = false;
    this.updatePayloadUsage(task, { artifact: storedArtifact.chars });
    task.updatedAt = Date.now();
  }

  fail(
    userId: string,
    conversationId: string,
    taskId: string,
    error: string,
    options?: { harvestStarted?: boolean },
  ): void {
    const storedError = truncateMiddle(error, MAX_RESULT_CHARS);
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task == null || task.status !== 'running' || task.artifactBlocked === true) {
      return;
    }
    const hasRetainedCapacity = this.makeRetainedRoom(userId, task, storedError.length);
    const retainedError = hasRetainedCapacity ? storedError : undefined;
    const updated = this.update(userId, conversationId, taskId, {
      status: 'error',
      error: retainedError,
      result: undefined,
      artifact: undefined,
      attachments: undefined,
      ...(options?.harvestStarted === true ? { harvestStarted: true, harvestPending: true } : {}),
    });
    if (updated) {
      this.retainedUsage.set(task, {
        result: 0,
        artifact: 0,
        attachments: 0,
        error: retainedError?.length ?? 0,
      });
    }
  }

  markCompletionWakeup(
    userId: string,
    conversationId: string,
    taskId: string,
    admission?: BackgroundToolWakeupAdmission,
  ): void {
    this.update(userId, conversationId, taskId, {
      completionWakeup: true,
      ...(admission == null ? {} : { completionWakeupRetire: admission.retire }),
    });
  }

  markCompletionPersistencePending(userId: string, conversationId: string, taskId: string): void {
    this.update(userId, conversationId, taskId, { completionPersistencePending: true });
  }

  markCompletionPersistenceFinished(userId: string, conversationId: string, taskId: string): void {
    this.update(userId, conversationId, taskId, { completionPersistencePending: undefined });
  }

  markCompletionPersistenceFailed(userId: string, conversationId: string, taskId: string): void {
    this.update(userId, conversationId, taskId, {
      completionPersistencePending: undefined,
      completionPersistenceFailed: true,
      completionWakeupRetire: undefined,
    });
  }

  async retireCompletionWakeup(
    userId: string,
    conversationId: string,
    taskId: string,
    reason: string,
    options?: { onlyIfUnclaimed?: boolean; onlyIfDead?: boolean },
  ): Promise<boolean> {
    const task = this.get(userId, conversationId, taskId);
    if (task?.completionWakeupRetire == null) {
      return false;
    }
    const retired = await task.completionWakeupRetire(reason, options);
    if (retired) {
      task.completionWakeupRetire = undefined;
      task.updatedAt = Date.now();
    }
    return retired;
  }

  claimResult(
    userId: string,
    conversationId: string,
    taskId: string,
    claim: { kind: 'manual' | 'wakeup'; claimId: string },
  ): 'acquired' | 'replay' | 'claimed' | 'not_ready' {
    const task = this.get(userId, conversationId, taskId);
    if (task == null || task.status === 'running') {
      return 'not_ready';
    }
    if (task.resultClaim == null) {
      task.resultClaim = { ...claim, claimedAt: Date.now() };
      task.updatedAt = Date.now();
      return 'acquired';
    }
    return task.resultClaim.kind === claim.kind && task.resultClaim.claimId === claim.claimId
      ? 'replay'
      : 'claimed';
  }

  releaseResultClaim(
    userId: string,
    conversationId: string,
    taskId: string,
    claim: { kind: 'manual' | 'wakeup'; claimId: string },
  ): void {
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task?.resultClaim?.kind === claim.kind && task.resultClaim.claimId === claim.claimId) {
      task.resultClaim = undefined;
      task.updatedAt = Date.now();
    }
  }

  /** Permanently removes a policy-rejected artifact and exposes only the raw-free policy error. */
  blockArtifact(userId: string, conversationId: string, taskId: string, error: string): void {
    const task = this.buckets.get(this.key(userId, conversationId))?.tasks.get(taskId);
    if (task == null) {
      return;
    }
    const storedError = truncateMiddle(error, MAX_RESULT_CHARS);
    const hasRetainedCapacity = this.makeRetainedRoom(
      userId,
      task,
      Math.max(0, storedError.length - this.payloadChars(task)),
    );
    const retainedError = hasRetainedCapacity ? storedError : undefined;
    const updated = this.update(userId, conversationId, taskId, {
      status: 'error',
      error: retainedError,
      result: undefined,
      artifact: undefined,
      attachments: undefined,
      harvestStarted: undefined,
      harvestPending: undefined,
      artifactDelivered: false,
      artifactBlocked: true,
    });
    if (updated) {
      this.retainedUsage.set(task, {
        result: 0,
        artifact: 0,
        attachments: 0,
        error: retainedError?.length ?? 0,
      });
    }
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
    if (!task || task.artifactBlocked === true) {
      return;
    }
    task.harvestStarted = undefined;
    task.harvestPending = undefined;
    if (task.artifact == null && artifact != null) {
      this.restoreArtifact(userId, conversationId, taskId, artifact);
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
    if (bucket.tasks.size === 0 && bucket.capacityPermits.size === 0) {
      this.buckets.delete(bucket.key);
      return undefined;
    }
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
    if (bucket.tasks.size === 0 && bucket.capacityPermits.size === 0) {
      this.buckets.delete(bucket.key);
      return [];
    }
    return [...bucket.tasks.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
}

export const backgroundTaskRegistry = new BackgroundTaskRegistryClass();

/** Content for the synthetic ToolMessage returned when a call is backgrounded. */
export function buildBackgroundHandleContent(
  task: Pick<BackgroundTask, 'id' | 'toolName' | 'status'>,
  options: { completionWakeup?: boolean; liveArtifactPollRequired?: boolean } = {},
): string {
  let message: string;
  if (options.liveArtifactPollRequired === true) {
    message = `Started "${task.toolName}" in the background. This tool can return a live artifact, so you must call ${CHECK_BACKGROUND_TASK_NAME} with background_task_id "${task.id}" until it completes; do not end the turn expecting artifact delivery from an automatic continuation. If the settled result is content-only, the host may still resume you automatically.`;
  } else if (options.completionWakeup === true) {
    message = `Started "${task.toolName}" in the background. Continue independent work or end the turn; the host will resume you when task "${task.id}" finishes. Use ${CHECK_BACKGROUND_TASK_NAME} only for an explicit status check or as a fallback.`;
  } else {
    message = `Started "${task.toolName}" in the background. Call ${CHECK_BACKGROUND_TASK_NAME} with background_task_id "${task.id}" to check progress and retrieve the result; it persists on this server, so you may poll it later in this turn or in a following turn. Do not assume it has finished until you have polled and seen status "completed".`;
  }
  return JSON.stringify({
    background_task_id: task.id,
    tool: task.toolName,
    status: task.status,
    message,
  });
}

/** Content returned when a background registry capacity limit is hit. */
export function buildBackgroundCapacityContent(
  toolName: string,
  scope: BackgroundTaskCapacityScope = 'conversation_running',
): string {
  let message: string;
  if (scope === 'user_running') {
    message = `Too many background tasks are already active for this user (limit ${MAX_RUNNING_PER_USER}, including pending launch reservations). Wait for existing background work to settle, or run this call in the foreground.`;
  } else if (scope === 'user_retention') {
    message = `This user is retaining the maximum number of background tasks (${MAX_TASKS_PER_USER}), and pending result processing prevents safe eviction. Wait for background result processing to finish, or run this call in the foreground.`;
  } else if (scope === 'global_running') {
    message = `The server-wide background task registry is at capacity (running limit ${MAX_RUNNING_GLOBAL}). Retry later, or run this call in the foreground.`;
  } else if (scope === 'global_retention') {
    message = `The server-wide background task registry is retaining its maximum number of tasks (${MAX_TASKS_GLOBAL}), and pending result processing prevents safe eviction. Retry later, or run this call in the foreground.`;
  } else if (scope === 'conversation_retention') {
    message = `This conversation is retaining the maximum number of background tasks (${MAX_TASKS_PER_BUCKET}), and pending result processing prevents safe eviction. Wait for background result processing to finish, or run this call in the foreground.`;
  } else {
    message = `Too many background tasks are already running in this conversation (limit ${MAX_RUNNING_PER_BUCKET}). Poll ${CHECK_BACKGROUND_TASK_NAME} to collect finished results before dispatching more, or run this call in the foreground.`;
  }
  return JSON.stringify({
    status: 'rejected',
    tool: toolName,
    scope,
    message,
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

interface SerializedSubagentTask {
  background_task_id: string;
  subagent_thread_id?: string;
  tool: string;
  subagent_type: string;
  status: string;
  progress: number;
  progress_detail?: SubagentTaskSnapshot['progress'];
  result?: string;
  result_available?: boolean;
  result_claimed?: boolean;
  pending_controls?: number;
  error?: string;
  control_id?: string;
  message?: string;
}

function serializeSubagentSnapshot(
  task: SubagentTaskSnapshot,
  options: {
    includeResult?: string;
    status?: string;
    controlId?: string;
    completionWakeups?: boolean;
  } = {},
): SerializedSubagentTask {
  return {
    background_task_id: task.taskId,
    ...(task.threadId == null ? {} : { subagent_thread_id: task.threadId }),
    tool: String(AgentConstants.SUBAGENT),
    subagent_type: task.subagentType,
    status: options.status ?? task.status,
    progress: task.status === 'running' ? 0 : 1,
    ...(task.progress == null ? {} : { progress_detail: task.progress }),
    ...(options.includeResult == null ? {} : { result: options.includeResult }),
    ...(task.resultAvailable ? { result_available: true } : {}),
    ...(task.resultClaimed ? { result_claimed: true } : {}),
    ...(task.pendingControls > 0 ? { pending_controls: task.pendingControls } : {}),
    ...(task.error == null ? {} : { error: task.error }),
    ...(options.controlId == null ? {} : { control_id: options.controlId }),
    ...(options.completionWakeups === true && task.status === 'running'
      ? { message: SUBAGENT_WAKEUP_GUIDANCE }
      : {}),
  };
}

function serializeSubagentClaim(
  claim: SubagentTaskClaim,
  completionWakeups: boolean,
): SerializedSubagentTask | undefined {
  if (claim.status === 'not_found') {
    return undefined;
  }
  if (claim.status === 'completed') {
    return serializeSubagentSnapshot(claim.task, { includeResult: claim.result });
  }
  if (claim.status === 'error' || claim.status === 'cancelled') {
    return {
      ...serializeSubagentSnapshot(claim.task, { status: claim.status }),
      error: claim.error,
    };
  }
  return serializeSubagentSnapshot(claim.task, { status: claim.status, completionWakeups });
}

function serializeSubagentControl(
  result: SubagentTaskControlResult,
): SerializedSubagentTask | { status: string; message?: string } | undefined {
  if (result.status === 'not_found') {
    return undefined;
  }
  if (result.status === 'invalid') {
    return { status: result.status, message: result.message };
  }
  return serializeSubagentSnapshot(result.task, {
    status: result.status,
    ...(result.status === 'accepted' && result.controlId != null
      ? { controlId: result.controlId }
      : {}),
  });
}

function buildSubagentControlCommand(
  args: Record<string, unknown>,
  action: string,
): SubagentTaskControlCommand | undefined {
  if (action === 'cancel') {
    return { action: 'cancel' };
  }
  if (action === 'cancel_message') {
    return typeof args.control_id === 'string' &&
      args.control_id.length <= MAX_BACKGROUND_CONTROL_ID_CHARS
      ? { action: 'cancel_message', controlId: args.control_id }
      : undefined;
  }
  if (action === 'steer' || action === 'queue' || action === 'interrupt') {
    return typeof args.message === 'string' &&
      args.message.length <= MAX_BACKGROUND_CONTROL_MESSAGE_CHARS
      ? { action, message: args.message }
      : undefined;
  }
  return undefined;
}

/**
 * One tool call is one invocation, of a control or of the poll that collects a result.
 * A provider tool-call id such as `call_0` repeats across runs and agents, so the
 * identity also carries the run and executing agent; replaying that same call stays
 * idempotent while a later run's identical id is a new invocation. Hashing keeps every
 * derived identity inside the routed bound.
 */
function controlInvocationId(params: {
  toolCallId?: string;
  agentId?: string;
  runId?: string;
}): string {
  const toolCallId = params.toolCallId?.trim();
  if (toolCallId == null || toolCallId === '') {
    return randomUUID();
  }
  return createHash('sha256')
    .update(`${params.runId ?? ''}\u0000${params.agentId ?? ''}\u0000${toolCallId}`)
    .digest('base64url')
    .slice(0, 32);
}

/** Executes a `check_background_task` call and returns the ToolMessage content. */
interface RoutedSubagentTaskStore {
  claimTask(scopeId: string, taskId: string, invocationId: string): Promise<SubagentTaskClaim>;
  controlTask(
    scopeId: string,
    taskId: string,
    command: SubagentTaskControlCommand,
    invocationId: string,
  ): Promise<SubagentTaskControlResult>;
  listTasks(scopeId: string): Promise<SubagentTaskSnapshot[]>;
}

function routedSubagentStore(store: SubagentTaskStore): RoutedSubagentTaskStore | undefined {
  const candidate = store as SubagentTaskStore & Partial<RoutedSubagentTaskStore>;
  return typeof candidate.claimTask === 'function' &&
    typeof candidate.controlTask === 'function' &&
    typeof candidate.listTasks === 'function'
    ? (candidate as RoutedSubagentTaskStore)
    : undefined;
}

export async function runCheckBackgroundTask(params: {
  userId: string;
  conversationId: string;
  args: unknown;
  /** The provider's tool-call id: one control invocation, stable across replays. */
  toolCallId?: string;
  /** Scopes that tool-call id, whose provider ids repeat across runs and agents. */
  agentId?: string;
  runId?: string;
  subagentTasks?: SubagentTaskConfig;
  claimBackgroundToolResult?: (params: {
    userId: string;
    conversationId: string;
    messageId: string;
    taskId: string;
    agentId?: string;
    kind: 'manual';
    claimId: string;
  }) => Promise<
    | { status: 'acquired' | 'not_found' | 'not_ready' }
    | { status: 'claimed'; claim?: { kind: 'manual' | 'wakeup'; claimId: string } }
  >;
  recoverDeadBackgroundToolClaim?: BackgroundToolDeadClaimRecovery;
}): Promise<string> {
  const { userId, conversationId } = params;
  const args = coerceArgsObject(params.args) ?? {};
  const rawId = args.background_task_id;
  if (typeof rawId === 'string' && rawId.trim().length > MAX_BACKGROUND_TASK_ID_CHARS) {
    return JSON.stringify({
      status: 'invalid',
      message: `A background_task_id cannot exceed ${MAX_BACKGROUND_TASK_ID_CHARS} characters.`,
    });
  }
  const taskId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined;
  const action = typeof args.action === 'string' && args.action !== '' ? args.action : 'poll';
  const invocationId = controlInvocationId(params);

  if (taskId) {
    const task = backgroundTaskRegistry.get(userId, conversationId, taskId);
    if (task != null) {
      if (action !== 'poll') {
        return JSON.stringify({
          status: 'invalid',
          background_task_id: taskId,
          message: 'Control actions are supported only for subagent tasks.',
        });
      }
      if (task.status !== 'running') {
        if (
          task.completionWakeup === true &&
          task.completionPersistenceFailed !== true &&
          params.claimBackgroundToolResult != null &&
          task.messageId != null
        ) {
          const durableClaimInput = {
            userId,
            conversationId,
            messageId: task.messageId,
            taskId,
            agentId: task.agentId,
            kind: 'manual' as const,
            claimId: invocationId,
          };
          let durableClaim = await params.claimBackgroundToolResult(durableClaimInput);
          if (durableClaim.status === 'claimed') {
            let recovered = false;
            let recoveryUnavailable = false;
            if (
              durableClaim.claim?.kind === 'wakeup' &&
              params.recoverDeadBackgroundToolClaim != null
            ) {
              try {
                recovered = await params.recoverDeadBackgroundToolClaim({
                  userId,
                  conversationId,
                  messageId: task.messageId,
                  claimId: durableClaim.claim.claimId,
                });
              } catch (error) {
                recoveryUnavailable = true;
                logger.warn(
                  `[background] Failed to reconcile claimed completion for manual poll ${taskId}:`,
                  error,
                );
              }
            }
            if (!recovered) {
              return JSON.stringify({
                status: recoveryUnavailable ? 'result_persisting' : 'delivery_scheduled',
                background_task_id: taskId,
                message: recoveryUnavailable
                  ? 'The automatic delivery recovery is temporarily unavailable. Retry this poll shortly.'
                  : 'This result is already assigned to an automatic continuation.',
              });
            }
            durableClaim = await params.claimBackgroundToolResult(durableClaimInput);
            if (durableClaim.status === 'claimed') {
              return JSON.stringify({
                status: 'delivery_scheduled',
                background_task_id: taskId,
                message: 'This result is already assigned to another continuation.',
              });
            }
            if (durableClaim.status !== 'acquired') {
              return JSON.stringify({
                status: 'result_persisting',
                background_task_id: taskId,
                message:
                  'The task is finished and its result is being recovered. Retry this poll shortly.',
              });
            }
          }
          if (durableClaim.status === 'not_found' || durableClaim.status === 'not_ready') {
            const localReplay =
              task.resultClaim?.kind === 'manual' && task.resultClaim.claimId === invocationId;
            let localClaimNeedsNoDurableConfirmation =
              localReplay && task.liveArtifactPollRequired === true;
            if (!localReplay) {
              /** Retire the still-unclaimed delivery before creating local
               * ownership. A live resolver lease wins. Once that resolver is
               * irreversibly dead-lettered, a dead-only repair reopens the
               * process-local poll fallback without stealing live work. */
              let retired = false;
              try {
                retired = await backgroundTaskRegistry.retireCompletionWakeup(
                  userId,
                  conversationId,
                  taskId,
                  'completion claimed by same-generation manual poll',
                  { onlyIfUnclaimed: true },
                );
                if (!retired) {
                  retired = await backgroundTaskRegistry.retireCompletionWakeup(
                    userId,
                    conversationId,
                    taskId,
                    'dead completion recovered by same-generation manual poll',
                    { onlyIfDead: true },
                  );
                  if (retired) {
                    localClaimNeedsNoDurableConfirmation = true;
                    backgroundTaskRegistry.markCompletionPersistenceFailed(
                      userId,
                      conversationId,
                      taskId,
                    );
                  }
                }
              } catch (error) {
                logger.warn(
                  `[background] Failed to retire automatic completion for manual claim ${taskId}:`,
                  error,
                );
              }
              if (!retired) {
                return JSON.stringify({
                  status: 'result_persisting',
                  background_task_id: taskId,
                  message:
                    'The task is finished and completion ownership is being settled. Retry this poll shortly.',
                });
              }
              const localClaim = backgroundTaskRegistry.claimResult(
                userId,
                conversationId,
                taskId,
                { kind: 'manual', claimId: invocationId },
              );
              if (localClaim === 'claimed') {
                return JSON.stringify({
                  status: 'delivery_scheduled',
                  background_task_id: taskId,
                  message: 'This result is already assigned to an automatic continuation.',
                });
              }
              if (localClaim === 'not_ready') {
                return JSON.stringify({
                  status: 'result_persisting',
                  background_task_id: taskId,
                  message:
                    'The task is finished and its result is being made durable. Retry this poll shortly.',
                });
              }
              if (task.liveArtifactPollRequired === true) {
                /** The poll is executing inside the still-unfinished dispatch
                 * generation, so waiting for the durable row would require
                 * that generation to end before it can obey its mandatory
                 * live-artifact poll. The retired unclaimed wakeup plus this
                 * local manual claim is authoritative for this owner process;
                 * the persistence retry re-reads and copies the claim after
                 * the generation finalizes. */
                localClaimNeedsNoDurableConfirmation = true;
              }
            }
            /** Ordinary polls do not expose the local result until the durable
             * row has copied this manual claim. The owner-process live-artifact
             * exception above cannot wait for its own generation to finalize;
             * its persister re-reads the local claim after finalization. */
            if (!localClaimNeedsNoDurableConfirmation) {
              const reconciledClaim = await params.claimBackgroundToolResult(durableClaimInput);
              if (reconciledClaim.status === 'claimed') {
                backgroundTaskRegistry.releaseResultClaim(userId, conversationId, taskId, {
                  kind: 'manual',
                  claimId: invocationId,
                });
                return JSON.stringify({
                  status: 'delivery_scheduled',
                  background_task_id: taskId,
                  message: 'This result is already assigned to an automatic continuation.',
                });
              }
              if (reconciledClaim.status !== 'acquired') {
                return JSON.stringify({
                  status: 'result_persisting',
                  background_task_id: taskId,
                  message:
                    'The task is finished and its result is being made durable. Retry this poll shortly.',
                });
              }
            }
          }
        }
      }
      return JSON.stringify(serializeTask(task, { includeResult: true }));
    }

    const subagentTasks = params.subagentTasks;
    if (subagentTasks != null) {
      try {
        const routedStore = routedSubagentStore(subagentTasks.store);
        if (action === 'poll') {
          const claim =
            routedStore == null
              ? subagentTasks.store.claim(subagentTasks.scopeId, taskId)
              : await routedStore.claimTask(subagentTasks.scopeId, taskId, invocationId);
          const claimed = serializeSubagentClaim(
            claim,
            agentUsesSubagentCompletionWakeups(subagentTasks, params.agentId),
          );
          if (claimed != null) {
            return JSON.stringify(claimed);
          }
        } else {
          const command = buildSubagentControlCommand(args, action);
          if (command == null) {
            return JSON.stringify({
              status: 'invalid',
              background_task_id: taskId,
              message: 'This subagent control action is unknown or missing its required argument.',
            });
          }
          const result =
            routedStore == null
              ? subagentTasks.store.control(subagentTasks.scopeId, taskId, command)
              : await routedStore.controlTask(subagentTasks.scopeId, taskId, command, invocationId);
          const controlled = serializeSubagentControl(result);
          if (controlled != null) {
            return JSON.stringify(controlled);
          }
        }
      } catch (error) {
        if (error instanceof SubagentTaskOwnerUnavailableError) {
          return JSON.stringify({
            status: 'unavailable',
            background_task_id: taskId,
            message: error.message,
          });
        }
        throw error;
      }
    }

    return JSON.stringify({
      status: 'not_found',
      background_task_id: taskId,
      message: 'No background task with that id exists in this thread.',
    });
  }

  if (action !== 'poll') {
    return JSON.stringify({
      status: 'invalid',
      message: 'A background_task_id is required for control actions.',
    });
  }

  const tasks = backgroundTaskRegistry.list(userId, conversationId);
  let subagentTasks: SerializedSubagentTask[] = [];
  let listWarning: string | undefined;
  const completionWakeups = agentUsesSubagentCompletionWakeups(
    params.subagentTasks,
    params.agentId,
  );
  if (params.subagentTasks != null) {
    try {
      const routedStore = routedSubagentStore(params.subagentTasks.store);
      const snapshots =
        routedStore == null
          ? params.subagentTasks.store.list(params.subagentTasks.scopeId)
          : await routedStore.listTasks(params.subagentTasks.scopeId);
      subagentTasks = snapshots.map((task) => serializeSubagentSnapshot(task));
    } catch (error) {
      if (error instanceof SubagentTaskOwnerUnavailableError) {
        /** Cross-replica discovery is an additive source. A Redis outage must not
         * hide ordinary tasks or subagents owned by this process; surface the
         * incomplete view explicitly so the caller can retry for remote tasks. */
        subagentTasks = params.subagentTasks.store
          .list(params.subagentTasks.scopeId)
          .map((task) => serializeSubagentSnapshot(task));
        listWarning = `Cross-replica subagent tasks could not be listed: ${error.message}`;
      } else {
        throw error;
      }
    }
  }
  logger.debug(
    `[background] check_background_task listed ${tasks.length + subagentTasks.length} task(s)`,
  );
  return JSON.stringify({
    tasks: [
      ...tasks.map((task) => serializeTask(task, { includeResult: false })),
      ...subagentTasks,
    ],
    ...(completionWakeups && subagentTasks.some((task) => task.status === 'running')
      ? { message: SUBAGENT_WAKEUP_GUIDANCE }
      : {}),
    ...(listWarning != null && { partial: true, warning: listWarning }),
  });
}

/** Returns a read-only snapshot of the specifically requested task, if any. */
export function getBackgroundTaskSnapshot(params: {
  userId: string;
  conversationId: string;
  args: unknown;
}): Readonly<BackgroundTask> | undefined {
  const rawId = coerceArgsObject(params.args)?.background_task_id;
  const taskId = typeof rawId === 'string' && rawId.trim() !== '' ? rawId.trim() : undefined;
  if (!taskId) {
    return undefined;
  }
  const task = backgroundTaskRegistry.get(params.userId, params.conversationId, taskId);
  if (!task) {
    return undefined;
  }
  return {
    ...task,
    ...(task.attachments != null ? { attachments: [...task.attachments] } : {}),
  };
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
      stepId?: string;
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
      stepId?: string;
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
  if (
    !task ||
    task.harvestStarted !== true ||
    (task.status === 'completed' && task.harvestPending === true)
  ) {
    return undefined;
  }
  return {
    taskId,
    status: task.status,
    toolName: task.toolName,
    toolCallId: task.toolCallId,
    stepId: task.stepId,
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
