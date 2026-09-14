import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  ContentTypes,
  EModelEndpoint,
  createPayload,
  dataService,
} from 'librechat-data-provider';
import type {
  CodeEnvironmentMode,
  CodeWorkspaceSelection,
  TConversation,
  TMessage,
  TSubmission,
} from 'librechat-data-provider';
import { useGetMessagesByConvoId } from '~/data-provider/Messages/queries';
import useChatFunctions from '../useChatFunctions';
import { isPasteSubmitted } from '~/utils';

const mockNavigate = jest.fn();
const mockSetShowStopButton = jest.fn();
const mockSetIsSubmitting = jest.fn();
const mockGetEphemeralAgent = jest.fn(() => null);
const mockSetFilesToDelete = jest.fn();
const mockGetSender = jest.fn(() => 'Assistant');
const mockGetExpiry = jest.fn(() => 'expiry-key');
const mockGetQueryData = jest.fn(() => ({}));
const mockCancelQueries = jest.fn(() => Promise.resolve());
let mockQueryClient: QueryClient | undefined;
const mockLoggerWarn = jest.fn();
const mockGetLatestConversation = jest.fn(() => null as TConversation | null);
const mockResolveCodeWorkspaceSubmission = jest.fn<
  | { codeEnvironmentMode?: CodeEnvironmentMode; codeWorkspaces?: CodeWorkspaceSelection[] }
  | undefined,
  [CodeWorkspaceSelection[]?, CodeEnvironmentMode?]
>(() => ({}));
const mockCodeWorkspace = {
  resolveSubmission: mockResolveCodeWorkspaceSubmission,
  rememberSelection: jest.fn(),
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () =>
    mockQueryClient ?? {
      getQueryData: mockGetQueryData,
      getQueryState: jest.fn(() => undefined),
      cancelQueries: mockCancelQueries,
    },
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getMessagesByConvoId: jest.fn(),
    },
  };
});

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
  useSetRecoilState: (atom: unknown) =>
    String(atom).includes('isSubmitting') ? mockSetIsSubmitting : mockSetShowStopButton,
  useRecoilCallback: (factory: any) =>
    factory({
      snapshot: {
        getLoadable: () => ({ state: 'hasValue', contents: [] }),
      },
      set: jest.fn(),
      reset: jest.fn(),
    }),
}));

jest.mock('~/hooks/Files/useSetFilesToDelete', () => () => mockSetFilesToDelete);
jest.mock('~/hooks/Agents/useCodeApprovalMode', () => () => ({
  modes: ['ask', 'acceptEdits'],
  selected: 'ask',
}));
jest.mock('~/hooks/Agents/useCodeWorkspace', () => () => mockCodeWorkspace);
jest.mock('~/hooks/Conversations/useGetConversation', () => () => mockGetLatestConversation);
jest.mock('~/hooks/Conversations/useGetSender', () => () => mockGetSender);
jest.mock('~/hooks/Input/useUserKey', () => () => ({ getExpiry: mockGetExpiry }));
jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: null }),
}));
jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    isTemporary: 'isTemporary',
    isSubmittingFamily: () => 'isSubmitting',
    submissionStartFamily: () => 'submissionStart',
    showStopButtonByIndex: () => 'showStopButton',
    pendingManualSkillsByConvoId: () => 'pendingManualSkills',
    pendingQuotesByConvoId: () => 'pendingQuotes',
    messagesSiblingIdxFamily: () => 'messagesSiblingIdx',
    conversationByKeySelector: () => 'conversation',
  },
  useGetEphemeralAgent: () => mockGetEphemeralAgent,
}));
jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  logger: {
    log: jest.fn(),
    dir: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
  createDualMessageContent: jest.fn(() => []),
  getRouteChatProjectId: jest.fn(() => null),
  requestChatFocus: jest.fn(),
}));

const userMessage = (messageId: string, parentMessageId = '00000000-0000-0000-0000-000000000000') =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: true,
    sender: 'User',
    text: messageId,
  }) as TMessage;

const assistantMessage = (messageId: string, parentMessageId: string) =>
  ({
    messageId,
    parentMessageId,
    conversationId: 'conversation-1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: messageId,
  }) as TMessage;

const conversation = (conversationId: string) =>
  ({
    conversationId,
    endpoint: EModelEndpoint.agents,
    model: 'gpt-4o',
    agent_id: 'agent-1',
  }) as TConversation;

