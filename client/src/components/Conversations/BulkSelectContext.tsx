import React, { createContext, useContext, useState, useCallback } from 'react';

interface BulkSelectContextValue {
  selectedConversations: Set<string>;
  isSelectionMode: boolean;
  selectConversation: (conversationId: string) => void;
  deselectConversation: (conversationId: string) => void;
  toggleConversation: (conversationId: string) => void;
  selectAll: (conversationIds: string[]) => void;
  clearSelection: () => void;
  isSelected: (conversationId: string) => boolean;
}

const BulkSelectContext = createContext<BulkSelectContextValue | null>(null);

export const useBulkSelect = () => {
  const context = useContext(BulkSelectContext);
  if (!context) {
    throw new Error('useBulkSelect must be used within a BulkSelectProvider');
  }
  return context;
};

interface BulkSelectProviderProps {
  children: React.ReactNode;
}

export const BulkSelectProvider: React.FC<BulkSelectProviderProps> = ({ children }) => {
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set());

  const isSelectionMode = selectedConversations.size > 0;

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedConversations(prev => new Set(prev).add(conversationId));
  }, []);

  const deselectConversation = useCallback((conversationId: string) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      newSet.delete(conversationId);
      return newSet;
    });
  }, []);

  const toggleConversation = useCallback((conversationId: string) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback((conversationIds: string[]) => {
    setSelectedConversations(new Set(conversationIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedConversations(new Set());
  }, []);

  const isSelected = useCallback((conversationId: string) => {
    return selectedConversations.has(conversationId);
  }, [selectedConversations]);

  const value: BulkSelectContextValue = {
    selectedConversations,
    isSelectionMode,
    selectConversation,
    deselectConversation,
    toggleConversation,
    selectAll,
    clearSelection,
    isSelected,
  };

  return (
    <BulkSelectContext.Provider value={value}>
      {children}
    </BulkSelectContext.Provider>
  );
};
