import { HookRegistry, matchesQuery } from '@librechat/agents';
import type {
  HookInput,
  HookOutput,
  HookMatcher,
  HookCallback,
  HookEvent,
  PostToolBatchEntry,
} from '@librechat/agents';
import type { PluginHookCapabilities, PluginHookPlan } from './compatibility';
import type { PluginHookHandler, PluginHooksDocument } from './schema';
import { planPluginHooks } from './compatibility';

export interface PluginHookRuntimeContext {
  sessionId?: string;
  cwd?: string;
  transcriptPath?: string | null;
  permissionMode?: string;
  sessionStartSource?: string;
}

export interface PluginHookBatchToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  tool_response?: unknown;
}

export interface PluginHookPayload {
  hook_event_name: string;
  session_id: string;
  run_id: string;
  thread_id?: string;
  cwd?: string;
  transcript_path?: string | null;
  permission_mode?: string;
  source?: string;
  agent_id?: string;
  executing_agent_id?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  tool_response?: unknown;
  error?: string;
  last_assistant_message?: string;
  reason?: string;
  agent_type?: string;
  stop_hook_active?: boolean;
  trigger?: string;
  compact_summary?: string;
  messages_before_count?: number;
  messages_after_count?: number;
  tool_calls?: PluginHookBatchToolCall[];
}

export interface PluginHookExecutionRequest {
  pluginId: string;
  sourceEvent: string;
  targetEvent: HookEvent;
  handler: PluginHookHandler;
  condition?: string;
  input: HookInput;
  payload: PluginHookPayload;
}

/**
 * Host-owned boundary for executing a planned hook.
 * This compatibility layer never launches plugin code in the LibreChat API process.
 */
export interface PluginHookExecutor {
  capabilities: PluginHookCapabilities;
  execute(
    request: PluginHookExecutionRequest,
    signal: AbortSignal,
  ): HookOutput | Promise<HookOutput>;
}

export interface RegisterPluginHooksOptions {
  pluginId: string;
  registry: HookRegistry;
  document: PluginHooksDocument;
  executor: PluginHookExecutor;
  context?: PluginHookRuntimeContext;
}

export interface PluginHookRegistration {
  plan: PluginHookPlan;
  registered: number;
  unregister: () => void;
}

interface PluginHookPayloadState {
  compactTrigger?: string;
  toPluginToolName?: (toolName: string) => string;
}

function getSessionId(input: HookInput, context: PluginHookRuntimeContext): string {
  return context.sessionId ?? input.threadId ?? input.runId;
}

function toClaudeCompactTrigger(trigger: string | undefined): string | undefined {
  if (!trigger) {
    return undefined;
  }
  return trigger === 'manual' ? 'manual' : 'auto';
}

function getPluginToolName(toolName: string, state: PluginHookPayloadState): string {
  if (!state.toPluginToolName) {
    return toolName;
  }
  const translated = state.toPluginToolName(toolName);
  if (!translated?.trim()) {
    throw new Error(`No plugin tool-name mapping is available for "${toolName}"`);
  }
  return translated;
}

function getMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return undefined;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const text = content
    .flatMap((block) => {
      if (typeof block === 'string') {
        return [block];
      }
      if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
        return [block.text];
      }
      return [];
    })
    .join('\n');
  return text || undefined;
}

function toPluginBatchToolCall(
  entry: PostToolBatchEntry,
  state: PluginHookPayloadState,
): PluginHookBatchToolCall {
  const toolResponse = entry.status === 'success' ? entry.toolOutput : entry.error;
  return {
    tool_name: getPluginToolName(entry.toolName, state),
    tool_input: entry.toolInput,
    tool_use_id: entry.toolUseId,
    ...(toolResponse !== undefined && { tool_response: toolResponse }),
  };
}

