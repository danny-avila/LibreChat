import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation, TScheduleRunNowResponse } from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ACTIVE_JOBS_POLL_MS,
  resetActiveJobsGrace,
  getActiveJobsRefetchInterval,
} from '../SSE/queries';
import { useRunScheduleNowMutation } from '../Schedules/mutations';

const mockRunScheduleNow = jest.fn<Promise<TScheduleRunNowResponse>, [string]>();
const mockGetConversationById = jest.fn<Promise<TConversation>, [string]>();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      runScheduleNow: (id: string) => mockRunScheduleNow(id),
      getConversationById: (id: string) => mockGetConversationById(id),
    },
  };
});

type ConversationPages = InfiniteData<{
  conversations: TConversation[];
  nextCursor: string | null;
}>;

type ListParams = { projectId?: string };

/** Past the first two probes, and still inside the active-job grace window that
 *  admission opens — a test asserting that window must not advance the clock
 *  beyond it and read its own fast-forward as the poll having lapsed. */
const PAST_ADMISSION_MS = 3_000;
/** Past the whole probe budget, so a test can run the watch to exhaustion. */
const ADMISSION_BUDGET_MS = 600_000;

/** `isNotFoundError` reads the status off an axios error, so the marker matters:
 *  a bare `{ response: { status } }` is not one, and the watch would read a 404 as
 *  an unrelated failure and stop — passing the never-admits tests for the wrong
 *  reason while failing the ones that retry. */
const httpError = (status: number, message: string) =>
  Object.assign(new Error(message), { isAxiosError: true, response: { status } });

const serverConversation = (chatProjectId?: string): TConversation =>
  ({
    conversationId: 'run-convo-1',
    title: 'Overnight activity summary',
    endpoint: 'agents',
    agent_id: 'agent-1',
    ...(chatProjectId != null ? { chatProjectId } : {}),
    createdAt: '2026-09-04T09:00:01.000Z',
    updatedAt: '2026-09-04T09:00:01.000Z',
  }) as TConversation;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      /** These tests run the fake clock past the whole probe budget, which is
       *  longer than the default five-minute cacheTime — without this the list
       *  query is garbage collected mid-test and its emptiness reads as the
       *  watch having removed something. */
      queries: { retry: false, cacheTime: Infinity },
      mutations: { retry: false },
    },
  });
}

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

const seedList = (queryClient: QueryClient, params?: ListParams) => {
  queryClient.setQueryData<ConversationPages>(
    params ? [QueryKeys.allConversations, params] : [QueryKeys.allConversations],
    {
      pages: [
        {
          conversations: [{ conversationId: 'existing-convo' } as TConversation],
          nextCursor: null,
        },
      ],
      pageParams: [],
    },
  );
};

const readList = (queryClient: QueryClient, params?: ListParams) =>
  queryClient.getQueryData<ConversationPages>(
    params ? [QueryKeys.allConversations, params] : [QueryKeys.allConversations],
  )?.pages[0].conversations ?? [];

const runNow = async (queryClient: QueryClient) => {
  const { result } = renderHook(() => useRunScheduleNowMutation(), {
    wrapper: createWrapper(queryClient),
  });
  await act(async () => {
    await result.current.mutateAsync('schedule-1');
  });
};

const settleAdmission = async (ms = PAST_ADMISSION_MS) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

describe('run-now conversation tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    resetActiveJobsGrace();
    mockRunScheduleNow.mockResolvedValue({
      scheduleId: 'schedule-1',
      conversationId: 'run-convo-1',
      status: 'started',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('adds the run to the sidebar once the server has the conversation', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById
      .mockRejectedValueOnce(httpError(404, 'Not Found'))
      .mockResolvedValue(serverConversation());

    await runNow(queryClient);
    expect(readList(queryClient).map((convo) => convo.conversationId)).toEqual(['existing-convo']);

    await settleAdmission();

    const [first, ...rest] = readList(queryClient);
    expect(first.conversationId).toBe('run-convo-1');
    expect(first.title).toBe('Overnight activity summary');
    expect(rest.map((convo) => convo.conversationId)).toEqual(['existing-convo']);
    queryClient.clear();
  });

  it('files the row by the server row, not by a client snapshot of the schedule', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient, { projectId: 'project-server' });
    seedList(queryClient, { projectId: 'project-stale' });
    mockGetConversationById.mockResolvedValue(serverConversation('project-server'));

    await runNow(queryClient);
    await settleAdmission();

    expect(readList(queryClient, { projectId: 'project-server' })[0].conversationId).toBe(
      'run-convo-1',
    );
    expect(readList(queryClient, { projectId: 'project-stale' })[0].conversationId).toBe(
      'existing-convo',
    );
    queryClient.clear();
  });

  it('warms the chat route cache so the new row opens without a 404', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById.mockResolvedValue(serverConversation());

    await runNow(queryClient);
    await settleAdmission();

    expect(
      queryClient.getQueryData<TConversation>([QueryKeys.conversation, 'run-convo-1'])?.title,
    ).toBe('Overnight activity summary');
    queryClient.clear();
  });

  it('re-arms the active-job poll only once a generation is known to exist', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById
      .mockRejectedValueOnce(httpError(404, 'Not Found'))
      .mockResolvedValue(serverConversation());

    await runNow(queryClient);
    expect(getActiveJobsRefetchInterval({ activeJobIds: [] })).toBe(false);

    await settleAdmission();

    expect(getActiveJobsRefetchInterval({ activeJobIds: [] })).toBe(ACTIVE_JOBS_POLL_MS);
    queryClient.clear();
  });

  it('leaves every cache untouched when the delivery never admits', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById.mockRejectedValue(httpError(404, 'Not Found'));

    await runNow(queryClient);
    await settleAdmission(ADMISSION_BUDGET_MS);

    expect(readList(queryClient).map((convo) => convo.conversationId)).toEqual(['existing-convo']);
    expect(queryClient.getQueryData([QueryKeys.conversation, 'run-convo-1'])).toBeUndefined();
    expect(getActiveJobsRefetchInterval({ activeJobIds: [] })).toBe(false);
    queryClient.clear();
  });

  it('keeps waiting through a probe that fails for its own reasons', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById
      .mockRejectedValueOnce(httpError(502, 'Bad Gateway'))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(serverConversation());

    await runNow(queryClient);
    await settleAdmission(6_000);

    expect(readList(queryClient)[0].conversationId).toBe('run-convo-1');
    queryClient.clear();
  });

  it('stops on a failure that settles the matter', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    mockGetConversationById.mockRejectedValue(httpError(403, 'Forbidden'));

    await runNow(queryClient);
    await settleAdmission(ADMISSION_BUDGET_MS);

    expect(mockGetConversationById).toHaveBeenCalledTimes(1);
    expect(readList(queryClient).map((convo) => convo.conversationId)).toEqual(['existing-convo']);
    queryClient.clear();
  });

  it("outlasts the trigger engine's own retry window", async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);
    /** The engine allows eight attempts backing off from a second and doubling,
     *  so a dispatch that keeps failing can admit around two minutes in. */
    mockGetConversationById.mockRejectedValue(httpError(404, 'Not Found'));

    await runNow(queryClient);
    await settleAdmission(150_000);
    mockGetConversationById.mockResolvedValue(serverConversation());
    await settleAdmission(120_000);

    expect(readList(queryClient)[0].conversationId).toBe('run-convo-1');
    queryClient.clear();
  });
});
