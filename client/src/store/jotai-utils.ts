import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/**
 * Create a simple atom with localStorage persistence
 * Uses Jotai's atomWithStorage with getOnInit for proper SSR support
 *
 * @param key - localStorage key
 * @param defaultValue - default value if no saved value exists
 * @returns Jotai atom with localStorage persistence
 */
export function createStorageAtom<T>(key: string, defaultValue: T) {
  return atomWithStorage<T>(key, defaultValue, undefined, {
    getOnInit: true,
  });
}

/**
 * Create an atom with localStorage persistence and side effects
 * Useful when you need to apply changes to the DOM or trigger other actions
 *
 * @param key - localStorage key
 * @param defaultValue - default value if no saved value exists
 * @param onWrite - callback function to run when the value changes
 * @returns Jotai atom with localStorage persistence and side effects
 */
export function createStorageAtomWithEffect<T>(
  key: string,
  defaultValue: T,
  onWrite: (value: T) => void,
) {
  const baseAtom = createStorageAtom(key, defaultValue);

  return atom(
    (get) => get(baseAtom),
    (get, set, newValue: T) => {
      set(baseAtom, newValue);
      if (typeof window !== 'undefined') {
        onWrite(newValue);
      }
    },
  );
}

/**
 * Initialize a value from localStorage and optionally apply it
 * Useful for applying saved values on app startup (e.g., theme, fontSize)
 *
 * @param key - localStorage key
 * @param defaultValue - default value if no saved value exists
 * @param onInit - optional callback to run with the loaded value
 * @returns The loaded value (or default if none exists)
 */
export function initializeFromStorage<T>(
  key: string,
  defaultValue: T,
  onInit?: (value: T) => void,
): T {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaultValue;
  }

  try {
    const savedValue = localStorage.getItem(key);
    const value = savedValue ? (JSON.parse(savedValue) as T) : defaultValue;

    if (onInit) {
      onInit(value);
    }

    return value;
  } catch (error) {
    console.error(`Error initializing ${key} from localStorage, using default. Error:`, error);

    // Reset corrupted value
    try {
      localStorage.setItem(key, JSON.stringify(defaultValue));
    } catch (setError) {
      console.error(`Error resetting corrupted ${key} in localStorage:`, setError);
    }

    if (onInit) {
      onInit(defaultValue);
    }

    return defaultValue;
  }
}
