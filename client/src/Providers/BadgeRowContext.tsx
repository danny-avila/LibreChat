import React, { createContext, useContext } from 'react';

interface BadgeRowContextType {
  conversationId?: string | null;
}

const BadgeRowContext = createContext<BadgeRowContextType | undefined>(undefined);

export function useBadgeRowContext() {
  const context = useContext(BadgeRowContext);
  if (context === undefined) {
    throw new Error('useBadgeRowContext must be used within a BadgeRowProvider');
  }
  return context;
}

interface BadgeRowProviderProps {
  children: React.ReactNode;
  conversationId?: string | null;
}

export default function BadgeRowProvider({ children, conversationId }: BadgeRowProviderProps) {
  const value: BadgeRowContextType = {
    conversationId,
  };

  return <BadgeRowContext.Provider value={value}>{children}</BadgeRowContext.Provider>;
}
