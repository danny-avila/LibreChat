import { getBrowserTimezone } from './timezones';
import type { TScheduledTask } from 'librechat-data-provider';

/**
 * Form state for the Scheduled Tasks builder.
 *
 * The new builder always emits `targetType: 'model'` tasks: the user picks a
 * provider (`endpoint`) and model, optionally toggles capabilities/MCP, and
 * the job processor runs an ephemeral agent on their behalf. The form keeps a
 * dedicated `endpoint`/`model` pair instead of overloading `targetId` so the
 * UI is straightforward to bind.
 */
export type ScheduledTaskFormState = {
  endpoint: string;
  model: string;
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
    endpoint: '',
    model: '',
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
 *
 * Legacy `agent` / `assistant` tasks land in the editor with empty model
 * fields; the user must pick a model to convert them to the new flow.
 */
export function taskToFormState(task: TScheduledTask): ScheduledTaskFormState {
  return {
    endpoint: task.payload?.endpoint ?? '',
    model: task.payload?.model ?? (task.targetType === 'model' ? task.targetId : ''),
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

/**
 * Converts the form state into the request body expected by the
 * scheduled-tasks API. Centralized here so create + edit emit the same shape.
 */
export function formStateToCreatePayload(state: ScheduledTaskFormState) {
  return {
    targetType: 'model' as const,
    targetId: state.model,
    triggerType: 'cron' as const,
    expression: state.expression,
    timezone: state.timezone || undefined,
    status: state.status,
    payload: {
      text: state.payload.text ?? '',
      isTemporary: state.payload.isTemporary === true,
      endpoint: state.endpoint,
      model: state.model,
      ephemeralAgent: state.payload.ephemeralAgent,
    },
  };
}

/**
 * Lightweight cron validator mirroring the backend regex in
 * `packages/api/src/tasks/cron.ts`. Returns `true` for any 5-field cron
 * expression with valid fields (numbers, ranges, lists, steps, or named
 * months/days). Used for inline feedback before submission.
 */
const CRON_FIELD = /^(?:\*|\d+|[a-zA-Z]+)(?:-(?:\d+|[a-zA-Z]+))?(?:\/\d+)?$/;

export function isValidCronExpression(expression: string): boolean {
  if (typeof expression !== 'string') {
    return false;
  }
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }
  return fields.every(
    (field) =>
      field === '*' ||
      field.split(',').every((token) => token.length > 0 && CRON_FIELD.test(token)),
  );
}
