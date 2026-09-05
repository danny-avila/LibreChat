import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSchedule, TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useRunSync from '../useRunSync';

const schedule: TSchedule = {
  id: 'schedule-1',
  user: 'user-1',
  name: 'Morning briefing',
  prompt: 'Summarize overnight activity',
  agent_id: 'agent-1',
  cadence: { frequency: 'daily', hour: 9, minute: 0 },
  timezone: 'UTC',
  target: 'new',
  enabled: true,
  runCount: 0,
  failureCount: 0,
  nextRunAt: '2026-09-05T09:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** What a fire actually changes: the occurrence advances to the next one. The
 *  schedule's `lastRun` is untouched until the run settles. */
const fired = (overrides?: Partial<TSchedule>): TSchedule => ({
  ...schedule,
  nextRunAt: '2026-09-06T09:00:00.000Z',
  ...overrides,
});

const withRun = (overrides: Partial<TSchedule['lastRun']> & { status: 'started' | 'success' }) => ({
  ...schedule,
  lastRun: { firedAt: '2026-09-04T09:00:00.000Z', ...overrides },
});

const listKey = [QueryKeys.allConversations, { projectId: 'project-a' }];

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(listKey, {
    pages: [{ conversations: [{ conversationId: 'existing' } as TConversation], nextCursor: null }],
    pageParams: [],
  });
  return queryClient;
}

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

const isStale = (queryClient: QueryClient) =>
  queryClient.getQueryState(listKey)?.isInvalidated === true;

const renderWith = (queryClient: QueryClient, initial?: TSchedule[]) =>
  renderHook((schedules?: TSchedule[]) => useRunSync(schedules), {
    wrapper: createWrapper(queryClient),
    initialProps: initial,
  });

describe('useRunSync', () => {
  it('refreshes when an occurrence fires, which only moves nextRunAt', () => {
    const queryClient = createQueryClient();
    const { rerender } = renderWith(queryClient, [schedule]);
    expect(isStale(queryClient)).toBe(false);

    rerender([fired()]);

    expect(isStale(queryClient)).toBe(true);
    queryClient.clear();
  });

  it('refreshes again when the run settles, so the chat takes its generated title', () => {
    const queryClient = createQueryClient();
    const running = fired();
    const { rerender } = renderWith(queryClient, [running]);
    expect(isStale(queryClient)).toBe(false);

    rerender([{ ...running, ...withRun({ status: 'success', conversationId: 'run-convo-1' }) }]);

    expect(isStale(queryClient)).toBe(true);
    queryClient.clear();
  });

  it('records the first observation in silence', () => {
    const queryClient = createQueryClient();
    renderWith(queryClient, [withRun({ status: 'success', conversationId: 'run-convo-1' })]);

    expect(isStale(queryClient)).toBe(false);
    queryClient.clear();
  });

  it('leaves the list alone when nothing about a run moved', () => {
    const queryClient = createQueryClient();
    const settled = withRun({ status: 'success', conversationId: 'run-convo-1' });
    const { rerender } = renderWith(queryClient, [settled]);

    rerender([{ ...settled, name: 'Renamed', enabled: false }]);

    expect(isStale(queryClient)).toBe(false);
    queryClient.clear();
  });

  it('does not refresh for a schedule it is seeing for the first time', () => {
    const queryClient = createQueryClient();
    const { rerender } = renderWith(queryClient, [schedule]);

    rerender([
      schedule,
      { ...withRun({ status: 'success', conversationId: 'run-convo-2' }), id: 'schedule-2' },
    ]);

    expect(isStale(queryClient)).toBe(false);
    queryClient.clear();
  });

  it('waits for data before recording anything', () => {
    const queryClient = createQueryClient();
    const { rerender } = renderWith(queryClient, undefined);

    rerender([withRun({ status: 'success', conversationId: 'run-convo-1' })]);

    expect(isStale(queryClient)).toBe(false);
    queryClient.clear();
  });
});
