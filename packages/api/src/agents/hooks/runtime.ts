import { HookRegistry } from '@librechat/agents';
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
  reason?: string;
  agent_type?: string;
  stop_hook_active?: boolean;
  trigger?: string;
  summary?: string;
  messages_before_count?: number;
  messages_after_count?: number;
  entries?: PostToolBatchEntry[];
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

function basePayload(
  sourceEvent: string,
  input: HookInput,
  context: PluginHookRuntimeContext,
): PluginHookPayload {
  const sessionId = context.sessionId ?? input.threadId ?? input.runId;
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
        tool_name: input.toolName,
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
      };
    case 'PostToolUse':
      return {
        ...payload,
        tool_name: input.toolName,
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        tool_response: input.toolOutput,
      };
    case 'PostToolUseFailure':
      return {
        ...payload,
        tool_name: input.toolName,
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        error: input.error,
      };
    case 'PostToolBatch':
      return { ...payload, entries: input.entries };
    case 'PermissionDenied':
      return {
        ...payload,
        tool_name: input.toolName,
        tool_input: input.toolInput,
        tool_use_id: input.toolUseId,
        reason: input.reason,
      };
    case 'SubagentStart':
    case 'SubagentStop':
      return { ...payload, agent_type: input.agentType };
    case 'Stop':
      return { ...payload, stop_hook_active: input.stopHookActive };
    case 'StopFailure':
      return { ...payload, error: input.error };
    case 'PreCompact':
      return {
        ...payload,
        trigger: input.trigger,
        messages_before_count: input.messagesBeforeCount,
      };
    case 'PostCompact':
      return {
        ...payload,
        summary: input.summary,
        messages_after_count: input.messagesAfterCount,
      };
  }
}

export function registerPluginHooks(options: RegisterPluginHooksOptions): PluginHookRegistration {
  const { pluginId, registry, document, executor, context = {} } = options;
  const plan = planPluginHooks(document, executor.capabilities);
  const unregisters: Array<() => void> = [];

  for (const entry of plan.entries) {
    if (entry.status !== 'ready' || entry.targetEvent === undefined) {
      continue;
    }
    const targetEvent = entry.targetEvent;
    const hook: HookCallback<HookEvent> = (input, signal) =>
      executor.execute(
        {
          pluginId,
          sourceEvent: entry.sourceEvent,
          targetEvent,
          handler: entry.handler,
          ...(entry.condition !== undefined && { condition: entry.condition }),
          input,
          payload: createPluginHookPayload(entry.sourceEvent, input, context),
        },
        signal,
      );
    const matcher: HookMatcher<HookEvent> = {
      hooks: [hook],
      ...(entry.matcher !== undefined && { pattern: entry.matcher }),
      ...(entry.timeoutMs !== undefined && { timeout: entry.timeoutMs }),
    };
    unregisters.push(registry.register(targetEvent, matcher));
  }

  let active = true;
  return {
    plan,
    registered: unregisters.length,
    unregister: () => {
      if (!active) {
        return;
      }
      active = false;
      for (let index = unregisters.length - 1; index >= 0; index--) {
        unregisters[index]();
      }
    },
  };
}
