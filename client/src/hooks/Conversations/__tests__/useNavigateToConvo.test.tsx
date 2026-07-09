import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import useNavigateToConvo from '../useNavigateToConvo';

const mockNavigate = jest.fn((path: string) => {
  window.history.pushState({}, '', path);
});
const mockQueryClient = {
  getQueryData: jest.fn(),
  fetchQuery: jest.fn(),
  invalidateQueries: jest.fn(),
  removeQueries: jest.fn(),
};
const mockSetSubmission = jest.fn();
const mockClearAllConversations = jest.fn();
const mockSetConversation = jest.fn();
const mockHasSetConversation = { current: false };
const mockApplyModelSpecEffects = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockQueryClient,
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: () => mockSetSubmission,
}));

jest.mock('~/hooks/Agents', () => ({
  useApplyModelSpecEffects: () => mockApplyModelSpecEffects,
}));

jest.mock('~/utils', () => {
  const actual = jest.requireActual('~/utils');
  return {
    ...actual,
    logger: {
      ...actual.logger,
      log: jest.fn(),
      warn: jest.fn(),
    },
  };
});

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    submissionByIndex: jest.fn(),
    useClearConvoState: () => mockClearAllConversations,
    useCreateConversationAtom: () => ({
      hasSetConversation: mockHasSetConversation,
      setConversation: mockSetConversation,
    }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function conversation(id: string, overrides: Partial<TConversation> = {}): TConversation {
  return {
    conversationId: id,
    title: `Conversation ${id}`,
    endpoint: 'openAI',
    endpointType: 'custom',
    model: 'gpt-4',
    ...overrides,
  } as TConversation;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHasSetConversation.current = false;
  window.history.pushState({}, '', '/c/source');
  mockQueryClient.getQueryData.mockImplementation((key: unknown) => {
    if (Array.isArray(key) && key[0] === QueryKeys.endpoints) {
      return { openAI: { type: 'custom' } };
    }
    return undefined;
  });
});

describe('useNavigateToConvo', () => {
  it('navigates before the conversation detail fetch resolves', async () => {
    const freshConversation = conversation('target', { title: 'Fresh target' });
    const fetch = deferred<TConversation>();
    mockQueryClient.fetchQuery.mockReturnValue(fetch.promise);

    const { result } = renderHook(() => useNavigateToConvo());

    act(() => {
      result.current.navigateToConvo(conversation('target'), { currentConvoId: 'source' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/c/target', { state: { focusChat: true } });
    expect(mockQueryClient.fetchQuery).toHaveBeenCalledWith(
      [QueryKeys.conversation, 'target'],
      expect.any(Function),
    );
    expect(mockSetConversation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'target' }),
    );

    await act(async () => {
      fetch.resolve(freshConversation);
      await fetch.promise;
    });

    expect(mockSetConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: 'target', title: 'Fresh target' }),
    );
  });

  it('uses cached full conversation details for the immediate navigation state', async () => {
    const cachedConversation = conversation('target', {
      promptPrefix: 'Saved instructions',
      temperature: 0.2,
      title: 'Cached target',
    });
    const listConversation = conversation('target', { title: 'List target' });
    const fetch = deferred<TConversation>();
    mockQueryClient.getQueryData.mockImplementation((key: unknown) => {
      if (Array.isArray(key) && key[0] === QueryKeys.endpoints) {
        return { openAI: { type: 'custom' } };
      }
      if (Array.isArray(key) && key[0] === QueryKeys.conversation && key[1] === 'target') {
        return cachedConversation;
      }
      return undefined;
    });
    mockQueryClient.fetchQuery.mockReturnValue(fetch.promise);

    const { result } = renderHook(() => useNavigateToConvo());

    act(() => {
      result.current.navigateToConvo(listConversation, { currentConvoId: 'source' });
    });

    expect(mockSetConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'target',
        title: 'List target',
        promptPrefix: 'Saved instructions',
        temperature: 0.2,
      }),
    );

    await act(async () => {
      fetch.resolve(conversation('target', { title: 'Fresh target' }));
      await fetch.promise;
    });
  });

  it('drops stale conversation detail responses after a faster second navigation', async () => {
    const firstFetch = deferred<TConversation>();
    const secondFetch = deferred<TConversation>();
    mockQueryClient.fetchQuery
      .mockReturnValueOnce(firstFetch.promise)
      .mockReturnValueOnce(secondFetch.promise);

    const { result } = renderHook(() => useNavigateToConvo());

    act(() => {
      result.current.navigateToConvo(conversation('first'), { currentConvoId: 'source' });
      result.current.navigateToConvo(conversation('second'), { currentConvoId: 'first' });
    });

    await act(async () => {
      firstFetch.resolve(conversation('first', { title: 'Stale first' }));
      await firstFetch.promise;
    });

    expect(mockSetConversation).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'first', title: 'Stale first' }),
    );

    await act(async () => {
      secondFetch.resolve(conversation('second', { title: 'Fresh second' }));
      await secondFetch.promise;
    });

    expect(mockSetConversation).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: 'second', title: 'Fresh second' }),
    );
  });

  it('drops fresh conversation detail when the URL moved away outside the hook', async () => {
    const fetch = deferred<TConversation>();
    mockQueryClient.fetchQuery.mockReturnValue(fetch.promise);

    const { result } = renderHook(() => useNavigateToConvo());

    act(() => {
      result.current.navigateToConvo(conversation('target'), { currentConvoId: 'source' });
      window.history.pushState({}, '', '/c/other-route');
    });

    await act(async () => {
      fetch.resolve(conversation('target', { title: 'Late target' }));
      await fetch.promise;
    });

    expect(mockSetConversation).not.toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'target', title: 'Late target' }),
    );
  });
});
