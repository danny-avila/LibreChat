import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TImportJob } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { importJobRefetchInterval, useImportJobQuery } from '../queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getImportJob: jest.fn(),
    },
  };
});

function job(phase: TImportJob['phase']): TImportJob {
  return {
    jobId: 'j1',
    filename: 'export.zip',
    phase,
    status: phase === 'completed' ? 'completed' : 'active',
    summary: null,
    progress: {
      conversations: { done: 0, total: 0 },
      messages: { done: 0, total: 0 },
      assets: { done: 0, total: 0 },
    },
    report: null,
    error: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('importJobRefetchInterval', () => {
  it('polls while the import is running', () => {
    expect(importJobRefetchInterval(job('conversations'))).toBe(2000);
    expect(importJobRefetchInterval(job('assets'))).toBe(2000);
  });

  it('polls while the archive is being inspected or queued', () => {
    expect(importJobRefetchInterval(job('queued'))).toBe(2000);
    expect(importJobRefetchInterval(job('inspecting'))).toBe(2000);
  });

  it('stops on terminal phases', () => {
    expect(importJobRefetchInterval(job('completed'))).toBe(false);
    expect(importJobRefetchInterval(job('failed'))).toBe(false);
    expect(importJobRefetchInterval(job('cancelled'))).toBe(false);
  });

  it('stops while awaiting the user’s confirmation', () => {
    expect(importJobRefetchInterval(job('awaiting_confirmation'))).toBe(false);
  });

  it('polls when there is no data yet', () => {
    expect(importJobRefetchInterval(undefined)).toBe(2000);
  });
});

describe('useImportJobQuery', () => {
  it('stays disabled and never calls the API when jobId is null', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, unmount } = renderHook(() => useImportJobQuery(null), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(dataService.getImportJob).not.toHaveBeenCalled();
    unmount();
  });

  it('fetches the job by id once enabled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const mockGetImportJob = dataService.getImportJob as jest.MockedFunction<
      typeof dataService.getImportJob
    >;
    mockGetImportJob.mockResolvedValue(job('conversations'));

    const { result, unmount } = renderHook(() => useImportJobQuery('job-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(job('conversations'));
    });
    expect(mockGetImportJob).toHaveBeenCalledWith('job-1');

    unmount();
  });

  it('invalidates the conversation list once the job reports completed', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const mockGetImportJob = dataService.getImportJob as jest.MockedFunction<
      typeof dataService.getImportJob
    >;
    mockGetImportJob.mockResolvedValue(job('completed'));

    const { result, unmount } = renderHook(() => useImportJobQuery('job-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.phase).toBe('completed');
    });
    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.allConversations]);

    unmount();
  });

  it('does not invalidate the conversation list while the job is still running', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const mockGetImportJob = dataService.getImportJob as jest.MockedFunction<
      typeof dataService.getImportJob
    >;
    mockGetImportJob.mockResolvedValue(job('assets'));

    const { result, unmount } = renderHook(() => useImportJobQuery('job-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.phase).toBe('assets');
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith([QueryKeys.allConversations]);

    unmount();
  });
});
