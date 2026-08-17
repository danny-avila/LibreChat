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
  type TMessageContentParts,
} from 'librechat-data-provider';
import { hasCopyableText } from '~/hooks/Messages/useCopyToClipboard';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import store from '~/store';

const mockAudioContent = jest.fn();

jest.mock('~/components/Chat/Messages/MessageAudio', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => {
    mockAudioContent(content);
    return null;
  },
}));

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

function renderReadAloudContent(message: TMessage): string {
  mockAudioContent.mockClear();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const initializeState = ({ set }: MutableSnapshot) => set(store.textToSpeech, true);

  render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <MemoryRouter>
          <HoverButtons
            index={0}
            isLast={true}
            isEditing={false}
            message={message}
            conversation={conversation}
            isSubmitting={false}
            enterEdit={jest.fn()}
            regenerate={jest.fn()}
            handleContinue={jest.fn()}
            copyToClipboard={jest.fn()}
            getCanCopy={() => hasCopyableText({ text: message.text, content: message.content })}
            latestMessageId={message.messageId}
          />
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );

  expect(mockAudioContent).toHaveBeenCalled();
  return mockAudioContent.mock.calls[0][0] as string;
}

const assistantMessage = (overrides: Partial<TMessage>): TMessage =>
  ({
    messageId: 'assistant-1',
    conversationId: 'convo-1',
    parentMessageId: 'user-1',
    isCreatedByUser: false,
    text: '',
    ...overrides,
  }) as TMessage;

describe('HoverButtons read aloud content', () => {
  it('omits reasoning parts so speech matches the visible answer', () => {
    const content = renderReadAloudContent(
      assistantMessage({
        content: [
          { type: ContentTypes.THINK, think: 'the user wants a haiku, let me count syllables' },
          { type: ContentTypes.TEXT, text: 'Here is your haiku.' },
        ] as TMessageContentParts[],
      }),
    );

    expect(content).toBe('Here is your haiku.');
    expect(content).not.toMatch(/syllables/);
  });

  it('excludes reasoning whether `think` is a string or an object', () => {
    const content = renderReadAloudContent(
      assistantMessage({
        content: [
          { type: ContentTypes.THINK, think: 'string form reasoning' },
          { type: ContentTypes.THINK, think: { value: 'object form reasoning' } },
          { type: ContentTypes.TEXT, text: 'Answer.' },
        ] as unknown as TMessageContentParts[],
      }),
    );

    expect(content).toBe('Answer.');
  });

  it('reads every text part in order, not just the latest', () => {
    const content = renderReadAloudContent(
      assistantMessage({
        content: [
          { type: ContentTypes.TEXT, text: 'First part.' },
          { type: ContentTypes.THINK, think: 'hidden reasoning' },
          { type: ContentTypes.TEXT, text: 'Second part.' },
        ] as TMessageContentParts[],
      }),
    );

    expect(content).toContain('First part.');
    expect(content).toContain('Second part.');
    expect(content.indexOf('First part.')).toBeLessThan(content.indexOf('Second part.'));
    expect(content).not.toMatch(/hidden reasoning/);
  });

  it('passes through a plain-text message unchanged', () => {
    const content = renderReadAloudContent(assistantMessage({ text: 'A simple reply.' }));

    expect(content).toBe('A simple reply.');
  });

  /** An aborted run persists `content` alongside a `text` copy that still carries
   *  THINK parts, so the parts array must win over the flattened text. */
  it('omits reasoning from an aborted message that persisted text alongside content', () => {
    const content = renderReadAloudContent(
      assistantMessage({
        text: 'weighing the options here Partial answer.',
        content: [
          { type: ContentTypes.THINK, think: 'weighing the options here' },
          { type: ContentTypes.TEXT, text: 'Partial answer.' },
        ] as TMessageContentParts[],
      }),
    );

    expect(content).toBe('Partial answer.');
    expect(content).not.toMatch(/weighing the options/);
  });

  it('ignores non-text parts such as tool calls', () => {
    const content = renderReadAloudContent(
      assistantMessage({
        content: [
          { type: ContentTypes.TOOL_CALL, tool_call: { name: 'search', args: 'weather' } },
          { type: ContentTypes.TEXT, text: 'It is sunny.' },
        ] as unknown as TMessageContentParts[],
      }),
    );

    expect(content).toBe('It is sunny.');
  });
});

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
