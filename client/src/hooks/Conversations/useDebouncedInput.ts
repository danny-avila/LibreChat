import debounce from 'lodash/debounce';
import React, { useState, useCallback, useMemo } from 'react';
import type { SetterOrUpdater } from 'recoil';
import type { TSetOption } from '~/common';
import { defaultDebouncedDelay } from '~/common';

/** A custom hook that accepts a setOption function and an option key (e.g., 'title').
It manages a local state for the option value, a debounced setter function for that value,
and returns the local state value, its setter, and an onChange handler suitable for inputs. */
function useDebouncedInput<T = unknown>({
  setOption,
  setter,
  optionKey,
  initialValue,
  delay = defaultDebouncedDelay,
}: {
  setOption?: TSetOption;
  setter?: SetterOrUpdater<T>;
  optionKey?: string | number;
  initialValue: T;
  delay?: number;
}): [
  (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | T, numeric?: boolean) => void,
  T,
  SetterOrUpdater<T>,
  // (newValue: string) => void,
] {
  const [value, setValue] = useState<T>(initialValue);

  /** A debounced function to call the passed setOption with the optionKey and new value.
   *
  Note: We use useMemo to ensure our debounced function is stable across renders and properly typed. */
  const setDebouncedOption = useMemo(
    () => debounce(setOption && optionKey ? setOption(optionKey) : setter || (() => {}), delay),
    [setOption, optionKey, setter, delay],
  );

  /** An onChange handler that updates the local state and the debounced option */
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | T, numeric?: boolean) => {
      let newValue: T =
        typeof e !== 'object'
          ? e
          : ((e as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>).target
              .value as unknown as T);
      // Handle numeric conversion only if value is not undefined and not empty string
      if (numeric === true && newValue !== undefined && newValue !== '') {
        newValue = Number(newValue) as unknown as T;
      }
      setValue(newValue);
      setDebouncedOption(newValue);
    },
    [setDebouncedOption],
  );
  return [onChange, value, setValue];
}

export default useDebouncedInput;
