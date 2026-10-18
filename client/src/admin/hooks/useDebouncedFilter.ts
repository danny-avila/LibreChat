import { useCallback, useEffect, useRef, useState } from 'react';

interface DebouncedFilter {
  readonly value: string;
  readonly debouncedValue: string;
  readonly onChange: (next: string) => void;
}

/** Two-state debounced text filter: `value` mirrors keystrokes for controlled
 * inputs; `debouncedValue` is the value the consumer should feed into the
 * actual filter / query key. `onCommit` fires once per quiescent settle so
 * callers can perform side effects (e.g. resetting pagination). */
export function useDebouncedFilter(
  initial: string,
  onCommit: () => void,
  delay = 300,
): DebouncedFilter {
  const [value, setValue] = useState(initial);
  const [debouncedValue, setDebouncedValue] = useState(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDebouncedValue(next);
        commitRef.current();
      }, delay);
    },
    [delay],
  );

  return { value, debouncedValue, onChange };
}
