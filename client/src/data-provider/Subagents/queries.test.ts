import type { SubagentThreadView } from 'librechat-data-provider';
import { subagentThreadRefetchInterval } from './queries';

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
});
