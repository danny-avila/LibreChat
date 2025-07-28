import React from 'react';
import { ChatContext } from '~/Providers';
import { useChatHelpers } from '~/hooks';

/**
 * Minimal marketplace provider that provides only what SidePanel actually needs
 * Replaces the bloated 44-function ChatContext implementation
 */
interface MarketplaceProviderProps {
  children: React.ReactNode;
}

export const MarketplaceProvider: React.FC<MarketplaceProviderProps> = ({ children }) => {
  const chatHelpers = useChatHelpers(0, 'new');

  return <ChatContext.Provider value={chatHelpers as any}>{children}</ChatContext.Provider>;
};
