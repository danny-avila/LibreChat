import { useCallback, useEffect, useRef } from 'react';
import { registerSessionCleanup } from '~/store/session';

/** Async feature work can commit only to the authenticated host session that started it. */
export function useMediaSessionGuard(scope: string | undefined, authenticated: boolean) {
  const session = useRef({ active: true, scope, authenticated, generation: 0, ended: false });
  if (session.current.scope !== scope || session.current.authenticated !== authenticated) {
    session.current.scope = scope;
    session.current.authenticated = authenticated;
    session.current.generation++;
    session.current.ended = false;
  }
  const generation = session.current.generation;
  useEffect(() => {
    const current = session.current;
    current.active = true;
    const unregister = registerSessionCleanup(() => {
      current.ended = true;
      current.generation++;
    });
    return () => {
      current.active = false;
      unregister();
    };
  }, []);
  return useCallback(
    () =>
      session.current.active &&
      !session.current.ended &&
      session.current.authenticated &&
      session.current.scope === scope &&
      session.current.generation === generation,
    [scope, generation],
  );
}
