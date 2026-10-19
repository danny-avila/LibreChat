const LETTER = /\p{L}/u;
const RTL_LETTER =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/**
 * Direction of the first strongly directional character, or null when the text has none.
 * Letters are the strong characters: digits (Arabic-Indic too), punctuation and combining
 * marks are skipped, as `dir="auto"` does, and a letter is right-to-left when it sits in a
 * Hebrew, Arabic, Syriac, Thaana, N'Ko or other RTL block.
 */
export const strongDirection = (text: string): 'ltr' | 'rtl' | null => {
  for (const char of text) {
    if (LETTER.test(char)) {
      return RTL_LETTER.test(char) ? 'rtl' : 'ltr';
    }
  }
  return null;
};
