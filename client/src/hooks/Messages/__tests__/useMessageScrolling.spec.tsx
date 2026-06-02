import React from 'react';
import { RecoilRoot } from 'recoil';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TConversation, TMessage } from 'librechat-data-provider';
import {
  MessagesViewContext,
  type MessagesViewContextValue,
} from '~/Providers/MessagesViewContext';

type MockScrollToBottom = jest.Mock & {
  cancel: jest.Mock;
  flush: jest.Mock;
};

const mockScrollToBottom = jest.fn() as MockScrollToBottom;
mockScrollToBottom.cancel = jest.fn();
mockScrollToBottom.flush = jest.fn();
const mockHandleSmoothToRef = jest.fn();

jest.mock('~/hooks/useScrollToRef', () => ({
  __esModule: true,
  default: () => ({
    scrollToRef: mockScrollToBottom,
    handleSmoothToRef: mockHandleSmoothToRef,
  }),
}));

import useMessageScrolling from '../useMessageScrolling';
import { MESSAGE_CONTENT_LAYOUT_CHANGE_EVENT } from '../messageLayout';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  static reset() {
    MockResizeObserver.instances = [];
  }

  static last(): MockResizeObserver | undefined {
    return MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
  }

  readonly callback: ResizeObserverCallback;
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  static reset() {
    MockIntersectionObserver.instances = [];
  }

  readonly callback: IntersectionObserverCallback;
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
}

const originalResizeObserver = global.ResizeObserver;
const originalIntersectionObserver = global.IntersectionObserver;

const conversation = {
  conversationId: 'conversation-1',
  endpoint: 'openAI',
  model: 'gpt-4',
} as TConversation;

const message = {
  messageId: 'message-1',
  conversationId: conversation.conversationId,
  isCreatedByUser: false,
} as TMessage;

function createContextValue(
  overrides: Partial<MessagesViewContextValue> = {},
): MessagesViewContextValue {
  return {
    conversation,
    conversationId: conversation.conversationId,
    isSubmitting: true,
    abortScroll: false,
    setAbortScroll: jest.fn(),
    ask: jest.fn(),
    regenerate: jest.fn(),
    handleContinue: jest.fn(),
    index: 0,
    latestMessageId: message.messageId,
    latestMessageDepth: 0,
    getMessages: jest.fn(),
    setMessages: jest.fn(),
    ...overrides,
  } as MessagesViewContextValue;
}

function ScrollingHarness({ messagesTree }: { messagesTree?: TMessage[] | null }) {
  const { contentRef, scrollableRef, messagesEndRef, debouncedHandleScroll } =
    useMessageScrolling(messagesTree);

  return (
    <div ref={scrollableRef} onScroll={debouncedHandleScroll} data-testid="scrollable">
      <div ref={contentRef} data-testid="content">
        <div ref={messagesEndRef} data-testid="end" />
      </div>
    </div>
  );
}

function renderScrolling({
  contextOverrides,
  messagesTree,
}: {
  contextOverrides?: Partial<MessagesViewContextValue>;
  messagesTree?: TMessage[] | null;
} = {}) {
  return render(
    <RecoilRoot>
      <MessagesViewContext.Provider value={createContextValue(contextOverrides)}>
        <ScrollingHarness messagesTree={messagesTree} />
      </MessagesViewContext.Provider>
    </RecoilRoot>,
  );
}

describe('useMessageScrolling resize reconciliation', () => {
  beforeEach(() => {
    MockResizeObserver.reset();
    MockIntersectionObserver.reset();
    mockScrollToBottom.mockClear();
    mockScrollToBottom.cancel.mockClear();
    mockScrollToBottom.flush.mockClear();
    mockHandleSmoothToRef.mockClear();
    (global as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
      MockResizeObserver;
    (
      global as unknown as { IntersectionObserver: typeof MockIntersectionObserver }
    ).IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    (global as unknown as { ResizeObserver: typeof ResizeObserver | undefined }).ResizeObserver =
      originalResizeObserver;
    (
      global as unknown as { IntersectionObserver: typeof IntersectionObserver | undefined }
    ).IntersectionObserver = originalIntersectionObserver;
  });

  it('scrolls to the bottom when streaming content resizes and auto-scroll is active', () => {
    renderScrolling();

    const observer = MockResizeObserver.last();
    expect(observer?.observe).toHaveBeenCalledWith(screen.getByTestId('content'));

    act(() => {
      observer?.trigger();
    });

    expect(mockScrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('does not follow resizes after the user aborts streaming auto-scroll', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('does not follow resizes after the user scrolls away from the bottom', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 100;

    fireEvent.scroll(scrollable);

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('does not follow the next resize after user interaction inside message content', () => {
    renderScrolling();

    fireEvent.pointerDown(screen.getByTestId('content'));

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('clamps the scroll position back to content after a resize shrink', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 450;

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(scrollable.scrollTop).toBe(300);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });

  it('clamps explicit layout-change shrinks without following the bottom', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 450;

    fireEvent(
      screen.getByTestId('content'),
      new CustomEvent(MESSAGE_CONTENT_LAYOUT_CHANGE_EVENT, { bubbles: true }),
    );

    expect(scrollable.scrollTop).toBe(300);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });
});
