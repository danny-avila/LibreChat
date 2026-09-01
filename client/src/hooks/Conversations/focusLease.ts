/**
 * Tells every LibreChat tab whether the user is looking at one of them.
 *
 * `document.hasFocus()` only answers for the tab asking, so with two tabs open the unfocused one
 * would chime and post desktop notifications while the user reads the focused one, which is
 * exactly what the settings promise not to do. The focused tab publishes a lease through
 * localStorage, the one coordination channel already shared by these alerts, and the rest read it
 * before announcing.
 *
 * The lease is refreshed on a slow heartbeat and cleared on blur, so a tab that is killed without
 * running its cleanup stops suppressing the others within one heartbeat window rather than for
 * the rest of the session.
 */
const FOCUS_LEASE_KEY = 'replyAlerts:focusedAt';
const FOCUS_LEASE_HEARTBEAT_MS = 20_000;
const FOCUS_LEASE_TTL_MS = 60_000;

const writeLease = (): void => {
  try {
    window.localStorage.setItem(FOCUS_LEASE_KEY, String(Date.now()));
  } catch {
    /* Private windows and quota failures degrade to per-tab focus, as before. */
  }
};

const clearLease = (): void => {
  try {
    window.localStorage.removeItem(FOCUS_LEASE_KEY);
  } catch {
    /* See above. */
  }
};

/**
 * Whether some other tab of this origin is currently focused. The caller checks its own focus
 * first, so a lease this tab wrote itself is only ever read while it is unfocused, by which time
 * its own cleanup has removed it.
 */
export const isAnotherTabFocused = (): boolean => {
  try {
    const raw = window.localStorage.getItem(FOCUS_LEASE_KEY);
    if (raw == null) {
      return false;
    }
    const focusedAt = Number(raw);
    return Number.isFinite(focusedAt) && Date.now() - focusedAt < FOCUS_LEASE_TTL_MS;
  } catch {
    return false;
  }
};

/** Publishes the lease for as long as this tab holds focus. */
export const startFocusLease = (): (() => void) => {
  let heartbeat: number | null = null;

  const stopHeartbeat = () => {
    if (heartbeat !== null) {
      window.clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const hold = () => {
    writeLease();
    if (heartbeat === null) {
      heartbeat = window.setInterval(writeLease, FOCUS_LEASE_HEARTBEAT_MS);
    }
  };

  const release = () => {
    stopHeartbeat();
    clearLease();
  };

  if (document.hasFocus()) {
    hold();
  }

  window.addEventListener('focus', hold);
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);

  return () => {
    window.removeEventListener('focus', hold);
    window.removeEventListener('blur', release);
    window.removeEventListener('pagehide', release);
    release();
  };
};
