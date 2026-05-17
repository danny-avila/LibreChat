import { getBrowserTimezone } from './timezones';
import type { TScheduledTask } from 'librechat-data-provider';

export type ScheduledTaskFormState = {
  targetType: 'agent' | 'assistant';
  targetId: string;
  triggerType: 'cron' | 'interval' | 'date';
  expression: string;
  timezone: string;
  payload: {
    text?: string;
    isTemporary?: boolean;
    ephemeralAgent?: {
      web_search?: boolean;
      file_search?: boolean;
      execute_code?: boolean;
      mcp?: string[];
    };
  };
  status: 'active' | 'paused' | 'completed' | 'failed';
};

/**
 * Default form state for a new scheduled task. The timezone is resolved from
 * the browser at call time so different users see their own zone selected.
 */
export function buildInitialTask(): ScheduledTaskFormState {
  return {
    targetType: 'agent',
    targetId: '',
    triggerType: 'cron',
    expression: '0 * * * *',
    timezone: getBrowserTimezone(),
    payload: {
      text: '',
      isTemporary: false,
      ephemeralAgent: {
        web_search: false,
        file_search: false,
        execute_code: false,
        mcp: [],
      },
    },
    status: 'active',
  };
}

/**
 * Maps a persisted scheduled task into the editor's form state. Optional
 * payload fields are filled with sensible defaults so the form never receives
 * `undefined` values for controlled inputs.
 */
export function taskToFormState(task: TScheduledTask): ScheduledTaskFormState {
  return {
    targetType: task.targetType,
    targetId: task.targetId,
    triggerType: task.triggerType,
    expression: task.expression,
    timezone: task.timezone || getBrowserTimezone(),
    payload: {
      text: task.payload?.text ?? '',
      isTemporary: task.payload?.isTemporary ?? false,
      ephemeralAgent: {
        web_search: task.payload?.ephemeralAgent?.web_search ?? false,
        file_search: task.payload?.ephemeralAgent?.file_search ?? false,
        execute_code: task.payload?.ephemeralAgent?.execute_code ?? false,
        mcp: task.payload?.ephemeralAgent?.mcp ?? [],
      },
    },
    status: task.status,
  };
}

/**
 * Pure helper returning the next status when toggling pause / resume on a
 * task. Centralized here so the UI and tests share one source of truth.
 */
export function nextPauseStatus(
  current: ScheduledTaskFormState['status'],
): ScheduledTaskFormState['status'] {
  return current === 'paused' ? 'active' : 'paused';
}
