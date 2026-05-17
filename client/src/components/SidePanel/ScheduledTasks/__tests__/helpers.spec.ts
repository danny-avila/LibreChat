/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { TScheduledTask } from 'librechat-data-provider';
import {
  buildInitialTask,
  nextPauseStatus,
  taskToFormState,
  formStateToCreatePayload,
  isValidCronExpression,
} from '../helpers';

const FROZEN_TZ = 'Asia/Kolkata';

beforeEach(() => {
  jest
    .spyOn(Intl, 'DateTimeFormat')
    .mockImplementation((() => ({
      resolvedOptions: () => ({ timeZone: FROZEN_TZ }) as Intl.ResolvedDateTimeFormatOptions,
    })) as unknown as typeof Intl.DateTimeFormat);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('buildInitialTask', () => {
  it('returns sensible defaults for a brand-new task', () => {
    const state = buildInitialTask();
    expect(state.endpoint).toBe('');
    expect(state.model).toBe('');
    expect(state.expression).toBe('0 * * * *');
    expect(state.status).toBe('active');
    expect(state.payload.text).toBe('');
    expect(state.payload.isTemporary).toBe(false);
    expect(state.payload.ephemeralAgent).toEqual({
      web_search: false,
      file_search: false,
      execute_code: false,
      skills: false,
      mcp: [],
    });
  });

  it("uses the browser's detected timezone", () => {
    expect(buildInitialTask().timezone).toBe(FROZEN_TZ);
  });
});

describe('taskToFormState', () => {
  const baseTask: TScheduledTask = {
    _id: 'task_1',
    userId: 'user_1',
    targetType: 'model',
    targetId: 'claude-3-5-sonnet',
    triggerType: 'cron',
    expression: '0 9 * * 1-5',
    timezone: 'America/New_York',
    payload: {
      text: 'morning summary',
      isTemporary: false,
      endpoint: 'bedrock',
      model: 'claude-3-5-sonnet',
      ephemeralAgent: {
        web_search: true,
        file_search: false,
        execute_code: true,
        mcp: ['github', 'jira'],
      },
    },
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };

  it('maps every editable field from a persisted task', () => {
    const state = taskToFormState(baseTask);
    expect(state).toEqual({
      endpoint: 'bedrock',
      model: 'claude-3-5-sonnet',
      expression: '0 9 * * 1-5',
      timezone: 'America/New_York',
      status: 'active',
      payload: {
        text: 'morning summary',
        isTemporary: false,
        ephemeralAgent: {
          web_search: true,
          file_search: false,
          execute_code: true,
          skills: false,
          mcp: ['github', 'jira'],
        },
      },
    });
  });

  it("falls back to the browser timezone when the task has none stored", () => {
    const state = taskToFormState({ ...baseTask, timezone: undefined });
    expect(state.timezone).toBe(FROZEN_TZ);
  });

  it('replaces missing payload fields with controlled-input defaults', () => {
    const state = taskToFormState({
      ...baseTask,
      payload: { endpoint: 'bedrock', model: 'claude-3-5-sonnet' },
    });
    expect(state.payload.text).toBe('');
    expect(state.payload.isTemporary).toBe(false);
    expect(state.payload.ephemeralAgent).toEqual({
      web_search: false,
      file_search: false,
      execute_code: false,
      skills: false,
      mcp: [],
    });
  });

  it('preserves a paused status round-trip', () => {
    expect(taskToFormState({ ...baseTask, status: 'paused' }).status).toBe('paused');
  });

  it('falls back to legacy targetId for model name when payload.model is missing', () => {
    const legacy = taskToFormState({ ...baseTask, payload: { endpoint: 'bedrock' } });
    expect(legacy.model).toBe('claude-3-5-sonnet');
  });

  it('round-trips the ephemeral skills toggle', () => {
    const state = taskToFormState({
      ...baseTask,
      payload: {
        ...baseTask.payload,
        ephemeralAgent: { ...baseTask.payload.ephemeralAgent, skills: true },
      },
    });
    expect(state.payload.ephemeralAgent?.skills).toBe(true);
  });
});

describe('nextPauseStatus', () => {
  it('flips active → paused', () => {
    expect(nextPauseStatus('active')).toBe('paused');
  });

  it('flips paused → active', () => {
    expect(nextPauseStatus('paused')).toBe('active');
  });

  it('moves any other terminal state to paused (defensive)', () => {
    expect(nextPauseStatus('completed')).toBe('paused');
    expect(nextPauseStatus('failed')).toBe('paused');
  });
});

describe('formStateToCreatePayload', () => {
  it('emits a model-target payload with endpoint and model stored under payload', () => {
    const state = buildInitialTask();
    state.endpoint = 'openAI';
    state.model = 'gpt-4o';
    state.payload.text = 'daily digest';
    state.payload.ephemeralAgent = {
      web_search: true,
      file_search: false,
      execute_code: false,
      mcp: ['memory'],
    };

    const payload = formStateToCreatePayload(state);
    expect(payload.targetType).toBe('model');
    expect(payload.targetId).toBe('gpt-4o');
    expect(payload.triggerType).toBe('cron');
    expect(payload.payload.endpoint).toBe('openAI');
    expect(payload.payload.model).toBe('gpt-4o');
    expect(payload.payload.ephemeralAgent?.mcp).toEqual(['memory']);
  });

  it('drops the timezone field when empty so the server applies its default', () => {
    const state = buildInitialTask();
    state.endpoint = 'openAI';
    state.model = 'gpt-4o';
    state.timezone = '';
    expect(formStateToCreatePayload(state).timezone).toBeUndefined();
  });
});

describe('isValidCronExpression', () => {
  it.each(['0 * * * *', '*/15 * * * *', '0 9 * * 1-5', '0,15,30,45 9 * * *'])(
    'accepts %s',
    (expr) => {
      expect(isValidCronExpression(expr)).toBe(true);
    },
  );

  it.each(['', 'not-a-cron', '0 * * *', '0 * * * * *', 'invalid'])('rejects %s', (expr) => {
    expect(isValidCronExpression(expr)).toBe(false);
  });
});
