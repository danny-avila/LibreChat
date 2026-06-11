import { createContext, useContext, ReactNode, useCallback, useRef } from 'react';

type TCodeBlockContext = {
  getNextIndex: (skip: boolean) => number;
  resetCounter: () => void;
};

export const CodeBlockContext = createContext<TCodeBlockContext>({} as TCodeBlockContext);
export const useCodeBlockContext = () => useContext(CodeBlockContext);

export function CodeBlockProvider({
  children,
  baseIndex = 0,
}: {
  children: ReactNode;
  /**
   * Offset added to every assigned index. When rendering a message as
   * independently memoized blocks, each block gets its own provider seeded with
   * the running count of executable code blocks in earlier blocks, so document-
   * order indices are preserved without a single shared (memoization-fragile)
   * counter.
   */
  baseIndex?: number;
}) {
  const counterRef = useRef(0);

  const getNextIndex = useCallback(
    (skip: boolean) => {
      if (skip) {
        return baseIndex + counterRef.current;
      }
      const nextIndex = counterRef.current;
      counterRef.current += 1;
      return baseIndex + nextIndex;
    },
    [baseIndex],
  );

  const resetCounter = useCallback(() => {
    counterRef.current = 0;
  }, []);

  return (
    <CodeBlockContext.Provider value={{ getNextIndex, resetCounter }}>
      {children}
    </CodeBlockContext.Provider>
  );
}
