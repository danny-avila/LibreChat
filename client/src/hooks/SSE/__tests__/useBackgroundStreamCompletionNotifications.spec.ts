import { renderHook, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { fetchStreamStatus, useActiveJobs } from '~/data-provider';
import useBackgroundStreamCompletionNotifications from '../useBackgroundStreamCompletionNotifications';
import { notifyStreamCompletion } from '../streamCompletionNotification';

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: jest.fn(() => (key: string) => key),
}));

jest.mock('~/data-provider', () => ({
  fetchStreamStatus: jest.fn(),
  useActiveJobs: jest.fn(),
}));

jest.mock('../streamCompletionNotification', () => {
  const actual = jest.requireActual('../streamCompletionNotification');
  return {
    ...actual,
    notifyStreamCompletion: jest.fn(() => true),
  };
});

describe('useBackgroundStreamCompletionNotifications', () => {
  let activeJobIds: string[] = [];
  const mockQueryClient = {
    getQueryData: jest.fn((queryKey: unknown) => {
      if (Array.isArray(queryKey) && queryKey[0] === QueryKeys.startupConfig) {
        return { appTitle: 'LibreChat' };
      }
      if (Array.isArray(queryKey) && queryKey[0] === QueryKeys.messages) {
        return [];
      }
      return undefined;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    activeJobIds = [];
    (useQueryClient as jest.Mock).mockReturnValue(mockQueryClient);
    (useActiveJobs as jest.Mock).mockImplementation(() => ({
      data: { activeJobIds },
    }));
  });

  it('notifies when a previously active stream completes successfully', async () => {
    (fetchStreamStatus as jest.Mock).mockResolvedValue({
      active: false,
      status: 'complete',
      resumeState: {
        aggregatedContent: [{ type: 'text', text: 'Background response complete.' }],
      },
    });

    activeJobIds = ['convo-1'];

    const { rerender } = renderHook(
      (props: {
        enabled: boolean;
        notifyOnStreamComplete: boolean;
        currentConversationId: string | null;
      }) => useBackgroundStreamCompletionNotifications(props),
      {
        initialProps: {
          enabled: true,
          notifyOnStreamComplete: true,
          currentConversationId: null,
        },
      },
    );

    activeJobIds = [];
    rerender({
      enabled: true,
      notifyOnStreamComplete: true,
      currentConversationId: null,
    });

    await waitFor(() => {
      expect(fetchStreamStatus).toHaveBeenCalledWith('convo-1');
      expect(notifyStreamCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          title: 'LibreChat',
          responseText: 'Background response complete.',
        }),
      );
    });
  });

  it('does not notify when stream status is aborted', async () => {
    (fetchStreamStatus as jest.Mock).mockResolvedValue({
      active: false,
      status: 'aborted',
    });

    activeJobIds = ['convo-2'];

    const { rerender } = renderHook(() =>
      useBackgroundStreamCompletionNotifications({
        enabled: true,
        notifyOnStreamComplete: true,
        currentConversationId: null,
      }),
    );

    activeJobIds = [];
    rerender();

    await waitFor(() => {
      expect(fetchStreamStatus).toHaveBeenCalledWith('convo-2');
      expect(notifyStreamCompletion).not.toHaveBeenCalled();
    });
  });

  it('skips notifications for the current foreground conversation', async () => {
    (fetchStreamStatus as jest.Mock).mockResolvedValue({
      active: false,
      status: 'complete',
    });

    activeJobIds = ['convo-3'];

    const { rerender } = renderHook(() =>
      useBackgroundStreamCompletionNotifications({
        enabled: true,
        notifyOnStreamComplete: true,
        currentConversationId: 'convo-3',
      }),
    );

    activeJobIds = [];
    rerender();

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchStreamStatus).not.toHaveBeenCalled();
    expect(notifyStreamCompletion).not.toHaveBeenCalled();
  });
});
