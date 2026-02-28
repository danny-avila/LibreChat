import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ActivePanelContextType {
  active: string | undefined;
  setActive: (id: string) => void;
}

const ActivePanelContext = createContext<ActivePanelContextType | undefined>(undefined);

export function ActivePanelProvider({
  children,
  defaultActive,
}: {
  children: ReactNode;
  defaultActive?: string;
}) {
  const [active, _setActive] = useState<string | undefined>(defaultActive);

  useEffect(() => {
    if (defaultActive != null) {
      _setActive(defaultActive);
    }
  }, [defaultActive]);

  const setActive = (id: string) => {
    localStorage.setItem('side:active-panel', id);
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
