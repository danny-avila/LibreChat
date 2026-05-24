import React from 'react';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys, type TConversation, type TMessage } from 'librechat-data-provider';
import { useLatestMessage, useLatestMessageId } from '~/hooks/Messages/useLatestMessage';
import store from '~/store';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const userMessage = {
  messageId: 'user-message',
  parentMessageId: '00000000-0000-0000-0000-000000000000',
  conversationId: conversation.conversationId,
  text: 'Hello',
  isCreatedByUser: true,
} as TMessage;

const assistantMessage = {
  messageId: 'assistant-message',
  parentMessageId: userMessage.messageId,
  conversationId: conversation.conversationId,
  text: 'Hi there',
  isCreatedByUser: false,
} as TMessage;

const olderAssistantMessage = {
  ...assistantMessage,
  messageId: 'assistant-older',
  text: 'Older branch',
} as TMessage;

const olderFollowUpUserMessage = {
  ...userMessage,
  messageId: 'user-older-follow-up',
  parentMessageId: olderAssistantMessage.messageId,
  text: 'Follow up on older branch',
} as TMessage;

const olderFollowUpAssistantMessage = {
  ...assistantMessage,
  messageId: 'assistant-older-follow-up',
  parentMessageId: olderFollowUpUserMessage.messageId,
  text: 'Older branch tail',
} as TMessage;

function createWrapper(
  queryClient = createQueryClient(),
  initializeState?: (snapshot: MutableSnapshot) => void,
) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <RecoilRoot initializeState={initializeState}>
          <MemoryRouter initialEntries={['/c/conversation-1']}>{children}</MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>
    );
  };
}

describe('useLatestMessage', () => {
  it('returns null when there is no active conversation', () => {
    const { result } = renderHook(() => useLatestMessage(0), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBeNull();
  });

  it('returns the tail message from the active conversation cache', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation.conversationId],
      [userMessage, assistantMessage],
    );

    const { result } = renderHook(() => useLatestMessage(0), {
      wrapper: createWrapper(queryClient, ({ set }) => {
        set(store.conversationByIndex(0), conversation);
      }),
    });

    expect(result.current).toEqual(
      expect.objectContaining({
        messageId: assistantMessage.messageId,
        depth: 1,
      }),
    );
  });

  it('returns the active branch tail when sibling selection points at an older branch', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation.conversationId],
      [
        userMessage,
        olderAssistantMessage,
        olderFollowUpUserMessage,
        olderFollowUpAssistantMessage,
        assistantMessage,
      ],
    );

    const { result } = renderHook(() => useLatestMessage(0), {
      wrapper: createWrapper(queryClient, ({ set }) => {
        set(store.conversationByIndex(0), conversation);
        set(store.messagesSiblingIdxFamily(userMessage.messageId), 1);
      }),
    });

    expect(result.current).toEqual(
      expect.objectContaining({
        messageId: olderFollowUpAssistantMessage.messageId,
        depth: 3,
      }),
    );
  });

  it('keeps latestMessageId stable across token-only cache writes', () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData<TMessage[]>(
      [QueryKeys.messages, conversation.conversationId],
      [userMessage, assistantMessage],
    );
    let renderCount = 0;

    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useLatestMessageId(0);
      },
      {
        wrapper: createWrapper(queryClient, ({ set }) => {
          set(store.conversationByIndex(0), conversation);
        }),
      },
    );

    const firstId = result.current;

    act(() => {
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation.conversationId],
        [userMessage, { ...assistantMessage, text: 'Hi there, still streaming' }],
      );
    });

    expect(result.current).toBe(firstId);
    expect(renderCount).toBe(1);
  });
});
