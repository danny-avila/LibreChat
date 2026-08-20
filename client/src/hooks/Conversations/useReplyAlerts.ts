import { useRef, useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import type { UnseenConversation } from './useUnseenConversations';
import { useLocalize } from '~/hooks';
import store from '~/store';

let sharedContext: AudioContext | null = null;

/**
 * Opens the shared output, resuming it if the browser parked it.
 *
 * Alerts only fire while the document is unfocused, so a context first opened there has no user
 * activation behind it and browsers leave it suspended. The settings toggle calls this from its
 * change handler instead, which is a gesture, and every later chime reuses what it unlocked.
 */
const openAudioContext = (): AudioContext | null => {
  if (typeof window.AudioContext !== 'function') {
    return null;
  }
  sharedContext = sharedContext ?? new AudioContext();
  if (sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }
  return sharedContext;
};

/** Called from the sound toggle's change handler, the one gesture the audio output can use. */
export const unlockReplyNotificationSound = (): void => {
  try {
    openAudioContext();
  } catch {
    /* No output device, or the context limit is already reached. */
  }
};

/**
 * Synthesized rather than shipped as an asset: two short tones need no binary, no request, and
 * no cache entry. Failure is always silent, because a missed chime is not worth an error toast.
 */
const playChime = () => {
  try {
    const context = openAudioContext();
    if (!context) {
      return;
    }
    sharedContext = context;
    const start = sharedContext.currentTime;
    const tones: Array<[number, number]> = [
      [880, 0],
      [1174.66, 0.12],
    ];

    for (const [frequency, offset] of tones) {
      const oscillator = sharedContext.createOscillator();
      const gain = sharedContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.25);
      oscillator.connect(gain).connect(sharedContext.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.3);
    }
  } catch {
    /* Autoplay policy or an unavailable output device. */
  }
};

const canNotify = (): boolean => 'Notification' in window && Notification.permission === 'granted';

/**
 * Requests desktop-notification permission on behalf of the settings toggle.
 *
 * Must be called from the toggle's change handler: that is the user gesture browsers require.
 * An effect on the persisted toggle fires on load without one, and Chrome answers gestureless
 * requests by denying them, which locks the origin out of notifications until the user digs
 * into site settings.
 */
export const requestReplyNotificationPermission = (): void => {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return;
  }
  void Notification.requestPermission();
};

/**
 * Announces replies that landed while the user was away.
 *
 * Alerts are suppressed whenever the document has focus: the sidebar dot already covers the case
 * where the user is looking at the app, and interrupting them there would be noise. The first
 * pass only records what is already unseen, so signing in with a backlog does not fire a burst.
 */
export default function useReplyAlerts(unseen: UnseenConversation[] | null) {
  const notificationsEnabled = useRecoilValue(store.replyNotifications);
  const soundEnabled = useRecoilValue(store.replyNotificationSound);
  const localize = useLocalize();
  const navigate = useNavigate();
  /** Reply stamps, not just ids: a second reply to a chat that is already unseen is its own
   *  arrival, and keying on membership alone would swallow it. */
  const knownRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    /* Null means no list has resolved yet, which is not an empty backlog. Initializing from it
       would let the real backlog arrive as a burst of alerts on a tab restored in the
       background, where the focus guard below never gets a chance to suppress them. */
    if (unseen === null) {
      return;
    }

    const known = knownRef.current;
    knownRef.current = new Map(
      unseen.map((conversation) => [conversation.conversationId, conversation.lastResponseAt]),
    );

    if (known === null) {
      return;
    }

    const arrivals = unseen.filter(
      (conversation) =>
        conversation.conversationId &&
        known.get(conversation.conversationId) !== conversation.lastResponseAt,
    );
    if (arrivals.length === 0 || document.hasFocus()) {
      return;
    }

    if (soundEnabled) {
      playChime();
    }

    if (!notificationsEnabled || !canNotify()) {
      return;
    }

    for (const conversation of arrivals) {
      try {
        /* Android Chrome exposes the API and the permission but throws here: notifications
           have to come from the service worker there. A missed alert degrades quietly rather
           than throwing out of the effect. */
        const notification = new Notification(localize('com_ui_reply_ready'), {
          body: conversation.title || localize('com_ui_untitled'),
          tag: conversation.conversationId,
        });
        notification.onclick = () => {
          window.focus();
          navigate(`/c/${conversation.conversationId}`);
          notification.close();
        };
      } catch {
        /* Constructor unsupported on this platform, or the notification was rejected. */
      }
    }
  }, [unseen, soundEnabled, notificationsEnabled, localize, navigate]);
}
