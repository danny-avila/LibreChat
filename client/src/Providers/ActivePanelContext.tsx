import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

const STORAGE_KEY = 'side:active-panel';
export const DEFAULT_PANEL = 'conversations';

/** True only when this document was loaded by reloading the tab, not by opening or duplicating one. */
function isReload(): boolean {
  if (typeof performance.getEntriesByType !== 'function') {
    return false;
  }
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry?.type === 'reload';
}

/**
 * A reload keeps the panel the tab had open; any other entry, including a tab whose session
 * storage was cloned from its opener, lands on chat history. The legacy localStorage copy is
 * dropped so an old panel cannot resurface on entry.
 */
function getInitialActivePanel(): string {
  localStorage.removeItem(STORAGE_KEY);
  if (!isReload()) {
    sessionStorage.removeItem(STORAGE_KEY);
    return DEFAULT_PANEL;
  }
  return sessionStorage.getItem(STORAGE_KEY) || DEFAULT_PANEL;
}

interface ActivePanelContextType {
  active: string;
  setActive: (id: string) => void;
}

const ActivePanelContext = createContext<ActivePanelContextType | undefined>(undefined);

export function ActivePanelProvider({ children }: { children: ReactNode }) {
  const [active, _setActive] = useState<string>(getInitialActivePanel);

  const setActive = useCallback((id: string) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    _setActive(id);
  }, []);

  const value = useMemo(() => ({ active, setActive }), [active, setActive]);

  return <ActivePanelContext.Provider value={value}>{children}</ActivePanelContext.Provider>;
}

export function useActivePanel() {
  const context = useContext(ActivePanelContext);
  if (context === undefined) {
    throw new Error('useActivePanel must be used within an ActivePanelProvider');
  }
  return context;
}

/** Returns `active` when it matches a known link, otherwise the first link's id. */
export function resolveActivePanel(active: string, links: { id: string }[]): string {
  if (links.length > 0 && links.some((l) => l.id === active)) {
    return active;
  }
  return links[0]?.id ?? active;
}
