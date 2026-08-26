import { Constants } from '@librechat/agents';
import type { HookCallback, PostToolUseHookOutput, SubagentTaskConfig } from '@librechat/agents';

export const SUBAGENT_COMPLETION_DELIVERY = 'wakeup';

/** Host-owned detached-subagent scope with its model-facing result-delivery contract. */
export interface HostSubagentTaskConfig extends SubagentTaskConfig {
  completionDelivery?: typeof SUBAGENT_COMPLETION_DELIVERY;
}

export const SUBAGENT_WAKEUP_GUIDANCE =
  'Automatic completion delivery is enabled for this subagent task. Continue independent work if available; otherwise end this turn and the host will resume you when the task finishes. Do not repeatedly poll an unchanged running task. Use check_background_task only for explicit status or control, or as a fallback if automatic delivery is unavailable.';

export function usesSubagentCompletionWakeups(
  config: SubagentTaskConfig | undefined,
): config is HostSubagentTaskConfig {
  return (
    (config as HostSubagentTaskConfig | undefined)?.completionDelivery ===
    SUBAGENT_COMPLETION_DELIVERY
  );
}

function parseOutput(output: unknown): Record<string, unknown> | undefined {
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  if (typeof output !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(output) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Replaces the SDK's legacy poll-first handle with the host's durable delivery contract. */
export function createSubagentWakeupHandleHook(): HookCallback<'PostToolUse'> {
  return async (input): Promise<PostToolUseHookOutput> => {
    if (input.toolName !== String(Constants.SUBAGENT)) {
      return {};
    }
    const output = parseOutput(input.toolOutput);
    if (
      output?.status !== 'running' ||
      typeof output.background_task_id !== 'string' ||
      output.background_task_id === ''
    ) {
      return {};
    }
    const updated = { ...output, message: SUBAGENT_WAKEUP_GUIDANCE };
    return {
      updatedOutput: typeof input.toolOutput === 'string' ? JSON.stringify(updated) : updated,
    };
  };
}
