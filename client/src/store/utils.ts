import { atom } from 'recoil';

// Improved helper function to create atoms with localStorage
export function atomWithLocalStorage<T>(
  key: string,
  defaultValue: T,
  normalizeSavedValue: (value: T) => T = (value) => value,
) {
  return atom<T>({
    key,
    default: defaultValue,
    effects_UNSTABLE: [
      ({ setSelf, onSet }) => {
        const savedValue = localStorage.getItem(key);
        if (savedValue !== null) {
          try {
            const parsedValue = JSON.parse(savedValue) as T;
            const normalizedValue = normalizeSavedValue(parsedValue);
            if (!Object.is(normalizedValue, parsedValue)) {
              localStorage.setItem(key, JSON.stringify(normalizedValue));
            }
            setSelf(normalizedValue);
          } catch (e) {
            console.error(
              `Error parsing localStorage key "${key}", \`savedValue\`: defaultValue, error:`,
              e,
            );
            localStorage.setItem(key, JSON.stringify(defaultValue));
            setSelf(defaultValue);
          }
        }

        onSet((newValue: T) => {
          localStorage.setItem(key, JSON.stringify(newValue));
        });
      },
    ],
  });
}
