import { renderHook, act, waitFor } from '@testing-library/react';
import type { ConversationDragItem } from '../dnd';
import { effectiveProjectId, useAssignDroppedConversation } from '../dnd';

type AssignVariables = { conversationId: string; projectId: string | null };

const mockMutateAsync = jest.fn<Promise<unknown>, [AssignVariables]>();

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

/* The real mutation serializes per conversation internally; this stands in for
 * it so the destination bookkeeping can be exercised on its own. */
jest.mock('~/data-provider', () => ({
  useAssignConversationToProjectMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A drag item as the row reports it: `chatProjectId` is whatever the list
 *  cache said when the drag began. */
const item = (conversationId: string, chatProjectId: string | null): ConversationDragItem => ({
  conversationId,
  chatProjectId,
  pinned: false,
});

describe('assignment destinations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the queued destination while the write is in flight', async () => {
    const pending = deferred<void>();
    mockMutateAsync.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useAssignDroppedConversation());
    act(() => result.current(item('c-a', null), 'project-b'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    /* The row still says "no project" until the lists refresh. */
    expect(effectiveProjectId(item('c-a', null))).toBe('project-b');

    await act(async () => {
      pending.resolve();
    });
  });

  it('keeps reporting it after success until the lists catch up', async () => {
    mockMutateAsync.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useAssignDroppedConversation());
    await act(async () => {
      result.current(item('c-b', null), 'project-b');
    });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

    /* The mutation's invalidations are not awaited, so a drag started now still
     * carries the old project. Dropping back on it must not read as a no-op. */
    expect(effectiveProjectId(item('c-b', null))).toBe('project-b');

    /* Once a drag item shows the new project, the row speaks for itself. */
    expect(effectiveProjectId(item('c-b', 'project-b'))).toBe('project-b');
    expect(effectiveProjectId(item('c-b', null))).toBe(null);
  });

  it('falls back to the row when the assignment fails', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('nope'));

    const { result } = renderHook(() => useAssignDroppedConversation());
    await act(async () => {
      result.current(item('c-c', 'project-a'), 'project-b');
    });

    await waitFor(() => expect(effectiveProjectId(item('c-c', 'project-a'))).toBe('project-a'));
  });

  it('judges a repeat drop against the latest queued destination', async () => {
    const first = deferred<void>();
    mockMutateAsync.mockReturnValueOnce(first.promise).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAssignDroppedConversation());
    act(() => result.current(item('c-d', 'project-a'), 'project-b'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    /* Dropping back on A while B is queued is a real change of intent, not the
     * no-op the row's stale `chatProjectId` would suggest. */
    act(() => result.current(item('c-d', 'project-a'), 'project-a'));
    expect(effectiveProjectId(item('c-d', 'project-a'))).toBe('project-a');

    await act(async () => {
      first.resolve();
    });
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
    expect(mockMutateAsync.mock.calls[1][0]).toEqual({
      conversationId: 'c-d',
      projectId: 'project-a',
    });
  });
});
