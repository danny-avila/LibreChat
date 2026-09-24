import { useEffect, useMemo, useState } from 'react';

import type { ReactNode } from 'react';
import type { SessionState } from './session';

import { resolveSession } from './session';
import { createApiClient } from './api';
import { ConfigScreen } from './config';
import { UsageScreen } from './usage';
import { UsersScreen } from './users';
import { RolesScreen } from './roles';

type ScreenName = 'users' | 'usage' | 'config' | 'roles';

const SCREENS: ReadonlyArray<{ name: ScreenName; label: string }> = [
  { name: 'users', label: 'Users & balances' },
  { name: 'usage', label: 'Cost dashboard' },
  { name: 'config', label: 'Config overrides' },
  { name: 'roles', label: 'Roles & permissions' },
];

const Panel = ({ children }: { children: ReactNode }) => (
  <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-lg font-semibold text-slate-900">Klima Admin</h1>
      {children}
    </section>
  </main>
);

const Denied = ({ state }: { state: Extract<SessionState, { status: 'denied' }> }) => (
  <div className="text-sm">
    <p className="mb-2 font-medium text-red-700" role="alert">
      {state.reason === 'forbidden' ? 'Signed in, but not an admin' : 'Not signed in'}
      {state.httpStatus > 0 ? ` (HTTP ${state.httpStatus})` : ''}
    </p>
    <p className="mb-4 text-slate-600">{state.message}</p>
    <a className="text-blue-700 underline" href="/login">
      Go to the LibreChat login
    </a>
  </div>
);

const Workspace = ({ state }: { state: Extract<SessionState, { status: 'authorized' }> }) => {
  const client = useMemo(() => createApiClient(state.token), [state.token]);
  const [screen, setScreen] = useState<ScreenName>('users');

  return (
    <main className="min-h-screen bg-slate-100">
      <nav className="border-b border-slate-200 bg-white" aria-label="Admin sections">
        <ul className="mx-auto flex max-w-7xl gap-1 px-4">
          {SCREENS.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                aria-current={screen === entry.name ? 'page' : undefined}
                className={
                  screen === entry.name
                    ? 'border-b-2 border-blue-700 px-3 py-3 text-sm font-semibold text-blue-800'
                    : 'border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-600 hover:text-slate-900'
                }
                onClick={() => setScreen(entry.name)}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {screen === 'users' ? <UsersScreen client={client} admin={state.user} /> : null}
      {screen === 'usage' ? <UsageScreen client={client} admin={state.user} /> : null}
      {screen === 'config' ? <ConfigScreen client={client} admin={state.user} /> : null}
      {screen === 'roles' ? <RolesScreen client={client} admin={state.user} /> : null}
    </main>
  );
};

export default function App() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    resolveSession().then((next) => {
      if (active) {
        setState(next);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <Panel>
        <p className="text-sm text-slate-600" aria-live="polite">
          Checking your LibreChat session…
        </p>
      </Panel>
    );
  }

  if (state.status === 'denied') {
    return (
      <Panel>
        <Denied state={state} />
      </Panel>
    );
  }

  return <Workspace state={state} />;
}
