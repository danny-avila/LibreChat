import React, { createContext, useContext, ReactNode } from 'react';

interface ArtifactContextType {
  openArtifactWithPage?: (page: number, artifactId?: string) => void;
}

const ArtifactContext = createContext<ArtifactContextType>({});

export const useArtifactContext = () => {
  const context = useContext(ArtifactContext);
  return context;
};

interface ArtifactProviderProps {
  children: ReactNode;
  openArtifactWithPage?: (page: number, artifactId?: string) => void;
}

export const ArtifactProvider: React.FC<ArtifactProviderProps> = ({
  children,
  openArtifactWithPage,
}) => {
  return (
    <ArtifactContext.Provider value={{ openArtifactWithPage }}>
      {children}
    </ArtifactContext.Provider>
  );
};
