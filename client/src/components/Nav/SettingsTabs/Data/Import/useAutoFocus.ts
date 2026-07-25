import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Moves focus to the returned ref's element on mount, and again whenever
 * `focusKey` changes identity. Used to keep keyboard/screen-reader focus on
 * the panel's current primary region as the import flow moves between
 * states (drop zone -> summary -> progress -> report), since the DOM focus
 * manager is an external system this needs to synchronize with, not
 * derived render state.
 */
export default function useAutoFocus<T extends HTMLElement, K>(focusKey: K): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [focusKey]);

  return ref;
}