function renderAsk(
  messages: TMessage[] | undefined,
  conversationId = 'conversation-1',
  options: { endpoint?: TConversation['endpoint']; isSubmitting?: boolean } = {},
) {
  const setMessages = jest.fn();
  const setSubmission = jest.fn();
  const getMessages = jest.fn(() => messages);
  const immutableConversation = conversation(conversationId);
  if ('endpoint' in options) {
    immutableConversation.endpoint = options.endpoint ?? null;
  }
  const hook = renderHook(() =>
    useChatFunctions({
      isSubmitting: options.isSubmitting ?? false,
      latestMessage: messages?.at(-1) ?? null,
      conversation: immutableConversation,
      getMessages,
      setMessages,
      setSubmission,
    }),
  );

  return { ...hook, getMessages, setMessages, setSubmission };
}

describe('useChatFunctions ask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
    mockGetLatestConversation.mockReturnValue(null);
    mockResolveCodeWorkspaceSubmission.mockReturnValue({});
  });

  it('reads an approval-mode selection made immediately before send', () => {
    mockGetLatestConversation.mockReturnValue({
      ...conversation('conversation-1'),
      codeApprovalMode: 'acceptEdits',
    });
    const { result, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Edit the file', conversationId: 'conversation-1' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.codeApprovalMode).toBe('acceptEdits');
  });

  it('preallocates a durable Agents user id for the optimistic response anchor', () => {
    const { result, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Queue safely', conversationId: 'conversation-1' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    const userMessageId = submission.userMessage.messageId;
    expect(submission.endpointOption.overrideUserMessageId).toBe(
      `${userMessageId}${Constants.COMMON_DIVIDER}0`,
    );
    expect(createPayload(submission).payload.overrideUserMessageId).toBe(
      `${userMessageId}${Constants.COMMON_DIVIDER}0`,
    );
    expect(submission.initialResponse?.clientQueueParentMessageId).toBe(userMessageId);
  });

  it('submits the latest validated workspace selection', () => {
    const selection = { environmentId: 'personal-vm', workspaceId: 'project-a' };
    mockResolveCodeWorkspaceSubmission.mockReturnValue({ codeWorkspaces: [selection] });
    mockGetLatestConversation.mockReturnValue({
      ...conversation('conversation-1'),
      codeEnvironmentMode: 'attached',
      codeWorkspaces: [selection],
    });
    const { result, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Edit the file', conversationId: 'conversation-1' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(mockResolveCodeWorkspaceSubmission).toHaveBeenCalledWith([selection], 'attached');
    expect(submission.codeWorkspaces).toEqual([selection]);
  });

  it('refuses to send when workspace submission resolution is not ready', () => {
    mockResolveCodeWorkspaceSubmission.mockReturnValue(undefined);
    const { result, setSubmission } = renderAsk([]);

    expect(result.current.ask({ text: 'Edit the file', conversationId: 'conversation-1' })).toBe(
      false,
    );
    expect(setSubmission).not.toHaveBeenCalled();
  });

  it('refuses to send to an existing conversation before its history loads', () => {
    const { result, getMessages, setMessages, setSubmission } = renderAsk(undefined);

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(askResult!).toBe(false);
    expect(getMessages).toHaveBeenCalledWith('conversation-1');
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[useChatFunctions] Refusing to send before existing conversation history loads',
    );
  });

  it('synchronously reports a refusal while another submit is in flight', () => {
    const { result, setMessages, setSubmission } = renderAsk([], 'conversation-1', {
      isSubmitting: true,
    });

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'queued follow-up' });
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockSetShowStopButton).not.toHaveBeenCalled();
    expect(mockCancelQueries).not.toHaveBeenCalled();
  });

  it('reports a refusal when no endpoint is available', () => {
    const { result, setMessages, setSubmission } = renderAsk([], 'conversation-1', {
      endpoint: null,
    });

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask({ text: 'queued follow-up' });
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
    expect(mockSetShowStopButton).not.toHaveBeenCalled();
  });

  it.each([
    ['empty text', { text: '   ' }, undefined],
    ['the search view', { text: 'queued follow-up', conversationId: 'search' }, undefined],
    ['a continue without a latest message', { text: 'continue' }, { isContinued: true }],
  ])('reports a refusal for %s', (_label, props, askOptions) => {
    const { result, setMessages, setSubmission } = renderAsk([]);

    let askResult: ReturnType<typeof result.current.ask>;
    act(() => {
      askResult = result.current.ask(props, askOptions);
    });

    expect(askResult!).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setSubmission).not.toHaveBeenCalled();
  });

  it('allows an existing conversation whose loaded history is empty', () => {
    const { result, setMessages, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: 'conversation-1' });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });

  it('allows a new conversation before its message cache exists', () => {
    const newConversationId = Constants.NEW_CONVO as string;
    const { result, setMessages, setSubmission } = renderAsk(undefined, newConversationId);

    act(() => {
      result.current.ask({ text: 'Hello', conversationId: newConversationId });
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
    expect(mockCancelQueries).not.toHaveBeenCalled();
  });

  it('allows explicit override messages before the cache exists', () => {
    const { result, setMessages, setSubmission } = renderAsk(undefined);

    act(() => {
      result.current.ask(
        { text: 'Hello', conversationId: 'conversation-1' },
        { overrideMessages: [] },
      );
    });

    expect(setMessages).toHaveBeenCalled();
    expect(setSubmission).toHaveBeenCalled();
  });
});

