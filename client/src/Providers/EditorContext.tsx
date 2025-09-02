import React, { createContext, useContext, useState } from 'react';

interface EditorContextType {
  isMutating: boolean;
  setIsMutating: React.Dispatch<React.SetStateAction<boolean>>;
  currentCode?: string;
  setCurrentCode: React.Dispatch<React.SetStateAction<string | undefined>>;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [isMutating, setIsMutating] = useState(false);
  const [currentCode, setCurrentCode] = useState<string | undefined>();

  return (
    <EditorContext.Provider value={{ isMutating, setIsMutating, currentCode, setCurrentCode }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext() {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditorContext must be used within an EditorProvider');
  }
  return context;
}
