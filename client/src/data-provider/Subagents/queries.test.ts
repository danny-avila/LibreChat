import type { SubagentThreadView } from 'librechat-data-provider';
import { renderHook } from '@testing-library/react';
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

  it('treats only readiness-window 404s as pending', () => {
    expect(isSubagentReadinessPending({ response: { status: 404 } }, 1_000, 500)).toBe(true);
    expect(isSubagentReadinessPending({ response: { status: 404 } }, 1_000, 1_000)).toBe(false);
    expect(isSubagentReadinessPending({ response: { status: 500 } }, 1_000, 500)).toBe(false);
  });

  it('refetches a terminal thread when a new invocation continues it', () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data: view('completed'),
      error: null,
      refetch,
    });
    const { rerender } = renderHook(
      ({ invocationId }) =>
        useSubagentThreadQuery('parent-conversation', 'child-thread', invocationId),
      { initialProps: { invocationId: 'tool-call-1' } },
    );

    expect(refetch).not.toHaveBeenCalled();
    rerender({ invocationId: 'tool-call-2' });
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
