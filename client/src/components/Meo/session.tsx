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

function loginReturnPath(): string {
  const path = `${window.location.pathname}${window.location.search}`;
  return path.startsWith('/new') && !path.startsWith('//') ? path : '/new';
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
          const returnTo = encodeURIComponent(loginReturnPath());
          window.location.replace(`/oauth/openid?return=${returnTo}`);
          return null;
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.user?.id) {
          throw new Error('Meo Account session is unavailable.');
        }
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
