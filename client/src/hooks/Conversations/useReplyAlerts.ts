import { useRef, useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ReplyReadState } from './useUnseenConversations';
import { replyNotificationsAtom, replyNotificationSoundAtom } from './replyNotificationSettings';
import { suppressFocusAcknowledgement } from './notificationNavigation';
import { startFocusLease, isAnotherTabFocused } from './focusLease';
import { useLocalize } from '~/hooks';

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

type AlertChannel = 'sound' | 'notification';

const ANNOUNCED_KEY: Record<AlertChannel, string> = {
  sound: 'replyAlerts:announced:sound',
  notification: 'replyAlerts:announced:notification',
};
const ANNOUNCED_LIMIT = 100;

/**
 * Claims one reply announcement for one channel across every open tab.
 *
 * Each tab polls on its own timer and keeps its own baseline, so without a shared record the
 * same reply would chime once per tab, seconds apart, and stack duplicate notifications.
 * localStorage is the coordination channel because it is synchronous and shared per origin:
 * the first tab to reach an arrival records its stamp and the rest read it before announcing.
 * A dead-heat between two timers can still double one alert, which was the failure mode
 * everywhere before; unavailable storage (private windows, quota) falls back to announcing
 * locally for the same reason.
 *
 * Per channel, because two tabs are not necessarily duplicates of each other: notification
 * permission is asked for per tab and can be granted in one and denied in another, and a
 * settings change reaches other tabs only once its storage event lands. A single shared claim
 * would let whichever tab reached the reply first silence the other channel entirely.
 */
const claimReplyAnnouncement = (
  channel: AlertChannel,
  conversationId: string,
  lastResponseAt: string,
): boolean => {
  try {
    const raw = window.localStorage.getItem(ANNOUNCED_KEY[channel]);
    const parsed: unknown = raw != null ? JSON.parse(raw) : [];
    const entries = (Array.isArray(parsed) ? parsed : []) as Array<[string, string]>;
    if (entries.some(([id, stamp]) => id === conversationId && stamp === lastResponseAt)) {
      return false;
    }
    const next: Array<[string, string]> = [
      [conversationId, lastResponseAt],
      ...entries.filter(([id]) => id !== conversationId),
    ];
    window.localStorage.setItem(
      ANNOUNCED_KEY[channel],
      JSON.stringify(next.slice(0, ANNOUNCED_LIMIT)),
    );
    return true;
  } catch {
    return true;
  }
};

const notificationPermission = (): NotificationPermission | null =>
  'Notification' in window ? Notification.permission : null;

/** Notified when a pending permission prompt settles; see `requestReplyNotificationPermission`. */
const permissionListeners = new Set<() => void>();

const subscribeToPermission = (listener: () => void): (() => void) => {
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
};

/**
 * Requests desktop-notification permission on behalf of the settings toggle.
 *
 * Must be called from the toggle's change handler: that is the user gesture browsers require.
 * An effect on the persisted toggle fires on load without one, and Chrome answers gestureless
 * requests by denying them, which locks the origin out of notifications until the user digs
 * into site settings.
 *
 * The answer is published rather than dropped: a reply can arrive while the prompt is still
 * open, and nothing else would tell the hook that this tab may now notify.
 */
export const requestReplyNotificationPermission = (): void => {
  if (!('Notification' in window) || Notification.permission !== 'default') {
    return;
  }
  /* Wrapped rather than chained directly: the legacy callback form of this API returns
     undefined, and older Safari still ships it. */
  void Promise.resolve(Notification.requestPermission()).finally(() => {
    for (const listener of permissionListeners) {
      listener();
    }
  });
};

/**
 * Announces replies that landed while the user was away.
 *
 * Alerts are suppressed whenever the document has focus: the sidebar dot already covers the case
 * where the user is looking at the app, and interrupting them there would be noise. The first
 * pass only records what is already unseen, so signing in with a backlog does not fire a burst.
 */
