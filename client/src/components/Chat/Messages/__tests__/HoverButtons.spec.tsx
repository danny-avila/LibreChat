import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ContentTypes,
  EModelEndpoint,
  type TConversation,
  type TMessage,
} from 'librechat-data-provider';
import { hasCopyableText } from '~/hooks/Messages/useCopyToClipboard';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import store from '~/store';

const conversation = {
  conversationId: 'convo-1',
  endpoint: EModelEndpoint.agents,
  title: 'Test',
} as TConversation;

const userMessage = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: null,
  isCreatedByUser: true,
  text: 'tell me a long story',
} as TMessage;

function renderHoverButtons({
  isSubmitting,
  message = userMessage,
  isLast = false,
  latestMessageId = 'assistant-1',
  getCanCopy = () => hasCopyableText({ text: message.text, content: message.content }),
}: {
  isSubmitting: boolean;
  message?: TMessage;
  isLast?: boolean;
  latestMessageId?: string;
  getCanCopy?: () => boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const initializeState = ({ set }: MutableSnapshot) => set(store.textToSpeech, false);

  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MemoryRouter>
          <HoverButtons
            index={0}
            isLast={isLast}
            isEditing={false}
            message={message}
            conversation={conversation}
            isSubmitting={isSubmitting}
            enterEdit={jest.fn()}
            regenerate={jest.fn()}
            handleContinue={jest.fn()}
            copyToClipboard={jest.fn()}
            getCanCopy={getCanCopy}
            latestMessageId={latestMessageId}
          />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  return container;
}

describe('HoverButtons edit affordance', () => {
  it('keeps edit available on an earlier message while a generation is in flight', () => {
    const container = renderHoverButtons({ isSubmitting: true });
    const editButton = container.querySelector<HTMLButtonElement>(`#edit-${userMessage.messageId}`);

    expect(editButton).not.toBeNull();
    expect(editButton).toBeEnabled();
    expect(editButton).not.toHaveClass('pointer-events-none', 'opacity-0', '!opacity-0');
  });

  it('reveals on row hover once the generation settles', () => {
    const container = renderHoverButtons({ isSubmitting: false });
    const editButton = container.querySelector<HTMLButtonElement>(`#edit-${userMessage.messageId}`);

    expect(editButton).not.toBeNull();
    expect(editButton).toBeEnabled();
    expect(editButton).toHaveClass('group-hover:opacity-100');
    expect(editButton).not.toHaveClass('pointer-events-none', 'opacity-0', '!opacity-0');
  });

  it('offers no actions at all on the actively streaming assistant message', () => {
    const assistantMessage = {
      ...userMessage,
      messageId: 'assistant-1',
      isCreatedByUser: false,
      text: 'Partial response',
    } as TMessage;

    const container = renderHoverButtons({
      isSubmitting: true,
      message: assistantMessage,
      isLast: true,
      latestMessageId: assistantMessage.messageId,
    });

    /** Copying, forking or editing half a sentence all act on text that is about
     *  to change, so the response carries nothing until it settles. */
    expect(container.querySelector(`#edit-${assistantMessage.messageId}`)).toBeNull();
    expect(screen.queryByTestId('copy-response-button')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('offers copy for an error response', () => {
    const errorMessage = {
      ...userMessage,
      messageId: 'assistant-error',
      isCreatedByUser: false,
      error: true,
      text: 'Tool execution failed',
    } as TMessage;

    renderHoverButtons({
      isSubmitting: false,
      message: errorMessage,
      isLast: true,
      latestMessageId: errorMessage.messageId,
    });

    expect(screen.getByTestId('copy-response-button')).toBeEnabled();
  });

  it('disables copy when the response serializes to nothing', () => {
    const errorPartMessage = {
      ...userMessage,
      messageId: 'assistant-error-part',
      isCreatedByUser: false,
      error: true,
      text: '',
      content: [{ type: ContentTypes.ERROR, error: 'Deployment lookup failed' }],
    } as TMessage;

    renderHoverButtons({
      isSubmitting: false,
      message: errorPartMessage,
      isLast: true,
      latestMessageId: errorPartMessage.messageId,
    });

    expect(screen.getByTestId('copy-response-button')).toBeDisabled();
  });

  it('never inspects a response that is still streaming', () => {
    const streamingMessage = {
      ...userMessage,
      messageId: 'assistant-1',
      isCreatedByUser: false,
      text: 'partial resp',
    } as TMessage;
    const getCanCopy = jest.fn(() => true);

    renderHoverButtons({
      isSubmitting: true,
      message: streamingMessage,
      isLast: true,
      latestMessageId: streamingMessage.messageId,
      getCanCopy,
    });

    expect(screen.queryByTestId('copy-response-button')).toBeNull();
    expect(getCanCopy).not.toHaveBeenCalled();
  });
});
