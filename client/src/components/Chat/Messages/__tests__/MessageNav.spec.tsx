import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';

type ReactNode = React.ReactNode;
type RefObject<T> = React.RefObject<T>;

type TestMessage = {
  messageId: string;
  conversationId?: string;
  text?: string;
  isCreatedByUser?: boolean;
  content?: Array<
    | {
        type?: string;
        text?: string | { value?: string };
      }
    | undefined
  >;
};

const mockUseGetMessagesByConvoId = jest.fn();
const mockUseMessagesConversation = jest.fn();
const mockUseMessagesSubmission = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: (...args: unknown[]) => mockUseGetMessagesByConvoId(...args),
}));

jest.mock('~/Providers', () => ({
  useMessagesConversation: (...args: unknown[]) => mockUseMessagesConversation(...args),
  useMessagesSubmission: (...args: unknown[]) => mockUseMessagesSubmission(...args),
}));

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, opts?: Record<string, string | number>): string =>
      opts ? `${key}|${JSON.stringify(opts)}` : key,
}));

jest.mock('@librechat/client', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
    asChild ? children : <div>{children}</div>,
  HoverCardPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children, className }: { children: ReactNode; className?: string }) => (
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

class PointerEventPolyfill extends MouseEvent {
  pointerId: number;
  constructor(type: string, params: MouseEventInit & { pointerId?: number } = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
  }
}

if (typeof (global as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  (global as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
  (window as unknown as { PointerEvent: typeof PointerEventPolyfill }).PointerEvent =
    PointerEventPolyfill;
}

import MessageNav from '../MessageNav';

function buildMessage(overrides: Partial<TestMessage> = {}): TestMessage {
  return {
    messageId: 'm',
    conversationId: 'test-convo',
    text: 'hello',
    isCreatedByUser: false,
    ...overrides,
  };
}

function buildDom(messages: TestMessage[]): {
  scrollable: HTMLDivElement;
  content: HTMLDivElement;
} {
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
    div.id = m.messageId;
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

function renderNav(messages: TestMessage[]) {
  mockUseGetMessagesByConvoId.mockReturnValue({ data: messages });
  const { scrollable, content } = buildDom(messages);
  const scrollableRef = { current: scrollable } as RefObject<HTMLDivElement>;
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
  mockUseMessagesSubmission.mockReturnValue({ isSubmitting: false });
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
      const scrollableRef = { current: scrollable } as RefObject<HTMLDivElement>;
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

    it('skips sparse content entries when deriving preview text', () => {
      const messages = [
        buildMessage({
          messageId: 'a',
          text: '',
          isCreatedByUser: true,
          content: [undefined, { type: 'text', text: 'content-preview' }],
        }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const preview = container.querySelectorAll('[data-testid="hover-card-content"] p')[0];
      expect(preview).toHaveTextContent('content-preview');
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

    it('sets aria-current only on the topmost visible indicator', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);
      const io = MockIntersectionObserver.last();
      expect(io).toBeDefined();

      act(() => {
        io!.trigger([
          { target: document.getElementById('c')!, isIntersecting: true },
          { target: document.getElementById('b')!, isIntersecting: true },
          { target: document.getElementById('a')!, isIntersecting: true },
        ]);
        jest.advanceTimersByTime(32);
      });

      const current = container.querySelectorAll('[aria-current="true"]');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('data-msg-id', 'a');

      for (const id of ['a', 'b', 'c']) {
        const indicator = container.querySelector(`[data-msg-id="${id}"] span`);
        expect(indicator?.className).toContain('h-[5px]');
      }
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

    it('scrolls the indicator column fully down when the final message is visible', () => {
      const messages = Array.from({ length: 15 }, (_, i) =>
        buildMessage({
          messageId: `m-${i}`,
          text: `message ${i}`,
          isCreatedByUser: i % 2 === 0,
        }),
      );
      const { container, scrollable } = renderNav(messages);
      const column = container.querySelector('nav > div') as HTMLDivElement;
      let scrollHeightReads = 0;

      Object.defineProperty(column, 'clientHeight', { value: 30, configurable: true });
      Object.defineProperty(column, 'scrollHeight', {
        get: () => {
          scrollHeightReads++;
          return scrollHeightReads === 1 ? 170 : 180;
        },
        configurable: true,
      });
      Object.defineProperty(column, 'scrollTop', { value: 0, writable: true, configurable: true });
      Object.defineProperty(scrollable, 'scrollHeight', { value: 3600, configurable: true });
      Object.defineProperty(scrollable, 'scrollTop', {
        value: 2500,
        writable: true,
        configurable: true,
      });

      act(() => {
        fireEvent.scroll(scrollable);
        jest.advanceTimersByTime(32);
      });

      expect(column.scrollTop).toBe(150);
    });

    it('scrolls the indicator column fully down when the chat reaches bottom with stale offsets', () => {
      const messages = Array.from({ length: 15 }, (_, i) =>
        buildMessage({
          messageId: `bottom-${i}`,
          text: `message ${i}`,
          isCreatedByUser: i % 2 === 0,
        }),
      );
      mockUseGetMessagesByConvoId.mockReturnValue({ data: messages });

      const scrollable = document.createElement('div');
      scrollable.className = 'scrollbar-gutter-stable';
      Object.defineProperty(scrollable, 'clientHeight', { value: 600, configurable: true });
      Object.defineProperty(scrollable, 'scrollHeight', { value: 3000, configurable: true });
      Object.defineProperty(scrollable, 'scrollTop', {
        value: 0,
        writable: true,
        configurable: true,
      });

      const content = document.createElement('div');
      scrollable.appendChild(content);
      for (let i = 0; i < messages.length; i++) {
        const div = document.createElement('div');
        div.id = messages[i].messageId;
        div.className = 'message-render';
        div.textContent = messages[i].text ?? '';
        Object.defineProperty(div, 'offsetTop', {
          value: i === messages.length - 1 ? 5000 : 100 + i * 100,
          configurable: true,
        });
        Object.defineProperty(div, 'offsetHeight', { value: 80, configurable: true });
        content.appendChild(div);
      }
      document.body.appendChild(scrollable);

      const { container } = render(
        <MessageNav scrollableRef={{ current: scrollable } as RefObject<HTMLDivElement>} />,
      );
      act(() => {
        jest.advanceTimersByTime(250);
      });

      const column = container.querySelector('nav > div') as HTMLDivElement;
      Object.defineProperty(column, 'clientHeight', { value: 30, configurable: true });
      Object.defineProperty(column, 'scrollHeight', { value: 180, configurable: true });
      Object.defineProperty(column, 'scrollTop', { value: 0, writable: true, configurable: true });
      Object.defineProperty(scrollable, 'scrollTop', {
        value: 2400,
        writable: true,
        configurable: true,
      });

      act(() => {
        fireEvent.scroll(scrollable);
        jest.advanceTimersByTime(32);
      });

      expect(column.scrollTop).toBe(150);
    });

    it('keeps per-instance scroll tokens isolated across mounted MessageNav instances', () => {
      const messagesA = [
        buildMessage({ messageId: 'a1', text: 'one', isCreatedByUser: true }),
        buildMessage({ messageId: 'a2', text: 'two' }),
        buildMessage({ messageId: 'a3', text: 'three', isCreatedByUser: true }),
      ];
      const messagesB = [
        buildMessage({ messageId: 'b1', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b2', text: 'beta' }),
        buildMessage({ messageId: 'b3', text: 'gamma', isCreatedByUser: true }),
      ];

      mockUseGetMessagesByConvoId.mockReturnValue({ data: messagesA });
      const domA = buildDom(messagesA);
      const { container: navA } = render(
        <MessageNav scrollableRef={{ current: domA.scrollable } as RefObject<HTMLDivElement>} />,
      );
      act(() => {
        jest.advanceTimersByTime(250);
      });

      mockUseGetMessagesByConvoId.mockReturnValue({ data: messagesB });
      const domB = buildDom(messagesB);
      const { container: navB } = render(
        <MessageNav scrollableRef={{ current: domB.scrollable } as RefObject<HTMLDivElement>} />,
      );
      act(() => {
        jest.advanceTimersByTime(250);
      });

      const steps: Array<(ts: number) => void> = [];
      const rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb: FrameRequestCallback) => {
          steps.push(cb);
          return steps.length;
        });

      const indA = navA.querySelectorAll('[data-msg-id]')[2] as HTMLButtonElement;
      const indB = navB.querySelectorAll('[data-msg-id]')[2] as HTMLButtonElement;

      act(() => {
        fireEvent.click(indA);
      });
      act(() => {
        fireEvent.click(indB);
      });

      expect(steps.length).toBeGreaterThanOrEqual(2);

      let aScrollTouched = false;
      Object.defineProperty(domA.scrollable, 'scrollTop', {
        get: () => 0,
        set: () => {
          aScrollTouched = true;
        },
        configurable: true,
      });
      act(() => {
        steps[0](performance.now());
      });
      expect(aScrollTouched).toBe(true);

      rafSpy.mockRestore();
    });
  });

  describe('focus management', () => {
    it('moves focus to the target message when an indicator is clicked', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);

      const indicator = container.querySelectorAll('[data-msg-id]')[1] as HTMLButtonElement;
      act(() => {
        fireEvent.click(indicator);
      });

      const message = document.getElementById('b');
      expect(message).toHaveAttribute('tabindex', '-1');
      expect(document.activeElement).toBe(message);
    });

    it('focuses the current indicator when Shift+Alt+M is pressed', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);

      const io = MockIntersectionObserver.last();
      act(() => {
        io!.trigger([{ target: document.getElementById('b')!, isIntersecting: true }]);
        jest.advanceTimersByTime(32);
      });

      act(() => {
        fireEvent.keyDown(document, { code: 'KeyM', altKey: true, shiftKey: true });
      });

      expect(document.activeElement).toBe(container.querySelector('[data-msg-id="b"]'));
    });

    it('focuses the current indicator via the produced key on non-QWERTY layouts', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);

      const io = MockIntersectionObserver.last();
      act(() => {
        io!.trigger([{ target: document.getElementById('b')!, isIntersecting: true }]);
        jest.advanceTimersByTime(32);
      });

      act(() => {
        fireEvent.keyDown(document, { key: 'm', code: 'Semicolon', altKey: true, shiftKey: true });
      });

      expect(document.activeElement).toBe(container.querySelector('[data-msg-id="b"]'));
    });

    it('consumes Shift+Alt+M only when the nav is rendered', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      renderNav(messages);

      let notPrevented = true;
      act(() => {
        notPrevented = fireEvent.keyDown(document, {
          code: 'KeyM',
          altKey: true,
          shiftKey: true,
        });
      });

      expect(notPrevented).toBe(false);
    });

    it('does not consume Shift+Alt+M when the nav is not rendered', () => {
      renderNav([buildMessage({ messageId: 'solo', text: 'only one', isCreatedByUser: true })]);

      let notPrevented = true;
      act(() => {
        notPrevented = fireEvent.keyDown(document, {
          code: 'KeyM',
          altKey: true,
          shiftKey: true,
        });
      });

      expect(notPrevented).toBe(true);
    });

    it('ignores the keyboard shortcut without the alt and shift modifiers', () => {
      const messages = [
        buildMessage({ messageId: 'a', text: 'alpha', isCreatedByUser: true }),
        buildMessage({ messageId: 'b', text: 'bravo' }),
        buildMessage({ messageId: 'c', text: 'charlie', isCreatedByUser: true }),
      ];
      const { container } = renderNav(messages);

      act(() => {
        fireEvent.keyDown(document, { code: 'KeyM' });
      });

      const navButtons = container.querySelectorAll('[data-msg-id]');
      expect(Array.from(navButtons)).not.toContain(document.activeElement);
    });
  });

  describe('drag to scroll', () => {
    function setupDraggableNav() {
      const messages = Array.from({ length: 5 }, (_, i) =>
        buildMessage({
          messageId: `m-${i}`,
          text: `message ${i}`,
          isCreatedByUser: i % 2 === 0,
        }),
      );
      const result = renderNav(messages);
      const column = result.container.querySelector('nav > div') as HTMLDivElement;
      column.getBoundingClientRect = () => ({ top: 0, bottom: 50, height: 50 }) as DOMRect;

      const ribs = Array.from(column.querySelectorAll('[data-msg-id]')) as HTMLElement[];

      const writes: number[] = [];
      Object.defineProperty(result.scrollable, 'scrollTop', {
        get: () => 0,
        set: (v: number) => {
          writes.push(v);
        },
        configurable: true,
      });

      return { ...result, column, ribs, writes };
    }

    it('scrubs the conversation while dragging past the threshold', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
      });

      expect(writes.length).toBeGreaterThan(0);
    });

    it('keeps tracking the drag after the pointer leaves the narrow column', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        // pointer has moved off the column; the move bubbles to the document listener
        fireEvent.pointerMove(document.body, { pointerId: 1, buttons: 1, clientY: 25 });
      });

      expect(writes.length).toBeGreaterThan(0);
    });

    it('maps the pointer proportionally across the full set of messages', () => {
      const { column } = setupDraggableNav();
      const getById = jest.spyOn(document, 'getElementById');

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
      });
      expect(getById.mock.calls.map((c) => c[0])).toContain('m-2');

      getById.mockClear();
      act(() => {
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 50 });
      });
      expect(getById.mock.calls.map((c) => c[0])).toContain('m-4');

      getById.mockRestore();
    });

    it('does not scrub for movement under the threshold', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 2 });
      });

      expect(writes.length).toBe(0);
    });

    it('ignores pointer moves after the interaction ends', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerUp(document, { pointerId: 1, clientY: 0 });
      });
      act(() => {
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 40 });
      });

      expect(writes.length).toBe(0);
    });

    it('ends the drag when the primary button is released during a move', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 0, clientY: 30 });
      });
      const before = writes.length;
      act(() => {
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 45 });
      });

      expect(writes.length).toBe(before);
    });

    it('ends the drag when the window loses focus', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
        window.dispatchEvent(new Event('blur'));
      });
      const before = writes.length;
      act(() => {
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 45 });
      });

      expect(writes.length).toBe(before);
    });

    it('tears down a previous drag when a new pointer starts', () => {
      const { column, writes } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
      });
      act(() => {
        fireEvent.pointerDown(column, { pointerId: 2, button: 0, buttons: 1, clientY: 0 });
      });
      const before = writes.length;
      act(() => {
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 45 });
      });

      expect(writes.length).toBe(before);
    });

    it('selects via the native click when a press does not become a drag', () => {
      const { column, ribs } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerUp(document, { pointerId: 1, clientY: 0 });
      });
      act(() => {
        fireEvent.click(ribs[0]);
      });

      expect(document.activeElement).toBe(document.getElementById('m-0'));
    });

    it('suppresses the click that immediately follows a drag', () => {
      const { column, ribs } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
        fireEvent.pointerUp(document, { pointerId: 1, clientY: 25 });
      });

      act(() => {
        fireEvent.click(ribs[0]);
      });

      expect(document.activeElement).not.toBe(document.getElementById('m-0'));
    });

    it('clears click suppression after the drag so a later activation is honored', () => {
      const { column, ribs } = setupDraggableNav();

      act(() => {
        fireEvent.pointerDown(column, { pointerId: 1, button: 0, buttons: 1, clientY: 0 });
        fireEvent.pointerMove(document, { pointerId: 1, buttons: 1, clientY: 25 });
        fireEvent.pointerUp(document, { pointerId: 1, clientY: 25 });
        jest.advanceTimersByTime(1);
      });

      act(() => {
        fireEvent.click(ribs[0]);
      });

      expect(document.activeElement).toBe(document.getElementById('m-0'));
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