export default function useReplyAlerts(state: ReplyReadState | null) {
  const notificationsEnabled = useAtomValue(replyNotificationsAtom);
  const soundEnabled = useAtomValue(replyNotificationSoundAtom);
  const localize = useLocalize();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /** Read from the click handler, which outlives the render that created it. */
  const locationRef = useRef(pathname);
  locationRef.current = pathname;
  /** Reply stamps, not just ids: a second reply to a chat that is already unseen is its own
   *  arrival, and keying on membership alone would swallow it. */
  const knownRef = useRef<Map<string, string> | null>(null);
  const unlockedRef = useRef(false);

  /* Published for the other tabs of this origin, and read by them below: a reply announced by
     a background tab while the user reads a focused one is exactly the interruption the focus
     guard exists to prevent, and `document.hasFocus()` cannot see across tabs. */
  useEffect(() => startFocusLease(), []);

  /* The prompt the settings toggle opens settles long after its click, and nothing else would
     tell this hook that the tab may now notify. */
  const [permission, setPermission] = useState(notificationPermission);
  useEffect(() => subscribeToPermission(() => setPermission(notificationPermission())), []);

  /* The setting survives a reload but the audio output does not, and the toggle gesture that
     opened it last session is not replayed. Without this the first chime of a restored session
     would try to open the output while the tab is unfocused, which browsers refuse, and every
     later one would stay silent until the user toggled the setting off and on. The first click
     or keystroke anywhere in the app is gesture enough. */
  useEffect(() => {
    if (!soundEnabled || unlockedRef.current) {
      return;
    }
    const unlock = () => {
      if (unlockedRef.current) {
        return;
      }
      unlockedRef.current = true;
      unlockReplyNotificationSound();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [soundEnabled]);

  useEffect(() => {
    /* Null means no list has resolved yet, which is not an empty backlog. Initializing from it
       would let the real backlog arrive as a burst of alerts on a tab restored in the
       background, where the focus guard below never gets a chance to suppress them. */
    if (state === null) {
      return;
    }
    const { unseen, stamps } = state;

    const known = knownRef.current;
    const priorStamps = new Map(known ?? []);
    /* The high-water mark of everything this tab had already heard about, taken before the
       baseline absorbs this pass. */
    let newestKnownStamp = '';
    for (const stamp of priorStamps.values()) {
      if (stamp > newestKnownStamp) {
        newestKnownStamp = stamp;
      }
    }
    /* The baseline records the seen conversations too, and stamps are retained rather than
       replaced when a row leaves the cache. A conversation that has been read, whether during
       this session or before it started, keeps the reply stamp it always had, and if another
       device later marks it unread it re-enters the unseen set carrying that same stamp.
       Without the baseline that re-entry would look like a new reply and announce one that
       never happened. */
    const next = known === null ? new Map<string, string>() : known;
    /* A prompt this tab opened is still unanswered, so a reply arriving now cannot be
       announced yet. Baselining it would retire the arrival before the answer lands and lose
       the first notification the user enabled the setting for; the subscription below re-runs
       this pass once the prompt settles. */
    const awaitingPermission = notificationsEnabled && permission === 'default';
    if (!awaitingPermission) {
      for (const [conversationId, lastResponseAt] of stamps) {
        next.set(conversationId, lastResponseAt);
      }
    }
    knownRef.current = next;

    if (known === null) {
      return;
    }

    /* Flagged rows carry the manual-unread marker of a never-replied conversation: the dot
       and the badge count them, but announcing one as "Reply ready" would name a reply that
       does not exist.
       A conversation with no prior stamp is either a reply this tab has never heard of or an
       older one a later page just brought into the cache, and only the first is an arrival.
       The newest stamp the tab had already seen separates them: backlog is older than it by
       definition, and both values are the server's own, so no clock is compared. */
    const arrivals = unseen.filter(
      (conversation) =>
        conversation.conversationId &&
        !conversation.flagged &&
        (priorStamps.has(conversation.conversationId)
          ? priorStamps.get(conversation.conversationId) !== conversation.lastResponseAt
          : conversation.lastResponseAt > newestKnownStamp),
    );
    /* "Away" means away from LibreChat, not away from this tab: a second tab holding focus is
       the user reading the app, and the sidebar dot already covers them there. */
    if (arrivals.length === 0 || document.hasFocus() || isAnotherTabFocused()) {
      return;
    }

    /* Only a tab that will actually announce may claim, and only for the channel it will
       announce on. A tab with both channels off still runs this hook for the badge, and a tab
       whose notification permission was denied still holds the setting on; letting either
       claim would consume the reply while producing neither chime nor notification. The focus
       guard stays first, so a focused tab never claims a reply it would not announce either. */
    const willNotify = notificationsEnabled && canNotify();
    if (!soundEnabled && !willNotify) {
      return;
    }

    /* Every arrival is claimed, not just the first: one chime covers the whole pass, and
       leaving the rest unclaimed would hand another tab a reason to chime again for them. */
    if (soundEnabled) {
      const chimed = arrivals.filter((conversation) =>
        claimReplyAnnouncement('sound', conversation.conversationId, conversation.lastResponseAt),
      );
      if (chimed.length > 0) {
        playChime();
      }
    }

    if (!willNotify) {
      return;
    }

    const announced = arrivals.filter((conversation) =>
      claimReplyAnnouncement(
        'notification',
        conversation.conversationId,
        conversation.lastResponseAt,
      ),
    );

    for (const conversation of announced) {
      try {
        /* Android Chrome exposes the API and the permission but throws here: notifications
           have to come from the service worker there. A missed alert degrades quietly rather
           than throwing out of the effect. */
        const notification = new Notification(localize('com_ui_reply_ready'), {
          body: conversation.title || localize('com_ui_untitled'),
          tag: conversation.conversationId,
        });
        const target = `/c/${conversation.conversationId}`;
        notification.onclick = () => {
          /* Only when the click is leaving for a different conversation, where the focus would
             otherwise read as the user catching up on whatever is still open behind it. A
             notification for the conversation already on screen navigates nowhere, and
             suppressing there would swallow the one trigger that acknowledges it. */
          if (locationRef.current !== target) {
            suppressFocusAcknowledgement();
          }
          navigate(target);
          window.focus();
          notification.close();
        };
      } catch {
        /* Constructor unsupported on this platform, or the notification was rejected. */
      }
    }
  }, [state, soundEnabled, notificationsEnabled, permission, localize, navigate]);
}
