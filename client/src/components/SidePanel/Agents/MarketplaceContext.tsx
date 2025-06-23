import React, { useMemo } from 'react';

import { EModelEndpoint } from 'librechat-data-provider';

import { ChatContext } from '~/Providers';

/**
 * Minimal marketplace provider that provides only what SidePanel actually needs
 * Replaces the bloated 44-function ChatContext implementation
 */
interface MarketplaceProviderProps {
  children: React.ReactNode;
}

export const MarketplaceProvider: React.FC<MarketplaceProviderProps> = ({ children }) => {
  // Create more complete context to prevent FileRow and other component errors
  // when agents with files are opened in the marketplace
  const marketplaceContext = useMemo(
    () => ({
      conversation: {
        endpoint: EModelEndpoint.agents,
        conversationId: 'marketplace',
        title: 'Agent Marketplace',
      },
      // File-related context properties to prevent FileRow errors
      files: new Map(),
      setFiles: () => {},
      setFilesLoading: () => {},
      // Other commonly used context properties to prevent undefined errors
      isSubmitting: false,
      setIsSubmitting: () => {},
      latestMessage: null,
      setLatestMessage: () => {},
      // Minimal functions to prevent errors when components try to use them
      ask: () => {},
      regenerate: () => {},
      stopGenerating: () => {},
      submitMessage: () => {},
    }),
    [],
  );

  return <ChatContext.Provider value={marketplaceContext as any}>{children}</ChatContext.Provider>;
};
