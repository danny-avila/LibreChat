import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation, TSchedule, TSchedulesResponse } from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  ACTIVE_JOBS_POLL_MS,
  resetActiveJobsGrace,
  getActiveJobsRefetchInterval,
} from '../SSE/queries';
import { useRunScheduleNowMutation } from '../Schedules/mutations';

const mockRunScheduleNow = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      runScheduleNow: (...args: unknown[]) => mockRunScheduleNow(...args),
    },
  };
});

type ConversationPages = InfiniteData<{
  conversations: TConversation[];
  nextCursor: string | null;
}>;

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
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

const seedSchedules = (queryClient: QueryClient, overrides?: Partial<TSchedule>, pin?: string) => {
  queryClient.setQueryData<TSchedulesResponse>([QueryKeys.schedules], {
    schedules: [{ ...schedule, ...overrides }],
    limits: {
      maxPerUser: 10,
      minIntervalMinutes: 15,
      requireProject: false,
      ...(pin != null ? { projectId: pin } : {}),
    },
  });
};

const seedList = (queryClient: QueryClient, params?: Record<string, unknown>) => {
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

const readList = (queryClient: QueryClient, params?: Record<string, unknown>) =>
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

describe('run-now cache updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetActiveJobsGrace();
    mockRunScheduleNow.mockResolvedValue({
      scheduleId: 'schedule-1',
      conversationId: 'run-convo-1',
      status: 'started',
    });
  });

  it('puts the started run at the head of the sidebar list', async () => {
    const queryClient = createQueryClient();
    seedSchedules(queryClient);
    seedList(queryClient);

    await runNow(queryClient);

    const [first, ...rest] = readList(queryClient);
    expect(first.conversationId).toBe('run-convo-1');
    expect(first.title).toBe('Morning briefing');
    expect(first.endpoint).toBe('agents');
    expect(first.agent_id).toBe('agent-1');
    expect(rest.map((convo) => convo.conversationId)).toEqual(['existing-convo']);
    queryClient.clear();
  });

  it('files the row under the project the run will use, and no other', async () => {
    const queryClient = createQueryClient();
    seedSchedules(queryClient, { chatProjectId: 'project-a' });
    seedList(queryClient, { projectId: 'project-a' });
    seedList(queryClient, { projectId: 'project-b' });

    await runNow(queryClient);

    expect(readList(queryClient, { projectId: 'project-a' })[0].conversationId).toBe('run-convo-1');
    expect(readList(queryClient, { projectId: 'project-b' })[0].conversationId).toBe(
      'existing-convo',
    );
    queryClient.clear();
  });

  it('follows the operator pin over the schedule’s stored project', async () => {
    const queryClient = createQueryClient();
    seedSchedules(queryClient, { chatProjectId: 'project-a' }, 'project-pinned');
    seedList(queryClient, { projectId: 'project-a' });
    seedList(queryClient, { projectId: 'project-pinned' });

    await runNow(queryClient);

    expect(readList(queryClient, { projectId: 'project-pinned' })[0].conversationId).toBe(
      'run-convo-1',
    );
    expect(readList(queryClient, { projectId: 'project-a' })[0].conversationId).toBe(
      'existing-convo',
    );
    queryClient.clear();
  });

  it('re-arms the active-job poll so the seeded row can show as running', async () => {
    const queryClient = createQueryClient();
    seedSchedules(queryClient);
    seedList(queryClient);
    expect(getActiveJobsRefetchInterval({ activeJobIds: [] })).toBe(false);

    await runNow(queryClient);

    expect(getActiveJobsRefetchInterval({ activeJobIds: [] })).toBe(ACTIVE_JOBS_POLL_MS);
    queryClient.clear();
  });

  it('leaves the list alone when the schedule is not cached', async () => {
    const queryClient = createQueryClient();
    seedList(queryClient);

    await runNow(queryClient);

    expect(readList(queryClient).map((convo) => convo.conversationId)).toEqual(['existing-convo']);
    queryClient.clear();
  });
});
