const MAX_NOTIFICATION_BODY_LENGTH = 180;
const STREAM_COMPLETION_TAG = 'stream-complete';
const DEFAULT_STREAM_COMPLETION_FALLBACK_MESSAGE = 'No content available';
const DEFAULT_SUPPRESSION_TTL_MS = 45_000;
let streamCompletionNotificationCounter = 0;
const suppressedStreamCompletionMap = new Map<string, number>();

type StreamCompletionNotificationParams = {
  enabled: boolean;
  title: string;
  fallbackMessage: string;
  responseText?: string;
  isAborted?: boolean;
  isEarlyAbort?: boolean;
};

export const formatStreamCompletionBody = ({
  fallbackMessage,
  responseText,
}: {
  fallbackMessage: string;
  responseText?: string;
}): string => {
  const normalizedFallbackMessage =
    fallbackMessage.trim().length > 0
      ? fallbackMessage.trim()
      : DEFAULT_STREAM_COMPLETION_FALLBACK_MESSAGE;
  const content = (responseText ?? '').replace(/\s+/g, ' ').trim();
  if (content.length === 0) {
    return normalizedFallbackMessage;
  }
  if (content.length <= MAX_NOTIFICATION_BODY_LENGTH) {
    return content;
  }
  return `${content.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1)}…`;
};

const getStreamCompletionTag = (): string => {
  streamCompletionNotificationCounter += 1;
  return `${STREAM_COMPLETION_TAG}-${Date.now()}-${streamCompletionNotificationCounter}`;
};

export const shouldShowStreamCompletionNotification = ({
  enabled,
  isAborted = false,
  isEarlyAbort = false,
}: Pick<StreamCompletionNotificationParams, 'enabled' | 'isAborted' | 'isEarlyAbort'>): boolean =>
  enabled && !isAborted && !isEarlyAbort;

const pruneExpiredSuppressedStreamCompletions = (now: number): void => {
  for (const [streamId, expiresAt] of suppressedStreamCompletionMap) {
    if (expiresAt <= now) {
      suppressedStreamCompletionMap.delete(streamId);
    }
  }
};

export const suppressStreamCompletionNotification = (
  streamId: string,
  ttlMs = DEFAULT_SUPPRESSION_TTL_MS,
): void => {
  if (streamId.trim().length === 0) {
    return;
  }
  const now = Date.now();
  pruneExpiredSuppressedStreamCompletions(now);
  suppressedStreamCompletionMap.set(streamId, now + Math.max(ttlMs, 0));
};

export const isStreamCompletionSuppressed = (streamId: string): boolean => {
  if (streamId.trim().length === 0) {
    return false;
  }
  const now = Date.now();
  pruneExpiredSuppressedStreamCompletions(now);
  const expiresAt = suppressedStreamCompletionMap.get(streamId);
  return expiresAt != null && expiresAt > now;
};

const isNotificationSupported = (): boolean =>
  typeof window !== 'undefined' && typeof Notification !== 'undefined' && 'Notification' in window;

const isBackgroundPage = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.visibilityState !== 'visible' || document.hasFocus() === false;
};

export const notifyStreamCompletion = ({
  enabled,
  title,
  fallbackMessage,
  responseText,
  isAborted = false,
  isEarlyAbort = false,
}: StreamCompletionNotificationParams): boolean => {
  if (!shouldShowStreamCompletionNotification({ enabled, isAborted, isEarlyAbort })) {
    return false;
  }
  if (!isNotificationSupported()) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  if (!isBackgroundPage()) {
    return false;
  }

  const body = formatStreamCompletionBody({ fallbackMessage, responseText });
  try {
    new Notification(title, {
      body,
      tag: getStreamCompletionTag(),
    });
    return true;
  } catch (error) {
    console.error('Unable to create browser notification:', error);
    return false;
  }
};
