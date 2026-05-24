import React from 'react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Constants } from 'librechat-data-provider';
import type { TConversation, TMessage, EventSubmission } from 'librechat-data-provider';
import useEventHandlers, { type EventHandlerParams } from '../useEventHandlers';
import { renderHook, act } from '@testing-library/react';

const mockAnnouncePolite = jest.fn();
const mockApplyAgentTemplate = jest.fn();
const mockContentHandler = jest.fn();
const mockResetContentHandler = jest.fn();
const mockStepHandler = jest.fn();
const mockClearStepMaps = jest.fn();
const mockResetSubagentAtoms = jest.fn();
const mockSyncStepMessage = jest.fn();
const mockAttachmentHandler = jest.fn();

jest.mock('~/Providers', () => ({
  useLiveAnnouncer: () => ({ announcePolite: mockAnnouncePolite }),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ token: 'token' }),
}));

jest.mock('~/hooks/Agents', () => ({
  useApplyAgentTemplate: () => mockApplyAgentTemplate,
}));

jest.mock('~/hooks/SSE/useContentHandler', () => () => ({
  contentHandler: mockContentHandler,
  resetContentHandler: mockResetContentHandler,
}));

jest.mock('~/hooks/SSE/useStepHandler', () => () => ({
  stepHandler: mockStepHandler,
  clearStepMaps: mockClearStepMaps,
  resetSubagentAtoms: mockResetSubagentAtoms,
  syncStepMessage: mockSyncStepMessage,
}));

jest.mock('~/hooks/SSE/useAttachmentHandler', () => () => mockAttachmentHandler);

const conversation = {
  conversationId: 'convo-id',
  endpoint: 'openAI',
  model: 'gpt-4',
  title: 'New Chat',
} as TConversation;

const userMessage = {
  messageId: 'user-message',
  parentMessageId: Constants.NO_PARENT,
  conversationId: 'convo-id',
  sender: 'User',
  text: 'hello',
  isCreatedByUser: true,
} as TMessage;

const initialResponse = {
  messageId: 'user-message_',
  parentMessageId: 'user-message',
  conversationId: 'convo-id',
  sender: 'Assistant',
  text: '',
  isCreatedByUser: false,
} as TMessage;

const submission = {
  conversation,
  messages: [] as TMessage[],
  userMessage,
  initialResponse,
} as unknown as EventSubmission;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter initialEntries={['/c/convo-id']}>{children}</MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>
  );
}

const expectedCreatedAssistantResponse = () =>
  expect.objectContaining({
    messageId: 'user-message_',
    parentMessageId: 'user-message',
    isCreatedByUser: false,
  });

type EventHandlerSpies = Omit<
  EventHandlerParams,
  | 'setMessages'
  | 'setLatestMessage'
  | 'getMessages'
  | 'setCompleted'
  | 'setIsSubmitting'
  | 'setShowStopButton'
> & {
  setMessages: jest.Mock;
  setLatestMessage: jest.Mock;
  getMessages: jest.Mock;
  setCompleted: jest.Mock;
  setIsSubmitting: jest.Mock;
  setShowStopButton: jest.Mock;
};

function renderEventHandlersWithSpies(overrides: Partial<EventHandlerSpies> = {}) {
  const defaultSpies: EventHandlerSpies = {
    setMessages: jest.fn(),
    setLatestMessage: jest.fn(),
    getMessages: jest.fn(() => []),
    setCompleted: jest.fn(),
    setIsSubmitting: jest.fn(),
    setShowStopButton: jest.fn(),
  };
  const spies: EventHandlerSpies = { ...defaultSpies, ...overrides };

  const { result } = renderHook(() => useEventHandlers(spies), { wrapper });

  return { result, ...spies };
}

describe('useEventHandlers latest-message transitions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps latestMessage aligned after replacing optimistic messages in createdHandler', () => {
    const { result, setMessages, setLatestMessage } = renderEventHandlersWithSpies();

    act(() => {
      result.current.createdHandler(
        { created: true } as unknown as Parameters<typeof result.current.createdHandler>[0],
        submission,
      );
    });

    expect(setMessages).toHaveBeenCalledWith([userMessage, expectedCreatedAssistantResponse()]);
    expect(setLatestMessage).toHaveBeenCalledWith(expectedCreatedAssistantResponse());
    expect(setLatestMessage.mock.invocationCallOrder[0]).toBeLessThan(
      setMessages.mock.invocationCallOrder[0],
    );
  });

  it('keeps latestMessage aligned when createdHandler starts a regeneration', () => {
    const previousMessage = {
      ...userMessage,
      messageId: 'previous-message',
    } as TMessage;
    const regenerateSubmission = {
      ...submission,
      messages: [previousMessage],
      isRegenerate: true,
    } as unknown as EventSubmission;
    const { result, setMessages, setLatestMessage } = renderEventHandlersWithSpies({
      getMessages: jest.fn(() => [previousMessage]),
    });

    act(() => {
      result.current.createdHandler(
        { created: true } as unknown as Parameters<typeof result.current.createdHandler>[0],
        regenerateSubmission,
      );
    });

    expect(setMessages).toHaveBeenCalledWith([previousMessage, expectedCreatedAssistantResponse()]);
    expect(setLatestMessage).toHaveBeenCalledWith(expectedCreatedAssistantResponse());
    expect(setLatestMessage.mock.invocationCallOrder[0]).toBeLessThan(
      setMessages.mock.invocationCallOrder[0],
    );
  });

  it('keeps latestMessage aligned after replacing optimistic messages in syncHandler', () => {
    const requestMessage = { ...userMessage, messageId: 'server-user-message' } as TMessage;
    const responseMessage = {
      ...initialResponse,
      messageId: 'server-assistant-response',
      parentMessageId: 'server-user-message',
    } as TMessage;
    const setShowStopButton = jest.fn();
    const { result, setMessages, setLatestMessage } = renderEventHandlersWithSpies({
      getMessages: jest.fn(() => [userMessage, initialResponse]),
      setShowStopButton,
    });

    act(() => {
      result.current.syncHandler(
        {
          sync: true,
          conversationId: 'convo-id',
          thread_id: 'thread-id',
          requestMessage,
          responseMessage,
        },
        submission,
      );
    });

    expect(setMessages).toHaveBeenCalledWith([requestMessage, responseMessage]);
    expect(setShowStopButton).toHaveBeenCalledWith(true);
    expect(setLatestMessage).toHaveBeenCalledWith(responseMessage);
    expect(setLatestMessage.mock.invocationCallOrder[0]).toBeLessThan(
      setMessages.mock.invocationCallOrder[0],
    );
  });
});
