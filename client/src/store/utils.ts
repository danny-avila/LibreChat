import { atom } from 'recoil';

// Improved helper function to create atoms with localStorage
export function atomWithLocalStorage<T>(key: string, defaultValue: T) {
  return atom<T>({
    key,
    default: defaultValue,
    effects_UNSTABLE: [
      ({ setSelf, onSet }) => {
        // Ensure we're in a browser environment
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
          return;
        }

        const savedValue = localStorage.getItem(key);
        if (savedValue !== null) {
          try {
            const parsedValue = JSON.parse(savedValue);
            setSelf(parsedValue);
          } catch (e) {
            console.error(
              `Error parsing localStorage key "${key}", savedValue: ${savedValue}, using defaultValue, error:`,
              e,
            );
            localStorage.setItem(key, JSON.stringify(defaultValue));
            setSelf(defaultValue);
          }
        }

        onSet((newValue: T) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(newValue));
          }
        });
      },
    ],
  });
}
