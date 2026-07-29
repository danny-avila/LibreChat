/**
 * @fileoverview Tool intent labels.
 *
 * Injects an optional `intent` string as the FIRST property of a tool's
 * schema so the model can declare, per call, one sentence stating what that
 * specific call is about to do ("Searching for OAuth handling in the
 * callback router"). Because the property is first, it is the first key
 * providers stream in the tool-call args, and the client renders it as the
 * call's live status label — the args already reach the client verbatim, so
 * no new event plumbing is involved. The label is inert server-side: the
 * only interception is stripping the arg before invoking a tool that did
 * not declare it.
 *
 * Opt-in mirrors `run_in_background`: an admin capability
 * (`AgentCapabilities.tool_intents`) gates the feature, and a per-tool
 * `tool_options[name].describe_intent` flag turns it on for a given tool.
 * Native host tools (web search, file authoring, memory, ask-user-question)
 * default ON while the capability is enabled — an explicit
 * `describe_intent: false` opts one out. SDK-native tools (the coding
 * suite, subagent, skill, tool_search) declare `intent` in their own
 * schemas and need no host injection.
 *
 * @module packages/api/src/agents/intent
 */

import { logger } from '@librechat/data-schemas';
import { Tools, Constants } from 'librechat-data-provider';
import {
  Constants as AgentConstants,
  INTENT_LABEL_MARKER,
  INTENT_DESCRIPTION,
} from '@librechat/agents';
import type { LCTool, LCToolRegistry, JsonSchemaType } from '@librechat/agents';
import type { AgentToolOptions } from 'librechat-data-provider';
import { SET_MEMORY_TOOL_NAME, DELETE_MEMORY_TOOL_NAME } from './memory';
import { CREATE_FILE_TOOL_NAME, EDIT_FILE_TOOL_NAME } from './tools';

/** Argument carrying the model-authored label for a tool call. */
export const INTENT_ARG = 'intent';

/**
 * Host-native tools that default INTO intent labels while the capability is
 * enabled (an explicit `describe_intent: false` opts one out). These are the
 * least legible calls in the UI today, and the convention only becomes a
 * convention if our own tools model it.
 *
 * `ask_user_question` is deliberately absent: its graph tool is rebuilt in
 * `run.ts` from its own Zod schema (which is also the HITL card's wire
 * shape), so definition-level injection never reaches the model. Its intent
 * support lands with the HITL slice, which threads the label into the
 * interrupt payload on purpose.
 */
export const NATIVE_INTENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  Tools.web_search,
  CREATE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  SET_MEMORY_TOOL_NAME,
  DELETE_MEMORY_TOOL_NAME,
]);

/**
 * Tools that never get the injected param: the background poll tool is host
 * machinery, and handoff tools run through the direct path where no card
 * renders a label. Intent labels are otherwise inert, so — unlike
 * background's correctness-driven list — nothing else is excluded.
 */
const EXCLUDED_INTENT_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  String(Constants.CHECK_BACKGROUND_TASK),
]);

/** Whether a tool may carry an intent label. */
export function isIntentEligibleToolName(name: string): boolean {
  if (EXCLUDED_INTENT_TOOL_NAMES.has(name)) {
    return false;
  }
  return !name.startsWith(AgentConstants.LC_TRANSFER_TO_);
}

/**
 * Coerces tool-call args to an object, parsing a stringified JSON object
 * (some providers deliver args as a string). Returns undefined for
 * non-object args.
 */
