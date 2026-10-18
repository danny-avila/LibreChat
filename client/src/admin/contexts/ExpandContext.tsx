import { createContext, useState, useCallback } from 'react';
import type * as t from '~/admin/types';

const IDLE: t.ExpandSignal = { mode: null, seq: 0 };

/** The last Expand all / Collapse all request of the configuration page (WS5). */
export const ExpandContext = createContext<t.ExpandSignal>(IDLE);

/** Sends Expand all / Collapse all requests to the collapsibles rendered under it (WS5). */
export const ExpandRequestContext = createContext<(mode: 'expand' | 'collapse') => void>(() => {});

/**
 * Owns the expand signal. Collapsibles read it through `useExpandableState`,
 * so groups that mount after an Expand all (lazily rendered children) open too.
 * A new `resetKey` (tab or scope change) forgets the last request before the
 * new content mounts, without touching groups that are already open.
 */
export function ExpandProvider({ resetKey, children }: t.ExpandProviderProps) {
  const [state, setState] = useState({ resetKey, signal: IDLE });
  const request = useCallback(
    (mode: 'expand' | 'collapse') =>
      setState((prev) => ({ ...prev, signal: { mode, seq: prev.signal.seq + 1 } })),
    [],
  );

  let { signal } = state;
  if (state.resetKey !== resetKey) {
    signal = { mode: null, seq: state.signal.seq };
    setState({ resetKey, signal });
  }

  return (
    <ExpandRequestContext.Provider value={request}>
      <ExpandContext.Provider value={signal}>{children}</ExpandContext.Provider>
    </ExpandRequestContext.Provider>
  );
}
