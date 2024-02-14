import debounce from 'lodash/debounce';
import { useState, useCallback } from 'react';
import type { TSetOption } from '~/common';

/** A custom hook that accepts a setOption function and an option key (e.g., 'title').
It manages a local state for the option value, a debounced setter function for that value,
and returns the local state value, its setter, and an onChange handler suitable for inputs. */
function useDebouncedInput(
  setOption: TSetOption,
  optionKey: string | number,
  initialValue: unknown,
  delay = 450,
): [
  React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>,
  unknown,
  React.Dispatch<React.SetStateAction<unknown>>,
] {
  const [value, setValue] = useState(initialValue);

  /** A debounced function to call the passed setOption with the optionKey and new value.
   *
  Note: We use useCallback to ensure our debounced function is stable across renders. */
  const setDebouncedOption = useCallback(debounce(setOption(optionKey), delay), []);

  /** An onChange handler that updates the local state and the debounced option */
  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const newValue = e.target.value;
    setValue(newValue);
    setDebouncedOption(newValue);
  };

  return [onChange, value, setValue];
}

export default useDebouncedInput;
