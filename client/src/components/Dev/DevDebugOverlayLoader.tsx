import { useEffect, useState, type ComponentType } from 'react';
import { DEV_DEBUG_OVERLAY_STORAGE_KEY } from './devDebugOverlayConstants';

function readStoredVisible(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(DEV_DEBUG_OVERLAY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Loads the dev-only debug overlay chunk when visible. In production builds
 * this component returns null and never runs dynamic import().
 */
export default function DevDebugOverlayLoader() {
  const isDev = import.meta.env.DEV;
  const [visible, setVisible] = useState(() => isDev && readStoredVisible());
  const [Panel, setPanel] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!isDev) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'Period') {
        e.preventDefault();
        setVisible((prev) => {
          const next = !prev;
          try {
            window.localStorage.setItem(DEV_DEBUG_OVERLAY_STORAGE_KEY, next ? '1' : '0');
          } catch {
            /* ignore quota / private mode */
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDev]);

  useEffect(() => {
    if (!isDev || !visible) {
      return;
    }
    let cancelled = false;
    void import('./DevDebugOverlayPanel').then((m) => {
      if (!cancelled) {
        setPanel(() => m.default);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isDev, visible]);

  if (!isDev) {
    return null;
  }
  if (!visible) {
    return null;
  }
  if (!Panel) {
    return (
      <div className="pointer-events-none fixed bottom-2 left-2 z-[900] rounded-md bg-black/75 px-2 py-1 font-mono text-[11px] text-white">
        Loading debug panel…
      </div>
    );
  }

  return <Panel />;
}