describe('useChatFunctions history cancellation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 100, cacheTime: Infinity } },
    });
    mockQueryClient = queryClient;
  });

  afterEach(() => {
    queryClient.clear();
    mockQueryClient = undefined;
    jest.useRealTimers();
  });

  it.each(['scheduled', 'in-flight'])(
    'keeps an equal-length regenerate during the %s retry of an idle history refetch',
    async (retryPhase) => {
      const conversationId = 'conversation-1';
      const queryKey = [QueryKeys.messages, conversationId];
      const persistedMessages = [
        userMessage('user-1'),
        assistantMessage('assistant-1', 'user-1'),
      ].map((message) => ({
        ...message,
        createdAt: '2026-05-21T12:00:00.000Z',
        updatedAt: '2026-05-21T12:00:00.000Z',
      }));
      queryClient.setQueryData(queryKey, persistedMessages);
      let resolveHistory!: (messages: TMessage[]) => void;
      const historyResponse = new Promise<TMessage[]>((resolve) => {
        resolveHistory = resolve;
      });
      const getHistory = jest
        .mocked(dataService.getMessagesByConvoId)
        .mockRejectedValueOnce(new Error('Foreground history request failed'))
        .mockReturnValue(historyResponse);
      const cancelQueries = jest.spyOn(queryClient, 'cancelQueries');
      const liveMessages = [
        persistedMessages[0],
        { ...persistedMessages[1], text: 'Newer locally cached answer' },
      ];
      const setMessages = jest.fn((messages: TMessage[]) => {
        expect(queryClient.getQueryData(queryKey)).toEqual(liveMessages);
        queryClient.setQueryData(queryKey, messages);
      });
      const setSubmission = jest.fn();
      const { result, rerender } = renderHook(
        ({ isSubmitting }) => ({
          history: useGetMessagesByConvoId(
            conversationId,
            { enabled: !isSubmitting },
            { isStreaming: isSubmitting },
          ),
          ...useChatFunctions({
            isSubmitting,
            latestMessage: persistedMessages[1],
            conversation: conversation(conversationId),
            getMessages: () => queryClient.getQueryData<TMessage[]>(queryKey),
            setMessages,
            setSubmission,
          }),
        }),
        {
          initialProps: { isSubmitting: false },
          wrapper: ({ children }) =>
            createElement(
              QueryClientProvider,
              { client: queryClient },
              createElement(MemoryRouter, { initialEntries: [`/c/${conversationId}`] }, children),
            ),
        },
      );

      const refetch = result.current.history.refetch();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(getHistory).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryState(queryKey)).toMatchObject({
        fetchStatus: 'fetching',
        fetchFailureCount: 1,
      });
      if (retryPhase === 'in-flight') {
        await act(async () => {
          await jest.advanceTimersByTimeAsync(100);
        });
        expect(getHistory).toHaveBeenCalledTimes(2);
      }

      const unrelatedKeys = [
        [QueryKeys.messages, 'conversation-2'],
        [...queryKey, 'other-query'],
      ];
      const unrelatedRequests = unrelatedKeys.map((key) =>
        queryClient.fetchQuery({ queryKey: key, queryFn: () => historyResponse }),
      );
      act(() => {
        queryClient.setQueryData(queryKey, liveMessages);
        expect(
          result.current.ask(persistedMessages[0], {
            isRegenerate: true,
            targetResponseMessageId: 'assistant-1',
          }),
        ).toBeUndefined();
        expect(setMessages).toHaveBeenCalledTimes(1);
        expect(setSubmission).toHaveBeenCalledTimes(1);
      });
      rerender({ isSubmitting: true });
      const optimisticMessages = queryClient.getQueryData<TMessage[]>(queryKey);
      expect(optimisticMessages).toHaveLength(persistedMessages.length);
      expect(optimisticMessages?.at(-1)?.messageId).toBe('assistant-1_');
      for (const key of unrelatedKeys) {
        expect(queryClient.getQueryState(key)?.fetchStatus).toBe('fetching');
      }

      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
        resolveHistory(persistedMessages);
        await Promise.all([refetch, ...unrelatedRequests]);
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(queryClient.getQueryData(queryKey)).toBe(optimisticMessages);
      expect(result.current.history.data).toBe(optimisticMessages);
      expect(getHistory).toHaveBeenCalledTimes(retryPhase === 'scheduled' ? 1 : 2);
      expect(cancelQueries).toHaveBeenCalledTimes(1);
      expect(cancelQueries).toHaveBeenCalledWith({ queryKey, exact: true }, { revert: false });
      expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
        setMessages.mock.invocationCallOrder[0],
      );
      expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
        setSubmission.mock.invocationCallOrder[0],
      );
    },
  );
});

