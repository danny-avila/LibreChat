import { createContext, useContext, useState, ReactNode } from 'react';

const STORAGE_KEY = 'side:active-panel';
const DEFAULT_PANEL = 'conversations';

function getInitialActivePanel(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? saved : DEFAULT_PANEL;
}

interface ActivePanelContextType {
  active: string;
  setActive: (id: string) => void;
}

const ActivePanelContext = createContext<ActivePanelContextType | undefined>(undefined);

export function ActivePanelProvider({ children }: { children: ReactNode }) {
  const [active, _setActive] = useState<string>(getInitialActivePanel);

  const setActive = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    _setActive(id);
  };

  return (
    <ActivePanelContext.Provider value={{ active, setActive }}>
      {children}
    </ActivePanelContext.Provider>
  );
}

export function useActivePanel() {
  const context = useContext(ActivePanelContext);
  if (context === undefined) {
    throw new Error('useActivePanel must be used within an ActivePanelProvider');
  }
  return context;
}
