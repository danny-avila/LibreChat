import { RecoilRoot } from 'recoil';
import { dataService } from 'librechat-data-provider';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RecoilRoot>
  );
};

describe('useAssignConversationToProjectMutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
