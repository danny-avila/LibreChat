import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';

const mockUseGetMessagesByConvoId = jest.fn();
const mockUseMessagesConversation = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: (...args: unknown[]) => mockUseGetMessagesByConvoId(...args),
}));

jest.mock('~/Providers', () => ({
  useMessagesConversation: (...args: unknown[]) => mockUseMessagesConversation(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, opts?: Record<string, string | number>): string =>
      opts ? `${key}|${JSON.stringify(opts)}` : key,
}));

jest.mock('@librechat/client', () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? children : <div>{children}</div>,
  HoverCardPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="hover-card-content" className={className}>
      {children}
    </div>
  ),
}));

type IOEntry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  static last(): MockIntersectionObserver | undefined {
    return MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
  }

  static reset() {
    MockIntersectionObserver.instances = [];
  }

  root: Element | Document | null = null;
  rootMargin = '0px';
  thresholds: number[] = [0];
  callback: IntersectionObserverCallback;
  observed = new Set<Element>();
  observe = jest.fn((el: Element) => {
    this.observed.add(el);
  });

  unobserve = jest.fn((el: Element) => {
    this.observed.delete(el);
  });

  disconnect = jest.fn(() => {
    this.observed.clear();
  });

  takeRecords = jest.fn(() => []);
  constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
    this.callback = cb;
    if (opts?.root instanceof Element || opts?.root instanceof Document) {
      this.root = opts.root;
    }
    MockIntersectionObserver.instances.push(this);
  }

  trigger(entries: IOEntry[]) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}

const originalIO = global.IntersectionObserver;

import MessageNav from '../MessageNav';

function buildMessage(overrides: Partial<TMessage> = {}): TMessage {
  return {
    messageId: 'm',
    conversationId: 'test-convo',
    text: 'hello',
    isCreatedByUser: false,
    ...overrides,
  } as TMessage;
}

function buildDom(messages: TMessage[]): { scrollable: HTMLDivElement; content: HTMLDivElement } {
  const scrollable = document.createElement('div');
  scrollable.className = 'scrollbar-gutter-stable';
  Object.defineProperty(scrollable, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty(scrollable, 'scrollHeight', { value: 3000, configurable: true });
  Object.defineProperty(scrollable, 'scrollTop', { value: 0, writable: true, configurable: true });

  const content = document.createElement('div');
  content.className = 'flex flex-col';
  scrollable.appendChild(content);

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const div = document.createElement('div');
    div.id = m.messageId as string;
    div.className = 'message-render';
    if (m.isCreatedByUser) {
      const turn = document.createElement('div');
      turn.className = 'user-turn';
      turn.textContent = m.text ?? '';
      div.appendChild(turn);
    } else {
      div.textContent = m.text ?? '';
    }
    Object.defineProperty(div, 'offsetTop', { value: 100 + i * 200, configurable: true });
    Object.defineProperty(div, 'offsetHeight', { value: 150, configurable: true });
    content.appendChild(div);
  }

  document.body.appendChild(scrollable);
  return { scrollable, content };
}

function renderNav(messages: TMessage[]) {
  mockUseGetMessagesByConvoId.mockReturnValue({ data: messages });
  const { scrollable, content } = buildDom(messages);
  const scrollableRef = { current: scrollable } as React.RefObject<HTMLDivElement>;
  const result = render(<MessageNav scrollableRef={scrollableRef} />);
  act(() => {
    jest.advanceTimersByTime(250);
  });
  return { ...result, scrollable, content, scrollableRef };
}

