import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  if (intervalId === null) {
    intervalId = setInterval(() => {
      listeners.forEach((listener) => listener());
    }, MINUTE_MS);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
};

/**
 * Checks the displayed time on one shared minute timer. React only rerenders
 * when the selected text changes, preserving rounding and date boundaries
 * without rerendering every timestamp on every tick.
 */
export default function useTimeTick(getSnapshot: () => string): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
