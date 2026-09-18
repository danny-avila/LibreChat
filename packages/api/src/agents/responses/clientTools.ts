/**
 * Client-side tool execution for the Open Responses API.
 *
 * A caller may declare function tools it will execute itself:
 *
 *   POST /v1/responses
 *   { "model": "...", "input": "...",
 *     "tools": [{ "type": "function", "name": "open_service_page",
 *                 "parameters": { ... } }] }
 *
 * Such a tool is made visible to the model but is never executed on the server.
 * When the model calls one, the run ends and the call is handed back as a
 * `function_call` output item. The caller executes it and continues the
 * conversation by sending a `function_call_output` input item alongside
 * `previous_response_id` — the inbound conversion for which already exists
 * (`convertInputToMessages`).
 *
 * This is the stateless shape OpenAI defines: no run is suspended, nothing is
 * checkpointed, and no per-caller state is held between the two requests.
 */
import type { StandardGraph, LCTool } from '@librechat/agents';
import type { FunctionTool, Tool } from './types';

/** JSON Schema stand-in for a tool that declares no parameters. */
const EMPTY_PARAMETERS = { type: 'object', properties: {} } as const;

/**
 * Matches the character set OpenAI accepts for function names, so a tool that
 * works against their API works here without renaming.
 */
const CLIENT_TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** A tool entry the caller will execute itself. */
function isFunctionTool(tool: Tool | undefined | null): tool is FunctionTool {
  return tool?.type === 'function';
}

/**
 * Why the request's `tools` cannot be declared, or undefined when they can.
 *
 * Only `type: 'function'` entries are treated as client tools. Other entries are
 * hosted/provider tools that the server owns, and are left alone so that adding
 * a client tool to a request cannot quietly disable them.
 */
export function validateClientTools(tools: unknown): string | undefined {
  if (tools === undefined) {
    return undefined;
  }
  if (!Array.isArray(tools)) {
    return 'tools must be an array';
  }

  const names = new Set<string>();
  for (const tool of tools as Tool[]) {
    if (!isFunctionTool(tool)) {
      continue;
    }
    const { name, description, parameters } = tool;

    if (typeof name !== 'string' || name === '') {
      return 'each function tool requires a name';
    }
    if (!CLIENT_TOOL_NAME_PATTERN.test(name)) {
      return `function tool name may contain only letters, digits, underscores and hyphens: ${name}`;
    }
    if (names.has(name)) {
      return `duplicate function tool name: ${name}`;
    }
    if (description != null && typeof description !== 'string') {
      return `function tool description must be a string: ${name}`;
    }
    if (parameters != null && (typeof parameters !== 'object' || Array.isArray(parameters))) {
      return `function tool parameters must be a JSON Schema object: ${name}`;
    }
    names.add(name);
  }

  return undefined;
}

/**
 * The request's function tools as model-visible definitions, with no
 * server-side executor. Assumes {@link validateClientTools} already passed.
 */
export function buildClientToolDefinitions(tools: Tool[] | undefined | null): LCTool[] {
  if (tools == null) {
    return [];
  }
  return tools.filter(isFunctionTool).map(({ name, description, parameters }) => ({
    name,
    ...(typeof description === 'string' && description !== '' ? { description } : {}),
    parameters: (parameters ?? EMPTY_PARAMETERS) as LCTool['parameters'],
    /** Callable by the model itself, and by nothing else. */
    allowed_callers: ['direct' as const],
  }));
}

/**
 * Appends the client tools to an agent's model-visible definitions.
 *
 * A caller-declared name never displaces a server tool: on collision the
 * server's definition wins and the client's is dropped, so a request cannot
 * shadow (and thereby suppress) a tool the agent is configured to run. The
 * dropped names are returned so the run does not later mistake the surviving
 * server tool for a client one.
 */
export function mergeClientToolDefinitions(
  agentDefinitions: LCTool[] | undefined,
  clientDefinitions: LCTool[],
): { toolDefinitions: LCTool[]; names: Set<string>; shadowed: string[] } {
  const existing = agentDefinitions ?? [];
  if (clientDefinitions.length === 0) {
    return { toolDefinitions: existing, names: new Set<string>(), shadowed: [] };
  }

  const serverNames = new Set(existing.map((definition) => definition.name));
  const shadowed: string[] = [];
  const accepted: LCTool[] = [];
  const names = new Set<string>();

  for (const definition of clientDefinitions) {
    if (serverNames.has(definition.name)) {
      shadowed.push(definition.name);
      continue;
    }
    accepted.push(definition);
    names.add(definition.name);
  }

  return { toolDefinitions: [...existing, ...accepted], names, shadowed };
}

interface RunStepHandler {
  handle: (event: string, data: unknown, metadata?: unknown, graph?: StandardGraph) => void;
}

/**
 * Wraps the run-step handler so that a call to a caller-declared tool ends the
 * run instead of being executed on the server.
 *
 * The SDK routes a model turn to the tool node only while some tool call on the
 * message is *not* in `graph.invokedToolIds` (`toolsCondition`); once every call
 * is marked, the turn routes to END instead. That is exactly the semantics here
 * — the call was invoked, by the caller rather than by us — and it is why the
 * run stops with `status: 'completed'` rather than aborting or looping an error
 * result back to the model.
 *
 * Two orderings matter. The delegate records the call first, which is what puts
 * the `function_call` item into the response the caller receives. And the marks
 * must land before the agent node returns: they are written from `on_run_step`,
 * which the SDK dispatches while the model's tool calls are still streaming, so
 * they precede routing. That second ordering is the one part of the mechanism
 * unit tests cannot prove — it needs an integration test against the pinned SDK
 * build.
 *
 * Known gap: `toolsCondition` marks a turn invoked only when *every* call on it
 * is, so a model that calls a client tool and a server tool in the same batch
 * still enters the tool node and the client call fails there as an unknown tool.
 */
export function createClientToolRunStepHandler({
  delegate,
  clientToolNames,
}: {
  delegate: RunStepHandler;
  clientToolNames: Set<string>;
}): RunStepHandler {
  if (clientToolNames.size === 0) {
    return delegate;
  }
  return {
    handle: (event, data, metadata, graph) => {
      delegate.handle(event, data, metadata, graph);
      if (graph == null) {
        return;
      }
      const stepData = data as {
        stepDetails?: { tool_calls?: Array<{ id?: string; name?: string }> };
      };
      const invoked = graph.invokedToolIds ?? new Set<string>();
      for (const toolCall of stepData?.stepDetails?.tool_calls ?? []) {
        if (
          toolCall?.id != null &&
          toolCall.id !== '' &&
          clientToolNames.has(toolCall.name ?? '')
        ) {
          invoked.add(toolCall.id);
        }
      }
      graph.invokedToolIds = invoked;
    },
  };
}