function clearDom() {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

beforeEach(() => {
  MockIntersectionObserver.reset();
  (
    global as unknown as { IntersectionObserver: typeof MockIntersectionObserver }
  ).IntersectionObserver = MockIntersectionObserver;
  jest.useFakeTimers();
  mockUseMessagesConversation.mockReturnValue({ conversationId: 'test-convo' });
  mockUseGetMessagesByConvoId.mockReturnValue({ data: [] });
});

afterEach(() => {
  jest.useRealTimers();
  (
    global as unknown as { IntersectionObserver: typeof IntersectionObserver }
  ).IntersectionObserver = originalIO;
  clearDom();
});

describe('MessageNav', () => {
  describe('rendering threshold', () => {
    it('renders nothing when there are 0 messages', () => {
      const { container } = renderNav([]);
      expect(container.querySelector('nav')).toBeNull();
    });

    it('renders nothing with fewer than 3 messages', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'hi', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'hey' }),
      ];
      const { container } = renderNav(messages);
      expect(container.querySelector('nav')).toBeNull();
    });

    it('renders the nav with 3+ messages and an indicator for each', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const nav = container.querySelector('nav');
      expect(nav).not.toBeNull();
      expect(nav).toHaveAttribute('aria-label', 'com_ui_message_nav');

      const indicators = container.querySelectorAll('[data-msg-id]');
      expect(indicators).toHaveLength(3);
      expect(Array.from(indicators).map((el) => el.getAttribute('data-msg-id'))).toEqual([
        'a',
        'b',
        'c',
      ]);
    });
  });

  describe('indicator styling', () => {
    it('uses narrower width for user turns and wider for assistant turns', () => {
      const messages = [
        buildMessage({ messageId: 'u', text: 'user msg', isCreatedByUser: true }),
        buildMessage({ messageId: 'a', text: 'assistant msg' }),
        buildMessage({ messageId: 'u2', text: 'more user', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const [userInd, assistantInd] = container.querySelectorAll('[data-msg-id]');
      expect(userInd.className).toContain('w-4');
      expect(userInd.className).not.toContain('w-6');
      expect(assistantInd.className).toContain('w-6');
      expect(assistantInd.className).not.toContain('w-4');
    });
  });

  describe('preview text', () => {
    it('uses message text from React Query data when available', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha-preview', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo-preview' }),
        buildMessage({ messageId: 'c', text: 'charlie-preview', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const previews = container.querySelectorAll('[data-testid="hover-card-content"] p');
      expect(previews).toHaveLength(3);
      expect(previews[0]).toHaveTextContent('alpha-preview');
      expect(previews[1]).toHaveTextContent('bravo-preview');
    });

    it('falls back to DOM text when a message is not in React Query data', () => {
      mockUseGetMessagesByConvoId.mockReturnValue({ data: [] });
      const scrollable = document.createElement('div');
      scrollable.className = 'scrollbar-gutter-stable';
      const content = document.createElement('div');
      scrollable.appendChild(content);
      for (const [i, id] of ['x', 'y', 'z'].entries()) {
        const div = document.createElement('div');
        div.id = id;
        div.className = 'message-render';
        div.textContent = `dom-text-${id}`;
        Object.defineProperty(div, 'offsetTop', { value: i * 200 });
        Object.defineProperty(div, 'offsetHeight', { value: 150 });
        content.appendChild(div);
      }
      document.body.appendChild(scrollable);
      const scrollableRef = { current: scrollable } as React.RefObject<HTMLDivElement>;
      const { container } = render(<MessageNav scrollableRef={scrollableRef} />);
      act(() => {
        jest.advanceTimersByTime(250);
      });

      const previews = container.querySelectorAll('[data-testid="hover-card-content"] p');
      expect(previews[0]).toHaveTextContent('dom-text-x');
      expect(previews[2]).toHaveTextContent('dom-text-z');
    });

    it('truncates previews longer than 80 chars with an ellipsis', () => {
      const long = 'a'.repeat(120);
      const messages = [
        buildMessage({ messageId: 'a', text: long, isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'short' }),
        buildMessage({ messageId: 'c', text: 'also short', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const preview = container.querySelectorAll('[data-testid="hover-card-content"] p')[0];
      const text = preview?.textContent ?? '';
      expect(text.endsWith('...')).toBe(true);
      expect(text.length).toBe(83);
    });
  });

  describe('accessibility', () => {
    it('labels the nav and chevron buttons via useLocalize', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'one', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'two' }),
        buildMessage({ messageId: 'c', text: 'three', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);

      expect(container.querySelector('nav')).toHaveAttribute('aria-label', 'com_ui_message_nav');

      const prevBtn = container.querySelector('button[aria-label="com_ui_message_nav_previous"]');
      const nextBtn = container.querySelector('button[aria-label="com_ui_message_nav_next"]');
      expect(prevBtn).not.toBeNull();
      expect(nextBtn).not.toBeNull();
    });

    it('labels each indicator with its role-specific key and localized preview', () => {
      const messages = [
        buildMessage({ messageId: 'u', text: 'hi there', isCreatedByUser: true }),
        buildMessage({ messageId: 'a', text: 'assistant reply' }),
        buildMessage({ messageId: 'u2', text: 'follow-up', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const [userInd, assistantInd] = container.querySelectorAll('[data-msg-id]');
      expect(userInd.getAttribute('aria-label')).toMatch(/^com_ui_message_nav_go_to_user\|/);
      expect(userInd.getAttribute('aria-label')).toContain('hi there');
      expect(assistantInd.getAttribute('aria-label')).toMatch(
        /^com_ui_message_nav_go_to_assistant\|/,
      );
    });

    it('sets aria-current on the active indicator after IntersectionObserver fires', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const io = MockIntersectionObserver.last();
      expect(io).toBeDefined();

      const target = document.getElementById('b');
      act(() => {
        io!.trigger([{ target: target!, isIntersecting: true }]);
        jest.advanceTimersByTime(32);
      });

      const active = container.querySelector('[aria-current="true"]');
      expect(active).not.toBeNull();
      expect(active).toHaveAttribute('data-msg-id', 'b');
    });

    it('chevron buttons expose a disabled state when there is nothing to navigate to', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'one', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'two' }),
        buildMessage({ messageId: 'c', text: 'three', isCreatedByUser: true }),
      ];
      const { container, scrollable } = renderNav(messages);

      Object.defineProperty(scrollable, 'scrollTop', {
        value: 0,
        configurable: true,
        writable: true,
      });
      act(() => {
        fireEvent.scroll(scrollable);
        jest.advanceTimersByTime(32);
      });

      const prev = container.querySelector(
        'button[aria-label="com_ui_message_nav_previous"]',
      ) as HTMLButtonElement;
      const next = container.querySelector(
        'button[aria-label="com_ui_message_nav_next"]',
      ) as HTMLButtonElement;

      expect(prev.disabled).toBe(true);
      expect(next.disabled).toBe(false);
    });
  });

  describe('scroll behavior', () => {
    it('schedules a rAF when an indicator is clicked', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const rafSpy = jest.spyOn(window, 'requestAnimationFrame');

      const target = container.querySelectorAll('[data-msg-id]')[2] as HTMLButtonElement;
      act(() => {
        fireEvent.click(target);
      });
      expect(rafSpy).toHaveBeenCalled();
      rafSpy.mockRestore();
    });

    it('cancels any prior rAF scroll when a new one starts', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const indicators = container.querySelectorAll('[data-msg-id]');

      const steps: Array<(ts: number) => void> = [];
      const rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback) => {
          steps.push(cb);
          return steps.length;
        });

      act(() => {
        fireEvent.click(indicators[0] as HTMLElement);
      });
      act(() => {
        fireEvent.click(indicators[2] as HTMLElement);
      });

      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(() => {
        steps[0](performance.now());
        steps[steps.length - 1](performance.now());
      }).not.toThrow();

      rafSpy.mockRestore();
    });
  });

  describe('observers', () => {
    it('observes each message on mount', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      renderNav(messages);
      const io = MockIntersectionObserver.last();
      expect(io).toBeDefined();
      expect(io!.observed.size).toBe(3);
      expect(io!.observe).toHaveBeenCalledTimes(3);
    });

    it('reuses the same IntersectionObserver when entries change', async () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { scrollable } = renderNav(messages);

      const instanceCountAfterMount = MockIntersectionObserver.instances.length;
      const io = MockIntersectionObserver.last()!;
      const initialObserveCalls = io.observe.mock.calls.length;
      const initialUnobserveCalls = io.unobserve.mock.calls.length;

      const newMsg = document.createElement('div');
      newMsg.id = 'd';
      newMsg.className = 'message-render';
      newMsg.textContent = 'delta';
      Object.defineProperty(newMsg, 'offsetTop', { value: 800 });
      Object.defineProperty(newMsg, 'offsetHeight', { value: 150 });

      await act(async () => {
        scrollable.firstElementChild!.appendChild(newMsg);
        await Promise.resolve();
      });
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [...messages, buildMessage({ messageId: 'd', text: 'delta' })],
      });
      await act(async () => {
        jest.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(MockIntersectionObserver.instances.length).toBe(instanceCountAfterMount);
      expect(io.observe.mock.calls.length).toBe(initialObserveCalls + 1);
      expect(io.unobserve.mock.calls.length).toBe(initialUnobserveCalls);
    });

    it('unobserves messages that are removed', async () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
        buildMessage({ messageId: 'd', text: 'delta' }),
      ];
      const { scrollable } = renderNav(messages);
      const io = MockIntersectionObserver.last()!;
      const initialUnobserve = io.unobserve.mock.calls.length;

      const removed = document.getElementById('d');
      await act(async () => {
        removed?.remove();
        await Promise.resolve();
      });
      mockUseGetMessagesByConvoId.mockReturnValue({ data: messages.slice(0, 3) });
      await act(async () => {
        jest.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(io.unobserve.mock.calls.length).toBeGreaterThan(initialUnobserve);
      expect(scrollable.contains(removed as Node)).toBe(false);
    });

    it('disconnects the IntersectionObserver on unmount', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { unmount } = renderNav(messages);
      const io = MockIntersectionObserver.last()!;
      expect(io.disconnect).not.toHaveBeenCalled();
      unmount();
      expect(io.disconnect).toHaveBeenCalled();
    });
  });

  describe('dom-driven refresh', () => {
    it('refreshes entries when a .message-render id attribute changes (SSE lifecycle)', async () => {
      const messages = [
        buildMessage({ messageId: 'client-uuid', text: 'streaming', isCreatedByUser: false }),
        buildMessage({ messageId: 'b', text: 'bravo', isCreatedByUser: true }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      expect(container.querySelector('[data-msg-id="client-uuid"]')).not.toBeNull();

      const streamingNode = document.getElementById('client-uuid') as HTMLElement;
      await act(async () => {
        streamingNode.id = 'server-id';
        await Promise.resolve();
      });
      mockUseGetMessagesByConvoId.mockReturnValue({
        data: [buildMessage({ messageId: 'server-id', text: 'streaming' }), ...messages.slice(1)],
      });
      await act(async () => {
        jest.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(container.querySelector('[data-msg-id="client-uuid"]')).toBeNull();
      expect(container.querySelector('[data-msg-id="server-id"]')).not.toBeNull();
    });

    it('refreshes entries when a .message-render is added via MutationObserver', async () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container, scrollable } = renderNav(messages);
      expect(container.querySelectorAll('[data-msg-id]')).toHaveLength(3);

      const newMsg = document.createElement('div');
      newMsg.id = 'd';
      newMsg.className = 'message-render';
      newMsg.textContent = 'delta';
      Object.defineProperty(newMsg, 'offsetTop', { value: 800 });
      Object.defineProperty(newMsg, 'offsetHeight', { value: 150 });

      await act(async () => {
        scrollable.firstElementChild!.appendChild(newMsg);
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(250);
        await Promise.resolve();
      });

      expect(container.querySelectorAll('[data-msg-id]')).toHaveLength(4);
      expect(container.querySelector('[data-msg-id="d"]')).not.toBeNull();
    });
  });
});
