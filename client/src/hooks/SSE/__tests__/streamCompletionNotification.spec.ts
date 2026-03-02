import {
  formatStreamCompletionBody,
  isStreamCompletionSuppressed,
  notifyStreamCompletion,
  suppressStreamCompletionNotification,
  shouldShowStreamCompletionNotification,
} from '../streamCompletionNotification';

type TNotificationCall = {
  title: string;
  options?: NotificationOptions;
};

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = jest.fn(async () => 'granted' as NotificationPermission);
  static calls: TNotificationCall[] = [];

  constructor(title: string, options?: NotificationOptions) {
    MockNotification.calls.push({ title, options });
  }
}

describe('streamCompletionNotification', () => {
  const originalNotification = window.Notification;
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let hasFocusSpy: jest.SpyInstance<boolean, []>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-24T10:00:00.000Z'));
    MockNotification.permission = 'granted';
    MockNotification.calls = [];
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification as unknown as typeof Notification,
    });
    Object.defineProperty(global, 'Notification', {
      configurable: true,
      writable: true,
      value: MockNotification as unknown as typeof Notification,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    hasFocusSpy = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
    hasFocusSpy.mockRestore();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      writable: true,
      value: originalNotification,
    });
    Object.defineProperty(global, 'Notification', {
      configurable: true,
      writable: true,
      value: originalNotification,
    });

    if (originalVisibilityState === undefined) {
      delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    } else {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState);
    }
  });

  it('returns fallback body when response text is empty', () => {
    const body = formatStreamCompletionBody({
      fallbackMessage: 'Response complete',
      responseText: '   ',
    });

    expect(body).toBe('Response complete');
  });

  it('uses a non-empty fallback body when response and fallback text are empty', () => {
    const body = formatStreamCompletionBody({
      fallbackMessage: '   ',
      responseText: '',
    });

    expect(body).toBe('No content available');
  });

  it('trims and truncates long response text for notification body', () => {
    const body = formatStreamCompletionBody({
      fallbackMessage: 'Response complete',
      responseText: `${'a'.repeat(220)} `,
    });

    expect(body).toHaveLength(180);
    expect(body.endsWith('…')).toBe(true);
  });

  it('respects stream completion gating conditions', () => {
    expect(
      shouldShowStreamCompletionNotification({
        enabled: true,
        isAborted: false,
        isEarlyAbort: false,
      }),
    ).toBe(true);
    expect(
      shouldShowStreamCompletionNotification({
        enabled: false,
        isAborted: false,
        isEarlyAbort: false,
      }),
    ).toBe(false);
    expect(
      shouldShowStreamCompletionNotification({
        enabled: true,
        isAborted: true,
        isEarlyAbort: false,
      }),
    ).toBe(false);
    expect(
      shouldShowStreamCompletionNotification({
        enabled: true,
        isAborted: false,
        isEarlyAbort: true,
      }),
    ).toBe(false);
  });

  it('creates a notification when enabled, granted, and in background', () => {
    const notified = notifyStreamCompletion({
      enabled: true,
      title: 'LibreChat',
      fallbackMessage: 'Response complete',
      responseText: 'Your answer is ready.',
    });

    expect(notified).toBe(true);
    expect(MockNotification.calls).toHaveLength(1);
    expect(MockNotification.calls[0]).toMatchObject({
      title: 'LibreChat',
      options: expect.objectContaining({
        body: 'Your answer is ready.',
      }),
    });
  });

  it('does not create a notification while page is visible and focused', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    hasFocusSpy.mockReturnValue(true);

    const notified = notifyStreamCompletion({
      enabled: true,
      title: 'LibreChat',
      fallbackMessage: 'Response complete',
      responseText: 'Your answer is ready.',
    });

    expect(notified).toBe(false);
    expect(MockNotification.calls).toHaveLength(0);
  });

  it('does not create a notification when permission is denied', () => {
    MockNotification.permission = 'denied';

    const notified = notifyStreamCompletion({
      enabled: true,
      title: 'LibreChat',
      fallbackMessage: 'Response complete',
      responseText: 'Your answer is ready.',
    });

    expect(notified).toBe(false);
    expect(MockNotification.calls).toHaveLength(0);
  });

  it('creates notifications with unique tags', () => {
    notifyStreamCompletion({
      enabled: true,
      title: 'LibreChat',
      fallbackMessage: 'Response complete',
      responseText: 'First response',
    });
    notifyStreamCompletion({
      enabled: true,
      title: 'LibreChat',
      fallbackMessage: 'Response complete',
      responseText: 'Second response',
    });

    expect(MockNotification.calls).toHaveLength(2);
    expect(MockNotification.calls[0].options?.tag).toBeDefined();
    expect(MockNotification.calls[1].options?.tag).toBeDefined();
    expect(MockNotification.calls[0].options?.tag).not.toBe(MockNotification.calls[1].options?.tag);
  });

  it('suppresses notifications for a stream during configured TTL', () => {
    suppressStreamCompletionNotification('stream-1', 1_000);

    expect(isStreamCompletionSuppressed('stream-1')).toBe(true);

    jest.advanceTimersByTime(1_001);

    expect(isStreamCompletionSuppressed('stream-1')).toBe(false);
  });
});
