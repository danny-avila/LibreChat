import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EModelEndpoint, type TConversation, type TMessage } from 'librechat-data-provider';
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

function renderHoverButtons(isSubmitting: boolean) {
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
            isLast={false}
            isEditing={false}
            message={userMessage}
            conversation={conversation}
            isSubmitting={isSubmitting}
            enterEdit={jest.fn()}
            regenerate={jest.fn()}
            handleContinue={jest.fn()}
            copyToClipboard={jest.fn()}
            latestMessageId="assistant-1"
          />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  const editButton = container.querySelector<HTMLButtonElement>(`#edit-${userMessage.messageId}`);
  if (!editButton) {
    throw new Error('edit button not rendered');
  }
  return editButton;
}

describe('HoverButtons edit affordance', () => {
  it('stays hidden on row hover while a generation is in flight', () => {
    const editButton = renderHoverButtons(true);

    expect(editButton).toBeDisabled();
    expect(editButton).toHaveClass('pointer-events-none');
    expect(editButton.className).not.toMatch(/group-hover:opacity-100/);
    expect(editButton.className).not.toMatch(/group-focus-within:opacity-100/);
    /** Must outrank the shared Button's `disabled:opacity-50`; a bare `opacity-0` loses to it,
     *  and jsdom applies no stylesheet, so the important modifier is what we can assert here. */
    expect(editButton).toHaveClass('!opacity-0');
    expect(editButton).not.toHaveClass('opacity-0');
  });

  it('reveals on row hover once the generation settles', () => {
    const editButton = renderHoverButtons(false);

    expect(editButton).toBeEnabled();
    expect(editButton).toHaveClass('group-hover:opacity-100');
    expect(editButton).not.toHaveClass('pointer-events-none', 'opacity-0', '!opacity-0');
  });
});
