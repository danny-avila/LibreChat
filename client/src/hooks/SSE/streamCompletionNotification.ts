const MAX_NOTIFICATION_BODY_LENGTH = 180;
const STREAM_COMPLETION_TAG = 'stream-complete';

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
  const content = (responseText ?? '').replace(/\s+/g, ' ').trim();
  if (content.length === 0) {
    return fallbackMessage;
  }
  if (content.length <= MAX_NOTIFICATION_BODY_LENGTH) {
    return content;
  }
  return `${content.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1)}…`;
};

export const shouldShowStreamCompletionNotification = ({
  enabled,
  isAborted = false,
  isEarlyAbort = false,
}: Pick<StreamCompletionNotificationParams, 'enabled' | 'isAborted' | 'isEarlyAbort'>): boolean =>
  enabled && !isAborted && !isEarlyAbort;

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
      tag: STREAM_COMPLETION_TAG,
    });
    return true;
  } catch (error) {
    console.error('Unable to create browser notification:', error);
    return false;
  }
};
