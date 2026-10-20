import React from 'react';
import { Provider, createStore } from 'jotai';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContentTypes, dataService, StepEvents, StepTypes } from 'librechat-data-provider';
import type {
  SubagentTaskContentSnapshot,
  SubagentTaskContentSuffix,
} from 'librechat-data-provider';
import { isLegacyContentUnavailable, useSubagentTaskContentQuery } from './content';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, getSubagentTaskContent: jest.fn() } };
});

const scope = { parentConversationId: 'parent', threadId: 'thread', taskId: 'task' };
const initial: SubagentTaskContentSnapshot = {
  ...scope,
  mode: 'snapshot',
  messageId: 'task:assistant',
  parentMessageId: 'task:user',
  sender: 'worker',
  status: 'running',
  recovery: 'partial',
  revision: 1,
  throughSequence: 0,
  targetThroughSequence: 0,
  content: [{ type: ContentTypes.TEXT, text: 'Opening. ' }],
  runSteps: [
    {
      id: 'text',
      runId: 'provider',
      index: 0,
      type: StepTypes.MESSAGE_CREATION,
      stepDetails: {
        type: StepTypes.MESSAGE_CREATION,
        message_creation: { message_id: 'provider' },
      },
      usage: null,
    },
  ],
};
const clients: QueryClient[] = [];
const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [client] = React.useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return client;
  });
  return (
    <QueryClientProvider client={client}>
      <Provider>{children}</Provider>
    </QueryClientProvider>
  );
};
const getContent = jest.mocked(dataService.getSubagentTaskContent);
beforeEach(() => getContent.mockReset());
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

it('waits for subscription readiness before reading an authorized task snapshot', async () => {
  getContent.mockResolvedValue(initial);
  const { result, rerender } = renderHook(
    ({ ready }) => useSubagentTaskContentQuery(scope, { enabled: ready }),
    { wrapper: Wrapper, initialProps: { ready: false } },
  );
  expect(getContent).not.toHaveBeenCalled();
  rerender({ ready: true });
  await waitFor(() => expect(result.current.data?.messageId).toBe('task:assistant'));
  expect(getContent).toHaveBeenCalledWith('parent', 'thread', 'task', undefined, undefined);
});

it('requests only the committed suffix on invalidation, not bounded activity deltas', async () => {
  const { content: _content, runSteps: _steps, ...identity } = initial;
  const suffix: SubagentTaskContentSuffix = {
    ...identity,
    mode: 'suffix',
    afterSequence: 0,
    revision: 2,
    throughSequence: 1,
    targetThroughSequence: 1,
    events: [
      {
        sequence: 1,
        frame: {
          event: StepEvents.ON_MESSAGE_DELTA,
          data: { id: 'text', delta: { content: [{ type: ContentTypes.TEXT, text: 'Later.' }] } },
        },
      },
    ],
  };
  getContent.mockResolvedValueOnce(initial).mockResolvedValueOnce(suffix);
  const { result } = renderHook(() => useSubagentTaskContentQuery(scope), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    await result.current.refetch();
  });
  expect(getContent).toHaveBeenLastCalledWith('parent', 'thread', 'task', 0, undefined);
  await waitFor(() =>
    expect(result.current.data?.content[0]).toMatchObject({ text: 'Opening. Later.' }),
  );
});

it('treats old-record absence as compatibility fallback without retrying it', async () => {
  const error = { response: { status: 409, data: { code: 'SUBAGENT_CONTENT_UNAVAILABLE' } } };
  getContent.mockRejectedValue(error);
  const { result } = renderHook(() => useSubagentTaskContentQuery(scope), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.isUnavailable).toBe(true));
  expect(getContent).toHaveBeenCalledTimes(1);
  expect(isLegacyContentUnavailable(error)).toBe(true);
  expect(isLegacyContentUnavailable({ response: { status: 503 } })).toBe(false);
});

it('keeps the prior standard message readable when a recoverable request fails', async () => {
  getContent.mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useSubagentTaskContentQuery(scope, { retry: false }), {
    wrapper: Wrapper,
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data?.content).toEqual(initial.content);
  expect(result.current.isUnavailable).toBe(false);
});

it('retains the committed cursor while another reader still owns the same task', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const store = createStore();
  const SharedWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  const { content: _content, runSteps: _steps, ...identity } = initial;
  getContent.mockImplementation(async (_parent, _thread, _task, afterSequence) =>
    afterSequence == null
      ? initial
      : {
          ...identity,
          mode: 'suffix',
          afterSequence,
          events: [],
        },
  );
  const options = { staleTime: Infinity, refetchInterval: false } as const;
  const first = renderHook(() => useSubagentTaskContentQuery(scope, options), {
    wrapper: SharedWrapper,
  });
  const second = renderHook(() => useSubagentTaskContentQuery(scope, options), {
    wrapper: SharedWrapper,
  });
  await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  first.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  const third = renderHook(() => useSubagentTaskContentQuery(scope, options), {
    wrapper: SharedWrapper,
  });
  await act(async () => {
    await third.result.current.refetch();
  });
  expect(getContent).toHaveBeenLastCalledWith('parent', 'thread', 'task', 0, undefined);
  third.unmount();
  second.unmount();
});
