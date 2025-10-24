import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { applyFontSize } from '@librechat/client';

const DEFAULT_FONT_SIZE = 'text-base';

/**
 * Base storage atom for font size
 */
const fontSizeStorageAtom = atomWithStorage<string>('fontSize', DEFAULT_FONT_SIZE, undefined, {
  getOnInit: true,
});

/**
 * Derived atom that applies font size changes to the DOM
 * Read: returns the current font size
 * Write: updates storage and applies the font size to the DOM
 */
export const fontSizeAtom = atom(
  (get) => get(fontSizeStorageAtom),
  (get, set, newValue: string) => {
    set(fontSizeStorageAtom, newValue);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      applyFontSize(newValue);
    }
  },
);

/**
 * Initialize font size on app load
 */
export const initializeFontSize = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const savedValue = localStorage.getItem('fontSize');

  if (savedValue !== null) {
    try {
      const parsedValue = JSON.parse(savedValue);
      applyFontSize(parsedValue);
    } catch (error) {
      console.error(
        'Error parsing localStorage key "fontSize", resetting to default. Error:',
        error,
      );
      localStorage.setItem('fontSize', JSON.stringify(DEFAULT_FONT_SIZE));
      applyFontSize(DEFAULT_FONT_SIZE);
    }
  } else {
    applyFontSize(DEFAULT_FONT_SIZE);
  }
};
