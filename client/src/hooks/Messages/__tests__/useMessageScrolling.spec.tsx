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
let mockScrollCallback: (() => void) | undefined;

jest.mock('~/hooks/useScrollToRef', () => ({
  __esModule: true,
  default: ({ callback }: { callback: () => void }) => {
    mockScrollCallback = callback;
    return {
      scrollToRef: mockScrollToBottom,
      handleSmoothToRef: mockHandleSmoothToRef,
    };
  },
}));

jest.mock('../messageLayout', () => ({
  reconcileMessageContentLayout: jest.fn(),
}));

import useMessageScrolling from '../useMessageScrolling';
import { reconcileMessageContentLayout } from '../messageLayout';

const mockReconcileMessageContentLayout = reconcileMessageContentLayout as jest.Mock;

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

/** Matches the hook's glide fallback, the window in which a landing is still pending. */
const glideWindow = 700;

const originalResizeObserver = global.ResizeObserver;
const originalIntersectionObserver = global.IntersectionObserver;

function setRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  element.getBoundingClientRect = jest.fn(
    () =>
      ({
        x: rect.x ?? 0,
        y: rect.y ?? 0,
        top: rect.top ?? 0,
        left: rect.left ?? 0,
        right: rect.right ?? 0,
        bottom: rect.bottom ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

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
    mockReconcileMessageContentLayout.mockClear();
    mockScrollCallback = undefined;
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

  it('rides the bottom when streaming content resizes and auto-scroll is active', () => {
    renderScrolling();

    const observer = MockResizeObserver.last();
    expect(observer?.observe).toHaveBeenCalledWith(screen.getByTestId('content'));

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 700;

    act(() => {
      observer?.trigger();
    });

    /** Written straight to the element rather than routed through the throttled
     *  scrollIntoView helper, so an answer arriving a few pixels at a time flows
     *  instead of lurching once every throttle window. */
    expect(scrollable.scrollTop).toBe(800);
  });

  it('reconciles message layout after an explicit scroll to bottom', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    act(() => {
      mockScrollCallback?.();
    });

    expect(mockReconcileMessageContentLayout).toHaveBeenCalledWith(scrollable);
  });

  /**
   * `useMessageProcess` raises the abort flag on any wheel at all, downward ones
   * included, through a throttle whose trailing call lands after the gesture has
   * ended. Gating on it meant scrolling down to the newest word could never resume
   * the ride, while the scroll-to-bottom button, which touches no wheel, always
   * could. Position and direction answer that question instead.
   */
  it('rides the bottom for a reader who is on it, even with the abort flag raised', () => {
    renderScrolling({ contextOverrides: { abortScroll: true } });

    const scrollable = screen.getByTestId('scrollable');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 700;

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(scrollable.scrollTop).toBe(800);
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

  /**
   * Sending arms a smooth glide down to the newest word, and the landing re-pins the
   * thread to the bottom. The landing is scheduled for the whole glide window, so a
   * reader who changes their mind and heads up mid-flight was pinned again anyway and
   * dragged back on the next streaming resize.
   */
  it('lets an upward gesture during the send glide beat the pending landing', () => {
    jest.useFakeTimers();
    try {
      const view = render(
        <RecoilRoot>
          <MessagesViewContext.Provider value={createContextValue({ isSubmitting: false })}>
            <ScrollingHarness messagesTree={[message]} />
          </MessagesViewContext.Provider>
        </RecoilRoot>,
      );

      const scrollable = screen.getByTestId('scrollable');
      const scrollTo = jest.fn();
      (scrollable as unknown as { scrollTo: jest.Mock }).scrollTo = scrollTo;
      Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
      Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
      scrollable.scrollTop = 0;

      view.rerender(
        <RecoilRoot>
          <MessagesViewContext.Provider value={createContextValue({ isSubmitting: true })}>
            <ScrollingHarness messagesTree={[message]} />
          </MessagesViewContext.Provider>
        </RecoilRoot>,
      );

      expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' });

      /** The reader heads up while the glide is still in flight. */
      scrollable.scrollTop = 400;
      fireEvent.wheel(scrollable, { deltaY: -120 });

      act(() => {
        jest.advanceTimersByTime(glideWindow);
      });

      Object.defineProperty(scrollable, 'scrollHeight', { value: 1200, configurable: true });
      act(() => {
        MockResizeObserver.last()?.trigger();
      });

      expect(scrollable.scrollTop).toBe(400);
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves the send glide alone while the answer streams in', () => {
    const view = render(
      <RecoilRoot>
        <MessagesViewContext.Provider value={createContextValue({ isSubmitting: false })}>
          <ScrollingHarness messagesTree={[message]} />
        </MessagesViewContext.Provider>
      </RecoilRoot>,
    );

    const scrollable = screen.getByTestId('scrollable');
    const scrollTo = jest.fn();
    (scrollable as unknown as { scrollTo: jest.Mock }).scrollTo = scrollTo;
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });
    scrollable.scrollTop = 0;

    view.rerender(
      <RecoilRoot>
        <MessagesViewContext.Provider value={createContextValue({ isSubmitting: true })}>
          <ScrollingHarness messagesTree={[message]} />
        </MessagesViewContext.Provider>
      </RecoilRoot>,
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' });

    /** The next delta of the answer arrives while the glide is still travelling. */
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1100, configurable: true });
    view.rerender(
      <RecoilRoot>
        <MessagesViewContext.Provider value={createContextValue({ isSubmitting: true })}>
          <ScrollingHarness messagesTree={[message, message]} />
        </MessagesViewContext.Provider>
      </RecoilRoot>,
    );

    /** A plain follow would have written scrollTop outright and killed the animation. */
    expect(scrollable.scrollTop).toBe(0);
  });

  it('does not clamp to rendered content bottom during general resize reconciliation', () => {
    renderScrolling();

    const scrollable = screen.getByTestId('scrollable');
    const content = screen.getByTestId('content');
    Object.defineProperty(scrollable, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scrollable, 'clientHeight', { value: 200, configurable: true });

    /** Move away from the end so the reader is left alone, which is the state this
     *  is about: reconciliation must not drag them to the rendered content bottom. */
    scrollable.scrollTop = 900;
    fireEvent.scroll(scrollable);
    scrollable.scrollTop = 700;
    fireEvent.scroll(scrollable);

    setRect(scrollable, { top: 0, bottom: 200, height: 200 });
    setRect(content, { top: -700, bottom: -200, height: 500 });

    act(() => {
      MockResizeObserver.last()?.trigger();
    });

    expect(scrollable.scrollTop).toBe(700);
    expect(mockScrollToBottom).not.toHaveBeenCalled();
  });
});
