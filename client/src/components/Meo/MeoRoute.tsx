import { useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import MeoDesktopApp from './MeoDesktopApp';

function meoReturnPath(): string {
  const path = `${window.location.pathname}${window.location.search}`;
  if ((path.startsWith('/new') || path.startsWith('/meo')) && !path.startsWith('//')) {
    return path;
  }
  return '/new';
}

function openMeoAccountLogin() {
  const redirectTo = encodeURIComponent(meoReturnPath());
  window.location.assign(`/oauth/openid?redirect_to=${redirectTo}`);
}

export default function MeoRoute() {
  const { user, isAuthenticated, isAuthReady } = useAuthContext();

  useEffect(() => {
    if (!isAuthReady || isAuthenticated) return;
    openMeoAccountLogin();
  }, [isAuthReady, isAuthenticated]);

  if (!isAuthReady) {
    return (
      <main className="bg-surface-secondary text-text-secondary grid min-h-[100dvh] place-items-center p-6">
        <div role="status">Opening Meo AI…</div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="bg-surface-secondary grid min-h-[100dvh] place-items-center p-6">
        <section className="border-border-light bg-surface-primary w-full max-w-md rounded-[26px] border p-8 text-center shadow-sm">
          <div className="bg-accent-primary text-surface-primary mx-auto grid size-12 place-items-center rounded-2xl text-xs font-extrabold">
            AI
          </div>
          <h1 className="text-text-primary mt-5 text-2xl font-semibold">Meo AI</h1>
          <p className="text-text-secondary mt-2 text-sm leading-6">
            Opening Meo Account sign-in…
          </p>
          <button
            className="bg-accent-primary text-surface-primary mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 font-semibold"
            type="button"
            onClick={openMeoAccountLogin}
          >
            Continue with Meo Account
          </button>
        </section>
      </main>
    );
  }

  return <MeoDesktopApp />;
}