describe('useChatFunctions regenerate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  it('keys a non-tail regenerate to the selected assistant response', () => {
    let messages = [
      userMessage('user-1'),
      assistantMessage('assistant-1', 'user-1'),
      userMessage('user-2', 'assistant-1'),
      assistantMessage('assistant-2', 'user-2'),
      userMessage('user-3', 'assistant-2'),
      assistantMessage('assistant-3', 'user-3'),
    ];
    const setMessages = jest.fn((nextMessages: TMessage[]) => {
      messages = nextMessages;
    });
    const setSubmission = jest.fn();
    const conversation = {
      conversationId: 'conversation-1',
      endpoint: EModelEndpoint.agents,
      model: 'gpt-4o',
      agent_id: 'agent-1',
    } as TConversation;

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: messages[5],
        conversation,
        getMessages: () => messages,
        setMessages,
        setSubmission,
      }),
    );

    act(() => {
      result.current.regenerate(messages[1]);
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.codeApprovalMode).toBe('ask');
    expect(submission.userMessage.overrideParentMessageId).toBe('user-1');
    expect(submission.userMessage.responseMessageId).toBe('assistant-1_');
    expect(submission.initialResponse?.messageId).toBe('assistant-1_');
    expect(submission.initialResponse?.parentMessageId).toBe('user-1');
    expect(submission.initialResponse?.clientQueueParentMessageId).toBe('user-1');
    expect(submission.messages.map((message) => message.messageId)).toEqual(['user-1']);
    expect(submission.regenerateMessages?.map((message) => message.messageId)).toEqual([
      'user-1',
      'assistant-1',
      'user-2',
      'assistant-2',
      'user-3',
      'assistant-3',
    ]);
    expect(
      setMessages.mock.calls.at(-1)?.[0].map((message: TMessage) => message.messageId),
    ).toEqual(['user-1', 'assistant-1_']);
    expect(messages.at(-1)?.messageId).toBe('assistant-1_');
  });

  it.each(['assistant-1', 'assistant_1_'])(
    'marks an edited optimistic response %s with its durable user anchor',
    (responseMessageId) => {
      const parent = userMessage('user-1');
      const response = {
        ...assistantMessage(responseMessageId, parent.messageId),
        content: [{ type: ContentTypes.TEXT, [ContentTypes.TEXT]: 'before' }],
      } as TMessage;
      const { result, setSubmission } = renderAsk([parent, response]);

      act(() => {
        result.current.ask(
          { ...parent },
          {
            isRegenerate: true,
            isEdited: true,
            editedMessageId: responseMessageId,
            editedContent: {
              index: 0,
              type: ContentTypes.TEXT,
              [ContentTypes.TEXT]: 'after',
            },
          },
        );
      });

      const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
      expect(submission.initialResponse?.messageId).toBe(responseMessageId);
      expect(submission.initialResponse?.clientQueueParentMessageId).toBe('user-1');
    },
  );
});

