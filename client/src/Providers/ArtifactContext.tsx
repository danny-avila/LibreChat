import { createContext, useContext, ReactNode, useCallback, useRef } from 'react';

type TArtifactContext = {
  getNextIndex: (skip: boolean) => number;
  resetCounter: () => void;
};

export const ArtifactContext = createContext<TArtifactContext>({} as TArtifactContext);
export const useArtifactContext = () => useContext(ArtifactContext);

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const counterRef = useRef(0);

  const getNextIndex = useCallback((skip: boolean) => {
    if (skip) {
      return counterRef.current;
    }
    const nextIndex = counterRef.current;
    counterRef.current += 1;
    return nextIndex;
  }, []);

  const resetCounter = useCallback(() => {
    counterRef.current = 0;
  }, []);

  return (
    <ArtifactContext.Provider value={{ getNextIndex, resetCounter }}>
      {children}
    </ArtifactContext.Provider>
  );
}