function coerceArgsObject(args: unknown): Record<string, unknown> | undefined {
  if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args === 'string' && args.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(args) as unknown;
      if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Whether tool-call args carry the `intent` key at all (any value). */
export function hasIntentArg(args: unknown): boolean {
  const obj = coerceArgsObject(args);
  return obj != null && INTENT_ARG in obj;
}

/** Reads the model-authored intent from tool-call args (handles stringified args). */
export function readIntentArg(args: unknown): string | undefined {
  const value = coerceArgsObject(args)?.[INTENT_ARG];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Returns the args without the injected `intent` key so a tool that did not
 * declare the parameter never receives it. Parses stringified JSON object
 * args; returns the value unchanged when the key is absent.
 */
export function stripIntentArg(args: unknown): unknown {
  const obj = coerceArgsObject(args);
  if (!obj || !(INTENT_ARG in obj)) {
    return args;
  }
  const { [INTENT_ARG]: _omit, ...rest } = obj;
  return rest;
}

/**
 * Canonical (frozen) shape of the injected property. Injection embeds a
 * copy so downstream schema tooling that mutates subschemas (JSON-schema
 * dereferencers stamp URI markers) never trips on a frozen shared instance.
 *
 * The description is the SDK's, not a local copy: host-injected tools and
 * SDK-native tools must present the model with one identical instruction, and
 * a divergent copy would also miss the SDK's token trimming.
 */
const INTENT_PROPERTY: JsonSchemaType = Object.freeze<JsonSchemaType>({
  type: 'string',
  description: INTENT_DESCRIPTION,
});

/**
 * Returns a copy of the tool definition with `intent` PREPENDED as the first
 * property of its parameters — first key in the schema means first key in
 * the streamed input, which is what lets the label render before the rest of
 * the args exist. Never mutates the input (built-in defs are frozen and MCP
 * defs may be shared); no-op if the property already exists. Never added to
 * `required`.
 */
export function injectIntentParam(def: LCTool): LCTool {
  const params = def.parameters;
  const existingProps = params?.properties ?? {};
  if (INTENT_ARG in existingProps) {
    return def;
  }
  const nextParams: JsonSchemaType = {
    ...params,
    type: 'object',
    properties: { [INTENT_ARG]: { ...INTENT_PROPERTY }, ...existingProps },
  };
  return { ...def, parameters: nextParams };
}

/**
 * Whether the `intent` param can be cleanly injected into a tool. False for
 * non-object (e.g. string-input/DynamicTool) schemas — rewriting them to an
 * object would break the tool's input contract — and for definitions whose
 * `allowed_callers` never includes `direct` (no card ever renders for a
 * PTC-only tool, so the label would be pure token cost).
 */
function canInjectIntentParam(def: LCTool): boolean {
  const callers = def.allowed_callers;
  if (callers != null && !callers.includes('direct')) {
    return false;
  }
  const params = def.parameters;
  if (params == null) {
    return true;
  }
  return params.type == null || params.type === 'object';
}

/**
 * Discriminates the intent LABEL property (host-injected here, or SDK-native
 * from `@librechat/agents`) from a tool's own business parameter that merely
 * shares the name. Both contracts open with this exact instruction, while an
 * MCP/action tool's real `intent` argument will not — removal paths must
 * never strip a parameter the tool actually needs.
 *
 * Imported rather than redeclared: a local copy that drifts from the SDK's
 * would make every removal path here stop recognizing SDK-native labels, and
 * it would fail OPEN — labels left in schemas, opt-outs silently inert, no
 * error anywhere.
 */
function isIntentLabelProperty(property: JsonSchemaType | undefined): boolean {
  return (
    property != null &&
    property.type === 'string' &&
    typeof property.description === 'string' &&
    property.description.startsWith(INTENT_LABEL_MARKER)
  );
}

/** Returns a copy of the def without the intent LABEL property (marker-guarded). */
function removeIntentParam(def: LCTool): LCTool {
  const params = def.parameters;
  if (params?.properties == null || !isIntentLabelProperty(params.properties[INTENT_ARG])) {
    return def;
  }
  const { [INTENT_ARG]: _omit, ...restProps } = params.properties;
  return { ...def, parameters: { ...params, properties: restProps } };
}

/**
 * Removes the host-injected `intent` param from a tool-definition list. Used
 * to sanitize a self-spawn subagent's inherited inputs so the isolated child
 * path doesn't advertise a schema the parent injected. Only the named
 * (host-injected) tools are touched — SDK-native intent schemas are the
 * tool's own and stay.
 */
export function stripIntentFromToolDefinitions(
  toolDefinitions: LCTool[] | undefined,
  intentToolNames: string[] | undefined,
): LCTool[] {
  const defs = toolDefinitions ?? [];
  const intentSet = new Set(intentToolNames ?? []);
  if (intentSet.size === 0) {
    return defs;
  }
  let changed = false;
  const next = defs.map((def) => {
    if (!intentSet.has(def.name)) {
      return def;
    }
    const stripped = removeIntentParam(def);
    if (stripped !== def) {
      changed = true;
    }
    return stripped;
  });
  return changed ? next : defs;
}

/**
 * Marker-guarded removal of intent LABELS from every definition —
 * host-injected AND SDK-native alike. Used for the schemas the PTC sandbox
 * bridge advertises: no card renders for an inner call, so any label there
 * is pure token cost for the generating model. Business `intent` params
 * survive (marker guard).
 */
export function stripIntentLabelsFromToolDefinitions(
  toolDefinitions: LCTool[] | undefined,
): LCTool[] {
  const defs = toolDefinitions ?? [];
  let changed = false;
  const next = defs.map((def) => {
    const stripped = removeIntentParam(def);
    if (stripped !== def) {
      changed = true;
    }
    return stripped;
  });
  return changed ? next : defs;
}

/**
 * Registry counterpart of {@link stripIntentFromToolDefinitions}. Returns a
 * NEW registry (never mutates the shared parent one) with the injected param
 * removed, so a self-spawn child that uses tool_search/deferred loading
 * can't rediscover a host-injected schema it can't honor.
 */
export function stripIntentFromToolRegistry(
  toolRegistry: LCToolRegistry | undefined,
  intentToolNames: string[] | undefined,
): LCToolRegistry | undefined {
  if (!toolRegistry) {
    return toolRegistry;
  }
  const intentSet = new Set(intentToolNames ?? []);
  if (intentSet.size === 0) {
    return toolRegistry;
  }
  const next: LCToolRegistry = new Map();
  for (const [name, def] of toolRegistry) {
    next.set(name, intentSet.has(name) ? removeIntentParam(def) : def);
  }
  return next;
}

/**
 * Whether a tool is opted into intent labels: an explicit per-tool
 * `describe_intent` wins; native host tools default on.
 */
function isIntentOptedIn(name: string, toolOptions?: AgentToolOptions): boolean {
  const explicit = toolOptions?.[name]?.describe_intent;
  if (explicit != null) {
    return explicit === true;
  }
  return NATIVE_INTENT_TOOL_NAMES.has(name);
}

/**
 * Injects the `intent` param into every opted-in, eligible tool definition,
 * mirroring the injection into the registry entry so a deferred tool
 * discovered later (tool_search reads the registry) arrives with the same
 * schema. Definitions that already declare `intent` (SDK-native tools) are
 * left alone and NOT counted as host-injected — their schema is their own —
 * unless the tool is explicitly opted OUT (`describe_intent: false`), in
 * which case the property is removed so the opt-out actually disables the
 * arg's token cost (the SDK tool bodies tolerate its absence).
 *
 * Both saved agents and ephemeral/model-spec agents reach this with
 * `tool_options` populated, so the logic is written once.
 */
export function applyIntentLabels(params: {
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  toolOptions: AgentToolOptions | undefined;
  /** Extra host-context exclusion, mirroring `applyBackgroundToolCalls`. */
  excludeTool?: (toolName: string) => boolean;
}): { toolDefinitions: LCTool[]; intentToolNames: string[] } {
  const { toolRegistry, toolOptions, excludeTool } = params;
  const defs = params.toolDefinitions ?? [];

  let changed = false;
  const intentToolNames: string[] = [];
  const mirrorRegistryEntry = (def: LCTool): void => {
    const registryEntry = toolRegistry?.get(def.name);
    if (registryEntry) {
      toolRegistry?.set(def.name, { ...registryEntry, parameters: def.parameters });
    }
  };
  const nextDefs = defs.map((def) => {
    if (toolOptions?.[def.name]?.describe_intent === false) {
      const stripped = removeIntentParam(def);
      if (stripped !== def) {
        changed = true;
        mirrorRegistryEntry(stripped);
      }
      return stripped;
    }
    if (!isIntentOptedIn(def.name, toolOptions)) {
      return def;
    }
    if (!isIntentEligibleToolName(def.name) || excludeTool?.(def.name) === true) {
      return def;
    }
    if (!canInjectIntentParam(def)) {
      if (def.allowed_callers == null || def.allowed_callers.includes('direct')) {
        logger.warn(
          `[intent] Skipping describe_intent for "${def.name}": non-object schema cannot carry the injected parameter.`,
        );
      }
      return def;
    }
    const injected = injectIntentParam(def);
    if (injected === def) {
      return def;
    }
    changed = true;
    intentToolNames.push(def.name);
    mirrorRegistryEntry(injected);
    return injected;
  });

  if (!changed) {
    return { toolDefinitions: defs, intentToolNames };
  }
  return { toolDefinitions: nextDefs, intentToolNames };
}

const MCP_ALL_PLACEHOLDER_PREFIX = `${Constants.mcp_all}${Constants.mcp_delimiter}`;

/**
 * Post-registration sanitize pass, run AFTER every tool registration step —
 * including the skill catalog, which appends its definition after the
 * injection pass. Removes intent LABEL properties that must not be
 * advertised: every one when the capability is disabled (the admin kill
 * switch over SDK-native schemas, which otherwise pay the token cost with
 * the feature off), or the explicitly opted-out ones when it is enabled.
 * Marker-guarded, so a tool's own `intent` business parameter survives.
 */
export function sanitizeIntentLabels(params: {
  toolDefinitions: LCTool[] | undefined;
  toolRegistry: LCToolRegistry | undefined;
  toolOptions: AgentToolOptions | undefined;
  capabilityEnabled: boolean;
}): { toolDefinitions: LCTool[] } {
  const { toolRegistry, toolOptions, capabilityEnabled } = params;
  const defs = params.toolDefinitions ?? [];
  const shouldStrip = (name: string): boolean =>
    capabilityEnabled ? toolOptions?.[name]?.describe_intent === false : true;

  let changed = false;
  const nextDefs = defs.map((def) => {
    if (!shouldStrip(def.name)) {
      return def;
    }
    const stripped = removeIntentParam(def);
    if (stripped !== def) {
      changed = true;
      const registryEntry = toolRegistry?.get(def.name);
      if (registryEntry) {
        toolRegistry?.set(def.name, { ...registryEntry, parameters: stripped.parameters });
      }
    }
    return stripped;
  });
  if (toolRegistry) {
    for (const [name, entry] of toolRegistry) {
      if (!shouldStrip(name)) {
        continue;
      }
      const stripped = removeIntentParam(entry);
      if (stripped !== entry) {
        toolRegistry.set(name, stripped);
      }
    }
  }
  return { toolDefinitions: changed ? nextDefs : defs };
}

/**
 * Builds `tool_options` marking each eligible tool as intent-describing for
 * ephemeral and model-spec agents, which carry no per-tool options of their
 * own. Returns undefined when disabled or nothing is eligible.
 *
 * Note: MCP servers that expand lazily (via the `mcp_all` placeholder for
 * overlay/user-connection servers) are not known by name at this point —
 * `applyIntentLabels` matches expanded tool names exactly, so an option
 * recorded under the placeholder would silently never apply. Those entries
 * are skipped rather than synthesized dead; standard cached MCP servers push
 * real names and are covered. Mirrors `synthesizeBackgroundToolOptions`.
 */
export function synthesizeIntentToolOptions(
  tools: string[],
  sources: {
    ephemeralAgent?: { describe_intent?: boolean } | null;
    modelSpec?: { describeIntent?: boolean } | null;
  },
): AgentToolOptions | undefined {
  const enabled =
    sources.ephemeralAgent?.describe_intent === true || sources.modelSpec?.describeIntent === true;
  if (!enabled) {
    return undefined;
  }
  const toolOptions: AgentToolOptions = {};
  for (const name of tools) {
    if (name.startsWith(MCP_ALL_PLACEHOLDER_PREFIX)) {
      continue;
    }
    if (isIntentEligibleToolName(name)) {
      toolOptions[name] = { describe_intent: true };
    }
  }
  return Object.keys(toolOptions).length > 0 ? toolOptions : undefined;
}

/**
 * Deep-merges two synthesized `tool_options` maps per tool key, so the
 * ephemeral background and intent toggles compose instead of overwriting
 * each other's per-tool entries.
 */
export function mergeSynthesizedToolOptions(
  base: AgentToolOptions | undefined,
  extra: AgentToolOptions | undefined,
): AgentToolOptions | undefined {
  if (!extra) {
    return base;
  }
  if (!base) {
    return extra;
  }
  const merged: AgentToolOptions = { ...base };
  for (const [name, options] of Object.entries(extra)) {
    merged[name] = { ...merged[name], ...options };
  }
  return merged;
}
