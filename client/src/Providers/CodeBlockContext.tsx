import { createContext, useContext, ReactNode, useCallback, useRef } from 'react';

type TCodeBlockContext = {
  getNextIndex: (skip: boolean) => number;
  resetCounter: () => void;
  // codeBlocks: Map<number, string>;
};

export const CodeBlockContext = createContext<TCodeBlockContext>({} as TCodeBlockContext);
export const useCodeBlockContext = () => useContext(CodeBlockContext);

export function CodeBlockProvider({ children }: { children: ReactNode }) {
  const counterRef = useRef(0);
  // const codeBlocks = useRef(new Map<number, string>()).current;

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
    <CodeBlockContext.Provider value={{ getNextIndex, resetCounter }}>
      {children}
    </CodeBlockContext.Provider>
  );
}