describe('useChatFunctions ask attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  /** The server titles an attachment-only turn from the submitted filenames
   *  (getAttachmentTitleText), so the fresh-file mapping must carry them. */
  it('carries the filename on freshly attached files', () => {
    const setMessages = jest.fn();
    const setSubmission = jest.fn();
    const setFiles = jest.fn();
    const files = new Map([
      [
        'file-1',
        {
          file_id: 'file-1',
          filepath: '/uploads/file-1',
          filename: 'quarterly-report.pdf',
          type: 'application/pdf',
        },
      ],
    ]) as unknown as Parameters<typeof useChatFunctions>[0]['files'];

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: null,
        conversation: conversation(Constants.NEW_CONVO as string),
        getMessages: () => [],
        setMessages,
        setSubmission,
        files,
        setFiles,
      }),
    );

    act(() => {
      result.current.ask({ text: '' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.files?.[0]).toMatchObject({
      file_id: 'file-1',
      filename: 'quarterly-report.pdf',
    });
  });

  it('marks files consumed through overrideFiles as submitted', () => {
    const overrideFiles = [
      {
        file_id: 'queued-override-file',
        temp_file_id: 'queued-override-temp-file',
        filepath: '/uploads/queued-override-file',
        filename: 'queued-override.txt',
        type: 'text/plain',
      },
    ];
    const setMessages = jest.fn();
    const setSubmission = jest.fn();
    const setFiles = jest.fn();

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: null,
        conversation: conversation(Constants.NEW_CONVO as string),
        getMessages: () => [],
        setMessages,
        setSubmission,
        files: new Map(),
        setFiles,
      }),
    );

    act(() => {
      result.current.ask(
        { text: 'queued override' },
        {
          overrideFiles,
        },
      );
    });

    expect(isPasteSubmitted('queued-override-file')).toBe(true);
    expect(isPasteSubmitted('queued-override-temp-file')).toBe(true);
  });
});

describe('useChatFunctions ask compaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
  });

  it('submits a summarize-only turn hung off the leaf without a new user bubble', () => {
    const messages = [userMessage('u1'), assistantMessage('a1', 'u1')];
    const { result, setMessages, setSubmission } = renderAsk(messages);

    act(() => {
      result.current.ask(
        { text: '', conversationId: 'conversation-1', messageId: 'a1', parentMessageId: 'u1' },
        { compact: true },
      );
    });

    expect(setSubmission).toHaveBeenCalledTimes(1);
    const submission = setSubmission.mock.calls[0][0] as TSubmission;
    expect(submission.compact).toBe(true);
    expect(submission.isRegenerate).toBe(true);
    expect(submission.initialResponse?.parentMessageId).toBe('a1');
    expect(submission.initialResponse?.messageId).toBe('a1_');
    /** The leaf stands in for the user message so an error lands under it. */
    expect(submission.userMessage.messageId).toBe('a1');
    expect(submission.userMessage.overrideParentMessageId).toBeNull();
    expect(submission.userMessage.files).toBeUndefined();
    expect(submission.messages.map((message) => message.messageId)).toEqual(['u1', 'a1']);
    expect(submission.regenerateMessages?.map((message) => message.messageId)).toEqual([
      'u1',
      'a1',
    ]);

    const rendered = setMessages.mock.calls[0][0] as TMessage[];
    expect(rendered.map((message) => message.messageId)).toEqual(['u1', 'a1', 'a1_']);
  });

  it('does not re-attach the leaf files a user-message leaf carries', () => {
    const leaf = { ...userMessage('u2', 'a1'), files: [{ file_id: 'f1' }] } as TMessage;
    const messages = [userMessage('u1'), assistantMessage('a1', 'u1'), leaf];
    const { result, setSubmission } = renderAsk(messages);

    act(() => {
      result.current.ask(
        { text: '', conversationId: 'conversation-1', messageId: 'u2', parentMessageId: 'a1' },
        { compact: true },
      );
    });

    const submission = setSubmission.mock.calls[0][0] as TSubmission;
    expect(submission.userMessage.files).toBeUndefined();
    expect(submission.initialResponse?.parentMessageId).toBe('u2');
  });
});

describe('useChatFunctions ask compaction and the composer', () => {
  it('leaves files staged in the composer untouched', () => {
    const setMessages = jest.fn();
    const setSubmission = jest.fn();
    const setFiles = jest.fn();
    const files = new Map([
      [
        'staged-file',
        {
          file_id: 'staged-file',
          filepath: '/uploads/staged-file',
          filename: 'next-message.pdf',
          type: 'application/pdf',
        },
      ],
    ]) as unknown as Parameters<typeof useChatFunctions>[0]['files'];
    const messages = [userMessage('u1'), assistantMessage('a1', 'u1')];

    const { result } = renderHook(() =>
      useChatFunctions({
        isSubmitting: false,
        latestMessage: messages[1],
        conversation: conversation('conversation-1'),
        getMessages: () => messages,
        setMessages,
        setSubmission,
        files,
        setFiles,
      }),
    );

    act(() => {
      result.current.ask(
        { text: '', conversationId: 'conversation-1', messageId: 'a1', parentMessageId: 'a1' },
        { compact: true },
      );
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.compact).toBe(true);
    expect(submission.userMessage.files).toBeUndefined();
    expect(submission.userMessage.parentMessageId).toBe('a1');
    expect(setFiles).not.toHaveBeenCalled();
    expect(isPasteSubmitted('staged-file')).toBe(false);
  });
});