function basePayload(
  sourceEvent: string,
  input: HookInput,
  context: PluginHookRuntimeContext,
): PluginHookPayload {
  const sessionId = getSessionId(input, context);
  return {
    hook_event_name: sourceEvent,
    session_id: sessionId,
    run_id: input.runId,
    ...(input.threadId !== undefined && { thread_id: input.threadId }),
    ...(context.cwd !== undefined && { cwd: context.cwd }),
    ...(context.transcriptPath !== undefined && { transcript_path: context.transcriptPath }),
    ...(context.permissionMode !== undefined && { permission_mode: context.permissionMode }),
    ...(input.agentId !== undefined && { agent_id: input.agentId }),
    ...(input.executingAgentId !== undefined && {
      executing_agent_id: input.executingAgentId,
    }),
  };
}

export function createPluginHookPayload(
  sourceEvent: string,
  input: HookInput,
  context: PluginHookRuntimeContext = {},
  state: PluginHookPayloadState = {},
): PluginHookPayload {
  const payload = basePayload(sourceEvent, input, context);

  switch (input.hook_event_name) {
    case 'RunStart':
      return {
        ...payload,
        ...(sourceEvent === 'SessionStart' && {
          source: context.sessionStartSource ?? 'startup',
        }),
      };
    case 'UserPromptSubmit':
      return { ...payload, prompt: input.prompt };
    case 'PreToolUse':
      return {
        ...payload,
        tool_name: getPluginToolName(input.toolName, state),
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
      };
    case 'PostToolUse':
      return {
        ...payload,
        tool_name: getPluginToolName(input.toolName, state),
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        tool_response: input.toolOutput,
      };
    case 'PostToolUseFailure':
      return {
        ...payload,
        tool_name: getPluginToolName(input.toolName, state),
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        error: input.error,
      };
    case 'PostToolBatch':
      return {
        ...payload,
        tool_calls: input.entries.map((entry) => toPluginBatchToolCall(entry, state)),
      };
    case 'PermissionDenied':
      return {
        ...payload,
        tool_name: getPluginToolName(input.toolName, state),
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        reason: input.reason,
      };
    case 'SubagentStart':
    case 'SubagentStop':
      return { ...payload, agent_type: input.agentType };
    case 'Stop':
      return { ...payload, stop_hook_active: input.stopHookActive };
    case 'StopFailure': {
      const lastAssistantMessage = getMessageText(input.lastAssistantMessage);
      return {
        ...payload,
        error: input.error,
        ...(lastAssistantMessage !== undefined && {
          last_assistant_message: lastAssistantMessage,
        }),
      };
    }
    case 'PreCompact':
      return {
        ...payload,
        trigger: toClaudeCompactTrigger(input.trigger),
        messages_before_count: input.messagesBeforeCount,
      };
    case 'PostCompact':
      return {
        ...payload,
        ...(state.compactTrigger !== undefined && {
          trigger: toClaudeCompactTrigger(state.compactTrigger),
        }),
        compact_summary: input.summary,
        messages_after_count: input.messagesAfterCount,
      };
  }
}

function getHookTimeoutMs(
  sourceEvent: string,
  handler: PluginHookHandler,
  configuredTimeoutMs: number | undefined,
): number | undefined {
  if (configuredTimeoutMs !== undefined) {
    return configuredTimeoutMs;
  }
  if (handler.type === 'command') {
    return sourceEvent === 'UserPromptSubmit' ? 30_000 : 600_000;
  }
  if (handler.type === 'prompt') {
    return 30_000;
  }
  return undefined;
}

function getHandlerIdentity(
  sourceEvent: string,
  handler: PluginHookHandler,
  condition: string | undefined,
): string {
  const handlerProperties = Object.entries(handler)
    .filter(([key]) => key !== 'if')
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([sourceEvent, condition ?? null, handlerProperties]);
}

