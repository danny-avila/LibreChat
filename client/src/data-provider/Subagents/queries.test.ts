import { renderHook } from '@testing-library/react';
import type { SubagentThreadView } from 'librechat-data-provider';
import {
  isSubagentReadinessPending,
  subagentThreadRefetchInterval,
  useSubagentThreadQuery,
} from './queries';

const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const view = (status: SubagentThreadView['status']): SubagentThreadView =>
  ({ status }) as SubagentThreadView;

describe('subagent thread refresh policy', () => {
  it('bounds child-readiness retries and keeps active work fresh', () => {
    expect(subagentThreadRefetchInterval(undefined, 1_000, 500)).toBe(2_000);
    expect(subagentThreadRefetchInterval(view('dispatched'), 1_000, 500)).toBe(2_000);
    expect(subagentThreadRefetchInterval(undefined, 1_000, 1_000)).toBe(false);
    expect(subagentThreadRefetchInterval(view('dispatched'), 1_000, 1_000)).toBe(false);
    expect(subagentThreadRefetchInterval(view('running'), 1_000, 10_000)).toBe(2_000);
  });

  it.each(['completed', 'failed', 'interrupted', 'cancelled'] as const)(
    'stops polling terminal %s threads',
    (status) => {
      expect(subagentThreadRefetchInterval(view(status), 1_000, 500)).toBe(false);
    },
  );

  it('keeps polling a cached terminal thread until the selected task appears', () => {
    const prior = {
      ...view('completed'),
      messages: [{ messageId: 'old-task:assistant' }],
    } as SubagentThreadView;
    const current = {
      ...view('completed'),
      messages: [{ messageId: 'new-task:assistant' }],
    } as SubagentThreadView;

    expect(subagentThreadRefetchInterval(prior, 1_000, 500, 'new-task')).toBe(2_000);
    expect(subagentThreadRefetchInterval(current, 1_000, 500, 'new-task')).toBe(false);
    expect(subagentThreadRefetchInterval(prior, 1_000, 1_000, 'new-task')).toBe(false);
  });

  it('stops polling an older API view once the exact task response exists', () => {
    const rollingDeployView = {
      ...view('running'),
      messages: [{ messageId: 'selected:assistant' }],
    } as SubagentThreadView;

    expect(subagentThreadRefetchInterval(rollingDeployView, 1_000, 500, 'selected')).toBe(false);
  });

  it('treats only readiness-window 404s as pending', () => {
    expect(isSubagentReadinessPending({ response: { status: 404 } }, 1_000, 500)).toBe(true);
    expect(isSubagentReadinessPending({ response: { status: 404 } }, 1_000, 1_000)).toBe(false);
    expect(isSubagentReadinessPending({ response: { status: 500 } }, 1_000, 500)).toBe(false);
  });

  it('keys the bounded activity projection by the selected invocation', () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data: view('completed'),
      error: null,
      refetch,
    });
    const { rerender } = renderHook(
      ({ taskId }) => useSubagentThreadQuery('parent-conversation', 'child-thread', taskId),
      { initialProps: { taskId: 'task-1' } },
    );

    expect(mockUseQuery.mock.calls.at(-1)?.[0]).toEqual([
      'subagentThread',
      'parent-conversation',
      'child-thread',
      'task-1',
    ]);
    rerender({ taskId: 'task-2' });
    expect(mockUseQuery.mock.calls.at(-1)?.[0]).toEqual([
      'subagentThread',
      'parent-conversation',
      'child-thread',
      'task-2',
    ]);
    expect(refetch).not.toHaveBeenCalled();
  });
});
