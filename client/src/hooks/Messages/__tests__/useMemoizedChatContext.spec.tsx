import { renderHook } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import useMemoizedChatContext from '../useMemoizedChatContext';
import { useChatContext } from '~/Providers';

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
}));

const mockUseChatContext = useChatContext as jest.MockedFunction<typeof useChatContext>;

const conversation = {
  conversationId: 'convo-id',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const message = (overrides: Partial<TMessage> = {}) =>
  ({
    messageId: 'assistant-response_',
    parentMessageId: 'user-message',
    conversationId: 'convo-id',
    sender: 'Assistant',
    text: '',
    isCreatedByUser: false,
    children: [],
    ...overrides,
  }) as TMessage;

/* Held outside the factory: the callbacks are `chatContext` deps themselves, so a
   fresh mock per render would mask whether the conversation broke the memo. */
const ask = jest.fn();
const regenerate = jest.fn();
const handleContinue = jest.fn();

const chatContextValue = (
  latestMessageId: string | undefined,
  convo: TConversation = conversation,
) => ({
  ask,
  index: 0,
  regenerate,
  conversation: convo,
  latestMessageId,
  latestMessageDepth: -1,
  handleContinue,
  isSubmitting: true,
});

function mockChatContext(latestMessageId: string | undefined) {
  mockUseChatContext.mockReturnValue(
    chatContextValue(latestMessageId) as unknown as ReturnType<typeof useChatContext>,
  );
}

/** Rerenders with a conversation that differs only in `overrides`. */
function rerenderWithConversation(rerender: () => void, overrides: Partial<TConversation>) {
  mockUseChatContext.mockReturnValue(
    chatContextValue('assistant-response_', {
      ...conversation,
      ...overrides,
    }) as unknown as ReturnType<typeof useChatContext>,
  );
  rerender();
}

describe('useMemoizedChatContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats the latest message as submitting while streaming', () => {
    mockChatContext('assistant-response_');

    const { result } = renderHook(() => useMemoizedChatContext(message(), true));

    expect(result.current.effectiveIsSubmitting).toBe(true);
  });

  it('requires latestMessageId alignment before marking a row as submitting', () => {
    mockChatContext(undefined);

    const { result } = renderHook(() => useMemoizedChatContext(message(), true));

    expect(result.current.effectiveIsSubmitting).toBe(false);
    expect(result.current.chatContext.isSubmitting).toBe(true);
  });

  it('keeps chatContext stable across metadata-only updates such as the title', () => {
    mockChatContext('assistant-response_');
    const { result, rerender } = renderHook(() => useMemoizedChatContext(message(), true));
    const before = result.current.chatContext;

    rerenderWithConversation(rerender, { title: 'Generated title' });

    expect(result.current.chatContext).toBe(before);
  });

  /* Memo'd rows bail on `prev.chatContext === next.chatContext`, and the header
     hover reads the label, so toggling it on the same model must break the memo. */
  it('produces a new chatContext when only the model label changes', () => {
    mockChatContext('assistant-response_');
    const { result, rerender } = renderHook(() => useMemoizedChatContext(message(), true));
    const before = result.current.chatContext;

    rerenderWithConversation(rerender, { modelLabel: 'Acme Assistant' });
    expect(result.current.chatContext).not.toBe(before);
    expect(result.current.chatContext.conversation?.modelLabel).toBe('Acme Assistant');

    const withLabel = result.current.chatContext;
    rerenderWithConversation(rerender, { chatGptLabel: 'Legacy label' });
    expect(result.current.chatContext).not.toBe(withLabel);
  });
});