export function registerPluginHooks(options: RegisterPluginHooksOptions): PluginHookRegistration {
  const { pluginId, registry, document, executor, context = {} } = options;
  const plan = planPluginHooks(document, executor.capabilities);
  const unregisters: Array<() => void> = [];
  const compactTriggers = new Map<string, string>();
  const executedHandlers = new WeakMap<HookInput, Set<string>>();
  const tracksCompactTriggers = plan.entries.some(
    (entry) => entry.status === 'ready' && entry.targetEvent === 'PostCompact',
  );
  let registered = 0;

  if (tracksCompactTriggers) {
    const trackCompactTrigger: HookCallback<'PreCompact'> = (input) => {
      compactTriggers.set(getSessionId(input, context), input.trigger);
      return {};
    };
    unregisters.push(
      registry.register('PreCompact', {
        hooks: [trackCompactTrigger],
        internal: true,
      }),
    );
  }

  for (const entry of plan.entries) {
    if (entry.status !== 'ready' || entry.targetEvent === undefined) {
      continue;
    }
    const targetEvent = entry.targetEvent;
    const seenSessionIds = new Set<string>();
    const handlerIdentity = getHandlerIdentity(entry.sourceEvent, entry.handler, entry.condition);
    const toolNameTranslator = executor.capabilities.toPluginToolName;
    const toPluginToolName =
      toolNameTranslator === undefined
        ? undefined
        : (toolName: string): string =>
            toolNameTranslator({
              sourceEvent: entry.sourceEvent,
              targetEvent,
              toolName,
            });
    let hasFired = false;
    const hook: HookCallback<HookEvent> = (input, signal) => {
      const sessionId = getSessionId(input, context);
      const compactTrigger = compactTriggers.get(sessionId);
      if (entry.sourceEvent === 'SessionStart') {
        const source = context.sessionStartSource ?? 'startup';
        if (!matchesQuery(entry.matcher, source) || seenSessionIds.has(sessionId)) {
          return {};
        }
        seenSessionIds.add(sessionId);
      }
      if (
        targetEvent === 'PreCompact' &&
        input.hook_event_name === 'PreCompact' &&
        !matchesQuery(entry.matcher, input.trigger)
      ) {
        return {};
      }
      if (
        targetEvent === 'PostCompact' &&
        input.hook_event_name === 'PostCompact' &&
        (compactTrigger === undefined || !matchesQuery(entry.matcher, compactTrigger))
      ) {
        return {};
      }
      if (entry.handler.once === true && hasFired) {
        return {};
      }
      const handlersForInput = executedHandlers.get(input);
      if (handlersForInput?.has(handlerIdentity) === true) {
        return {};
      }
      if (handlersForInput) {
        handlersForInput.add(handlerIdentity);
      } else {
        executedHandlers.set(input, new Set([handlerIdentity]));
      }
      hasFired = true;
      return executor.execute(
        {
          pluginId,
          sourceEvent: entry.sourceEvent,
          targetEvent,
          handler: entry.handler,
          ...(entry.condition !== undefined && { condition: entry.condition }),
          input,
          payload: createPluginHookPayload(entry.sourceEvent, input, context, {
            compactTrigger,
            toPluginToolName,
          }),
        },
        signal,
      );
    };
    const runtimeFiltered =
      entry.sourceEvent === 'SessionStart' ||
      targetEvent === 'PreCompact' ||
      targetEvent === 'PostCompact';
    const timeoutMs = getHookTimeoutMs(entry.sourceEvent, entry.handler, entry.timeoutMs);
    const matcher: HookMatcher<HookEvent> = {
      hooks: [hook],
      ...(!runtimeFiltered && entry.matcher !== undefined && { pattern: entry.matcher }),
      ...(timeoutMs !== undefined && { timeout: timeoutMs }),
      ...(!runtimeFiltered && entry.handler.once === true && { once: true }),
    };
    unregisters.push(registry.register(targetEvent, matcher));
    registered++;
  }

  if (tracksCompactTriggers) {
    const clearCompactTrigger: HookCallback<'PostCompact'> = (input) => {
      compactTriggers.delete(getSessionId(input, context));
      return {};
    };
    unregisters.push(
      registry.register('PostCompact', {
        hooks: [clearCompactTrigger],
        internal: true,
      }),
    );
  }

  let active = true;
  return {
    plan,
    registered,
    unregister: () => {
      if (!active) {
        return;
      }
      active = false;
      compactTriggers.clear();
      for (let index = unregisters.length - 1; index >= 0; index--) {
        unregisters[index]();
      }
    },
  };
}
