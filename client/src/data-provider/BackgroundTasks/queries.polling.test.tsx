import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BackgroundTaskIndex } from 'librechat-data-provider';
import { useBackgroundTasksQuery } from './queries';

const mockGetBackgroundTasks = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getBackgroundTasks: (...args: unknown[]) => mockGetBackgroundTasks(...args),
    },
  };
});

const empty: BackgroundTaskIndex = {
  conversationId: 'convo-1',
  tasks: [],
  cancellable: true,
};

const setup = (submitting = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ isSubmitting }) => useBackgroundTasksQuery('convo-1', undefined, isSubmitting).data,
    { initialProps: { isSubmitting: submitting }, wrapper },
  );
  return { ...hook, client };
};

describe('background task discovery polling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetBackgroundTasks.mockReset().mockResolvedValue(empty);
  });

  afterEach(() => jest.useRealTimers());

  it('refetches immediately at submit end and discovers tasks that appear afterward', async () => {
    mockGetBackgroundTasks.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    mockGetBackgroundTasks.mockResolvedValue({
      ...empty,
      tasks: [
        {
          taskId: 'late-task',
          toolName: 'bash_tool',
          toolCallId: 'call-1',
          status: 'running',
          cancellationRequested: false,
          startedAt: new Date().toISOString(),
        },
      ],
    });
    const { rerender, result, client, unmount } = setup(true);
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(mockGetBackgroundTasks).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTimeAsync(1_000));
    rerender({ isSubmitting: false });
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(mockGetBackgroundTasks).toHaveBeenCalledTimes(2);
    await act(async () => jest.advanceTimersByTimeAsync(2_000));
    expect(mockGetBackgroundTasks).toHaveBeenCalledTimes(3);
    await waitFor(() =>
      expect(
        client.getQueryData<BackgroundTaskIndex>([QueryKeys.backgroundTasks, 'convo-1'])?.tasks[0]
          ?.taskId,
      ).toBe('late-task'),
    );
    await waitFor(() => expect(result.current?.tasks[0]?.taskId).toBe('late-task'));
    unmount();
    client.clear();
  });

  it('stops polling after the bounded discovery window when no task appears', async () => {
    const { rerender, client, unmount } = setup(true);
    await act(async () => jest.advanceTimersByTimeAsync(0));
    rerender({ isSubmitting: false });
    await act(async () => jest.advanceTimersByTimeAsync(12_000));
    const calls = mockGetBackgroundTasks.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    await act(async () => jest.advanceTimersByTimeAsync(60_000));
    expect(mockGetBackgroundTasks).toHaveBeenCalledTimes(calls);
    unmount();
    client.clear();
  });
});
