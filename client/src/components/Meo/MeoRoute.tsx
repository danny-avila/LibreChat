import MeoDesktopApp from './MeoDesktopApp';
import { MeoSessionProvider, useMeoSession } from './session';

function MeoSessionGate() {
  const { user, loading, error } = useMeoSession();

  if (loading || (!user && !error)) {
    return (
      <main className="bg-surface-secondary text-text-secondary grid min-h-[100dvh] place-items-center p-6">
        <div role="status">Opening Meo AI…</div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="bg-surface-secondary grid min-h-[100dvh] place-items-center p-6">
        <section className="border-border-light bg-surface-primary w-full max-w-md rounded-[26px] border p-8 text-center shadow-sm">
          <div className="bg-accent-primary text-surface-primary mx-auto grid size-12 place-items-center rounded-2xl text-xs font-extrabold">
            AI
          </div>
          <h1 className="text-text-primary mt-5 text-2xl font-semibold">Meo AI</h1>
          <p className="text-text-secondary mt-2 text-sm leading-6">
            {error ?? 'Sign in with Meo Account to continue.'}
          </p>
          <a
            className="bg-accent-primary text-surface-primary mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 font-semibold"
            href="/oauth/openid?return=%2Fnew"
          >
            Continue with Meo Account
          </a>
        </section>
      </main>
    );
  }

  return <MeoDesktopApp />;
}

export default function MeoRoute() {
  return (
    <MeoSessionProvider>
      <MeoSessionGate />
    </MeoSessionProvider>
  );
}
