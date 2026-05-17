/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { TScheduledTask } from 'librechat-data-provider';
import { buildInitialTask, nextPauseStatus, taskToFormState } from '../helpers';

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
    expect(state.targetType).toBe('agent');
    expect(state.triggerType).toBe('cron');
    expect(state.expression).toBe('0 * * * *');
    expect(state.status).toBe('active');
    expect(state.payload.text).toBe('');
    expect(state.payload.isTemporary).toBe(false);
    expect(state.payload.ephemeralAgent).toEqual({
      web_search: false,
      file_search: false,
      execute_code: false,
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
    targetType: 'agent',
    targetId: 'agent_42',
    triggerType: 'cron',
    expression: '0 9 * * 1-5',
    timezone: 'America/New_York',
    payload: {
      text: 'morning summary',
      isTemporary: false,
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
      targetType: 'agent',
      targetId: 'agent_42',
      triggerType: 'cron',
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
      payload: {},
    });
    expect(state.payload.text).toBe('');
    expect(state.payload.isTemporary).toBe(false);
    expect(state.payload.ephemeralAgent).toEqual({
      web_search: false,
      file_search: false,
      execute_code: false,
      mcp: [],
    });
  });

  it('preserves a paused status round-trip', () => {
    expect(taskToFormState({ ...baseTask, status: 'paused' }).status).toBe('paused');
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
