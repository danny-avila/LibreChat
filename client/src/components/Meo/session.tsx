import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type MeoSessionUser = {
  id: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  picture?: string;
};

type MeoSessionState = {
  user: MeoSessionUser | null;
  loading: boolean;
  error: string | null;
};

const MeoSessionContext = createContext<MeoSessionState | null>(null);
const oauthRoundTripKey = 'meo:oauth-round-trip';
const oauthRoundTripWindowMs = 2 * 60 * 1000;

function loginReturnPath(): string {
  const path = `${window.location.pathname}${window.location.search}`;
  return path.startsWith('/new') && !path.startsWith('//') ? path : '/new';
}

function recentOauthRoundTrip(): boolean {
  try {
    const value = Number(window.sessionStorage.getItem(oauthRoundTripKey));
    return Number.isFinite(value) && Date.now() - value < oauthRoundTripWindowMs;
  } catch {
    return false;
  }
}

function markOauthRoundTrip(): void {
  try {
    window.sessionStorage.setItem(oauthRoundTripKey, String(Date.now()));
  } catch {
    // Session storage is an optimization only; OAuth still works without it.
  }
}

function clearOauthRoundTrip(): void {
  try {
    window.sessionStorage.removeItem(oauthRoundTripKey);
  } catch {
    // Ignore browsers that block session storage.
  }
}

function sessionFailureMessage(response: Response): string {
  const reason = response.headers.get('X-Meo-Session-Failure');
  const safeReason =
    reason && /^[a-z0-9_]{1,64}$/.test(reason) ? reason : 'session_unavailable';
  return `Meo Account sign-in completed, but Meo AI could not restore this browser session. Reference: ${safeReason}.`;
}

export function MeoSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeoSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/meo/session', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          if (recentOauthRoundTrip()) {
            throw new Error(sessionFailureMessage(response));
          }
          markOauthRoundTrip();
          const returnTo = encodeURIComponent(loginReturnPath());
          window.location.replace(`/oauth/openid?return=${returnTo}`);
          return null;
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.user?.id) {
          throw new Error('Meo Account session is unavailable.');
        }
        clearOauthRoundTrip();
        return payload.user as MeoSessionUser;
      })
      .then((sessionUser) => {
        if (!controller.signal.aborted && sessionUser) setUser(sessionUser);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Meo Account session is unavailable.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const value = useMemo(() => ({ user, loading, error }), [user, loading, error]);
  return <MeoSessionContext.Provider value={value}>{children}</MeoSessionContext.Provider>;
}

export function useMeoSession(): MeoSessionState {
  const context = useContext(MeoSessionContext);
  if (!context) throw new Error('useMeoSession must be used inside MeoSessionProvider');
  return context;
}
