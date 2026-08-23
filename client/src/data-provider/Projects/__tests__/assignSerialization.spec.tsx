import { RecoilRoot } from 'recoil';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService, QueryKeys, setTokenHeader } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useAssignConversationToProjectMutation } from '../mutations';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, assignConversationToProject: jest.fn() },
  };
});

const assignConversationToProject = dataService.assignConversationToProject as jest.MockedFunction<
  typeof dataService.assignConversationToProject
>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const response = (conversationId: string, projectId: string | null) =>
  ({
    conversation: { conversationId, chatProjectId: projectId },
    projectId,
    previousProjectId: null,
  }) as never;

let activeQueryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => {
  activeQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <RecoilRoot>
      <QueryClientProvider client={activeQueryClient}>{children}</QueryClientProvider>
    </RecoilRoot>
  );
};

/** Assignments are attributed to the account whose credentials they will travel
 *  with, so the tests need a session installed. */
const signInAs = (userId: string) => {
  const claims = btoa(JSON.stringify({ id: userId })).replace(/=+$/, '');
  setTokenHeader(`header.${claims}.signature`);
};

describe('useAssignConversationToProjectMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signInAs('user-a');
  });

  afterEach(() => {
    setTokenHeader(undefined);
  });

  /* The drag targets, the row menu and the project dialog each hold their own
   * instance of this hook. Serializing inside the mutation is what keeps two of
   * them from racing, whichever surface the user reached for. */
  it('serializes writes for one conversation across separate hook instances', async () => {
    const first = deferred<never>();
    assignConversationToProject
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response('c1', 'project-a'));

    const dragSurface = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });
    const menuSurface = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });

    await act(async () => {
      dragSurface.result.current.mutate({ conversationId: 'c1', projectId: 'project-b' });
    });
    await act(async () => {
      menuSurface.result.current.mutate({ conversationId: 'c1', projectId: 'project-a' });
    });

    /* The menu write must wait: arriving first would let the older drop land
     * afterwards and overwrite the destination the user asked for last. */
    expect(assignConversationToProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(response('c1', 'project-b') as never);
    });

    await waitFor(() => expect(assignConversationToProject).toHaveBeenCalledTimes(2));
    expect(assignConversationToProject.mock.calls[0][0]).toMatchObject({ projectId: 'project-b' });
    expect(assignConversationToProject.mock.calls[1][0]).toMatchObject({ projectId: 'project-a' });
  });

  it('leaves different conversations independent', async () => {
    const held = deferred<never>();
    assignConversationToProject
      .mockReturnValueOnce(held.promise)
      .mockResolvedValueOnce(response('c2', 'project-a'));

    const { result } = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ conversationId: 'c1', projectId: 'project-b' });
    });
    await act(async () => {
      result.current.mutate({ conversationId: 'c2', projectId: 'project-a' });
    });

    expect(assignConversationToProject).toHaveBeenCalledTimes(2);

    await act(async () => {
      held.resolve(response('c1', 'project-b') as never);
    });
  });

  /* Navigation invalidates this exact conversation, so a refetch that read the
   * old project can be in flight when the assignment confirms. Everything now
   * reads a conversation's project from this cache, so an older fetch landing
   * after the write would quietly revert the move. */
  it('cancels an in-flight conversation refetch before writing the result', async () => {
    assignConversationToProject.mockResolvedValueOnce(response('c1', 'project-b'));

    const { result } = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });
    const cancelQueries = jest.spyOn(activeQueryClient, 'cancelQueries');

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', projectId: 'project-b' });
    });

    expect(cancelQueries).toHaveBeenCalledWith([QueryKeys.conversation, 'c1']);
    expect(
      activeQueryClient.getQueryData<{ chatProjectId: string | null }>([
        QueryKeys.conversation,
        'c1',
      ])?.chatProjectId,
    ).toBe('project-b');
  });

  /* Between the request settling and the cache write there must be no moment
   * where neither the pending entry nor the cache names the new project, or a
   * drag started right then reads the stale row and refuses a valid drop. */
  it('writes the conversation cache before releasing the pending destination', async () => {
    let cachedDuringSettle: unknown = 'not-read';
    assignConversationToProject.mockResolvedValueOnce(response('c1', 'project-b'));

    const { result } = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });

    /* Observe the cache at the moment the cancellation resolves, which is the
     * last point before the write. */
    const cancelQueries = jest
      .spyOn(activeQueryClient, 'cancelQueries')
      .mockImplementation(async () => undefined);

    await act(async () => {
      await result.current.mutateAsync({ conversationId: 'c1', projectId: 'project-b' });
    });

    cachedDuringSettle = activeQueryClient.getQueryData<{ chatProjectId: string | null }>([
      QueryKeys.conversation,
      'c1',
    ])?.chatProjectId;

    expect(cancelQueries).toHaveBeenCalledWith([QueryKeys.conversation, 'c1']);
    expect(cachedDuringSettle).toBe('project-b');
    cancelQueries.mockRestore();
  });

  /* Conversation ids are per-user, so a queued assignment must not travel with
   * the next account's credentials and act on whatever that id names there. */
  it('abandons a queued assignment when the session turns over', async () => {
    const first = deferred<never>();
    assignConversationToProject
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response('c1', 'project-a'));

    const { result } = renderHook(() => useAssignConversationToProjectMutation(), { wrapper });

    await act(async () => {
      result.current.mutate({ conversationId: 'c1', projectId: 'project-b' });
    });
    let queued!: Promise<unknown>;
    await act(async () => {
      queued = result.current
        .mutateAsync({ conversationId: 'c1', projectId: 'project-a' })
        .catch(() => 'abandoned');
      await Promise.resolve();
      await Promise.resolve();
    });

    setTokenHeader(undefined);

    await act(async () => {
      first.resolve(response('c1', 'project-b') as never);
      await expect(queued).resolves.toBe('abandoned');
    });

    expect(assignConversationToProject).toHaveBeenCalledTimes(1);
  });
});
