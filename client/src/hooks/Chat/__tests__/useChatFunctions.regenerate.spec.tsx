import { renderHook, act } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type {
  TConversation,
  TMessage,
  TSubmission,
  TReasoningOverride,
} from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { pendingReasoningOverrideFamily } from '~/components/Chat/Input/Composer/state';
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
const mockLoggerWarn = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: mockGetQueryData,
    getQueryState: jest.fn(() => undefined),
  }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
  useSetRecoilState: (atom: unknown) =>
    String(atom).includes('isSubmitting') ? mockSetIsSubmitting : mockSetShowStopButton,
  useRecoilCallback: (factory: any) =>
    factory({
      snapshot: {
        getLoadable: (_atom: unknown) => ({
          state: 'hasValue',
          contents: [],
        }),
      },
      set: jest.fn(),
      reset: jest.fn(),
    }),
}));

jest.mock('~/hooks/Files/useSetFilesToDelete', () => () => mockSetFilesToDelete);
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
  options: {
    endpoint?: TConversation['endpoint'];
    isSubmitting?: boolean;
    reasoningOverride?: TReasoningOverride;
  } = {},
) {
  const setMessages = jest.fn();
  const setSubmission = jest.fn();
  const getMessages = jest.fn(() => messages);
  const immutableConversation = conversation(conversationId);
  if ('endpoint' in options) {
    immutableConversation.endpoint = options.endpoint ?? null;
  }
  const reasoningStore = createStore();
  reasoningStore.set(pendingReasoningOverrideFamily(conversationId), options.reasoningOverride);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={reasoningStore}>{children}</JotaiProvider>
  );
  const hook = renderHook(
    () =>
      useChatFunctions({
        isSubmitting: options.isSubmitting ?? false,
        latestMessage: messages?.at(-1) ?? null,
        conversation: immutableConversation,
        getMessages,
        setMessages,
        setSubmission,
      }),
    { wrapper },
  );

  return { ...hook, getMessages, setMessages, setSubmission, reasoningStore };
}

describe('useChatFunctions ask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue({});
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
  });

  it('refuses a second submit fired in the same task, before isSubmitting commits', () => {
    const { result, setSubmission } = renderAsk([]);

    let first: ReturnType<typeof result.current.ask>;
    let second: ReturnType<typeof result.current.ask>;
    act(() => {
      first = result.current.ask({ text: 'double enter', conversationId: 'conversation-1' });
      second = result.current.ask({ text: 'double enter', conversationId: 'conversation-1' });
    });

    expect(first!).not.toBe(false);
    expect(second!).toBe(false);
    expect(setSubmission).toHaveBeenCalledTimes(1);
  });

  it('releases the in-flight guard on the next commit rather than latching it', () => {
    const { result, rerender, setSubmission } = renderAsk([]);

    act(() => {
      result.current.ask({ text: 'first turn', conversationId: 'conversation-1' });
    });
    /* `isSubmitting` never turns true here, standing in for a start that fails
       outright: the next commit has to release the guard on its own instead of
       latching the composer shut. */
    act(() => {
      rerender();
    });
    act(() => {
      result.current.ask({ text: 'second turn', conversationId: 'conversation-1' });
    });

    expect(setSubmission).toHaveBeenCalledTimes(2);
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

  it('stores an explicit reasoning override on only the submitted user turn', () => {
    const { result, setSubmission } = renderAsk([]);
    const override = { key: 'reasoning_effort', value: 'high' } as TReasoningOverride;

    act(() => {
      result.current.ask({ text: 'Think carefully' }, { overrideReasoning: override });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.reasoningOverride).toEqual(override);
    expect(submission.conversation).not.toHaveProperty('reasoning_effort', 'high');
    expect(submission.endpointOption).not.toHaveProperty('reasoning_effort', 'high');
  });

  it('drains a staged reasoning override onto a fresh submission exactly once', () => {
    const override = { key: 'reasoning_effort', value: 'high' } as TReasoningOverride;
    const { result, setSubmission, reasoningStore } = renderAsk([], 'conversation-1', {
      reasoningOverride: override,
    });

    act(() => {
      result.current.ask({ text: 'Think carefully' });
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.reasoningOverride).toEqual(override);
    expect(reasoningStore.get(pendingReasoningOverrideFamily('conversation-1'))).toBeUndefined();
  });
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
    expect(submission.userMessage.overrideParentMessageId).toBe('user-1');
    expect(submission.userMessage.responseMessageId).toBe('assistant-1_');
    expect(submission.initialResponse?.messageId).toBe('assistant-1_');
    expect(submission.initialResponse?.parentMessageId).toBe('user-1');
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

  it('replays the original user turn reasoning override on regenerate', () => {
    const parent = {
      ...userMessage('user-reasoning'),
      reasoningOverride: { key: 'effort', value: 'max' },
    } as TMessage;
    const response = assistantMessage('assistant-reasoning', parent.messageId);
    const { result, setSubmission } = renderAsk([parent, response]);

    act(() => {
      result.current.regenerate(response);
    });

    const submission = setSubmission.mock.calls.at(-1)?.[0] as TSubmission;
    expect(submission.userMessage.reasoningOverride).toEqual(parent.reasoningOverride);
  });
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
