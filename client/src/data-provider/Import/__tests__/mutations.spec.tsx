import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, dataService, isImportJobStarted } from 'librechat-data-provider';
import type { TImportCompleted, TImportJobStarted } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useCancelImportMutation,
  useStartImportMutation,
  useUploadImportMutation,
} from '../mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      importConversationsFile: jest.fn(),
      startImportJob: jest.fn(),
      cancelImportJob: jest.fn(),
    },
  };
});

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('useUploadImportMutation', () => {
  it('surfaces a ChatGPT export as a started job, narrowed by isImportJobStarted', async () => {
    const started: TImportJobStarted = {
      jobId: 'job-1',
      summary: {
        source: 'chatgpt',
        manifestVersion: 1,
        conversations: 3,
        shards: 1,
        assets: 2,
        assetBytes: 1024,
        archived: 0,
        starred: 0,
      },
    };
    const mockImport = dataService.importConversationsFile as jest.MockedFunction<
      typeof dataService.importConversationsFile
    >;
    mockImport.mockResolvedValue(started);
    const onSuccess = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useUploadImportMutation({ onSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(new FormData());
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(started);
    });
    const [response] = onSuccess.mock.calls[0];
    expect(isImportJobStarted(response)).toBe(true);
    if (isImportJobStarted(response)) {
      expect(response.jobId).toBe('job-1');
    }
    expect(invalidateSpy).not.toHaveBeenCalledWith([QueryKeys.allConversations]);

    unmount();
  });

  it('surfaces a synchronous Claude/ChatbotUI/LibreChat import as completed, narrowed by isImportJobStarted', async () => {
    const completed: TImportCompleted = { message: 'Import completed' };
    const mockImport = dataService.importConversationsFile as jest.MockedFunction<
      typeof dataService.importConversationsFile
    >;
    mockImport.mockResolvedValue(completed);
    const onSuccess = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useUploadImportMutation({ onSuccess }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(new FormData());
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(completed);
    });
    const [response] = onSuccess.mock.calls[0];
    expect(isImportJobStarted(response)).toBe(false);
    if (!isImportJobStarted(response)) {
      expect(response.message).toBe('Import completed');
    }
    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.allConversations]);

    unmount();
  });

  it('surfaces upload failures through onError', async () => {
    const mockImport = dataService.importConversationsFile as jest.MockedFunction<
      typeof dataService.importConversationsFile
    >;
    const error = new Error('upload failed');
    mockImport.mockRejectedValue(error);
    const onError = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

    const { result, unmount } = renderHook(() => useUploadImportMutation({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(new FormData()).catch(() => undefined);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });

    unmount();
  });
});

describe('useStartImportMutation', () => {
  it('invalidates the started job query so polling picks it up', async () => {
    const mockStart = dataService.startImportJob as jest.MockedFunction<
      typeof dataService.startImportJob
    >;
    mockStart.mockResolvedValue({ jobId: 'job-1' });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useStartImportMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync('job-1');
    });

    expect(mockStart).toHaveBeenCalledWith('job-1');
    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.importJob, 'job-1']);

    unmount();
  });

  it('surfaces start failures through onError', async () => {
    const mockStart = dataService.startImportJob as jest.MockedFunction<
      typeof dataService.startImportJob
    >;
    const error = new Error('start failed');
    mockStart.mockRejectedValue(error);
    const onError = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useStartImportMutation({ onError }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync('job-1').catch(() => undefined);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(error);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    unmount();
  });
});

describe('useCancelImportMutation', () => {
  it('invalidates both the job query and the conversation list, since cancelling stops mid-import rather than before it', async () => {
    const mockCancel = dataService.cancelImportJob as jest.MockedFunction<
      typeof dataService.cancelImportJob
    >;
    mockCancel.mockResolvedValue({ jobId: 'job-1' });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result, unmount } = renderHook(() => useCancelImportMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync('job-1');
    });

    expect(mockCancel).toHaveBeenCalledWith('job-1');
    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.importJob, 'job-1']);
    expect(invalidateSpy).toHaveBeenCalledWith([QueryKeys.allConversations]);

    unmount();
  });
});
