const LETTER = /\p{L}/u;
const DIGIT = /\p{Nd}/u;
/** Digits whose bidi class is weak (EN or AN); every other decimal digit is a strong L or R. */
const WEAK_DIGIT =
  /[0-9\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19\u{10D30}-\u{10D39}\u{1D7CE}-\u{1D7FF}]/u;
/** LEFT-TO-RIGHT MARK, and RIGHT-TO-LEFT MARK plus ARABIC LETTER MARK. */
const LTR_MARK = /\u200E/u;
const RTL_MARK = /[\u200F\u061C]/u;
const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

/**
 * Direction of the first strongly directional character, or null when the text has none.
 * Letters, the bidi marks and the digits of scripts with their own numerals (Devanagari,
 * Thai, N'Ko) are strong; European and Arabic-Indic digits, punctuation and combining marks
 * are skipped, as `dir="auto"` does. A strong character is right-to-left when it sits in a
 * Hebrew, Arabic, Syriac, Thaana, N'Ko or other RTL block.
 */
export const strongDirection = (text: string): 'ltr' | 'rtl' | null => {
  for (const char of text) {
    if (LTR_MARK.test(char)) {
      return 'ltr';
    }
    if (RTL_MARK.test(char)) {
      return 'rtl';
    }
    if (LETTER.test(char) || (DIGIT.test(char) && !WEAK_DIGIT.test(char))) {
      return RTL_CHAR.test(char) ? 'rtl' : 'ltr';
    }
  }
  return null;
};
