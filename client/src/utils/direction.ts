/** Letters, letter numbers (Roman numerals) and spacing marks have bidi class L outside RTL blocks. */
const LTR_STRONG = /[\p{L}\p{Nl}\p{Mc}]/u;
const DIGIT = /\p{Nd}/u;
const MARK = /\p{M}/u;
/** Digits whose bidi class is weak (EN or AN); every other decimal digit is a strong L or R. */
const WEAK_DIGIT =
  /[0-9\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19\u{10D30}-\u{10D39}\u{1D7CE}-\u{1D7FF}]/u;
/** LEFT-TO-RIGHT MARK, and RIGHT-TO-LEFT MARK plus ARABIC LETTER MARK. */
const LTR_MARK = /\u200E/u;
const RTL_MARK = /[\u200F\u061C]/u;
const RTL_BLOCK =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
/** Code points inside RTL blocks whose bidi class is weak or neutral (AN, EN, ET, CS, ON, BN). */
const RTL_BLOCK_WEAK =
  /[\u0600-\u0607\u0609\u060A\u060C\u060E\u060F\u0660-\u066C\u06DD\u06DE\u06E9\u06F0-\u06F9\u07F6-\u07F9\u0890\u0891\u08E2\uFD3E\uFD3F\uFEFF\u{10D30}-\u{10D39}\u{10E60}-\u{10E7E}]/u;

/**
 * Direction of the first strongly directional character, or null when the text has none.
 * Approximates the bidi classes `dir="auto"` reads (L, R and AL) by block and category:
 * inside a Hebrew, Arabic, Syriac, Thaana, N'Ko or other RTL block every character is
 * strong except combining marks and the listed weak and neutral ones (Arabic-Indic digits,
 * separators, ornate parentheses); elsewhere letters, letter numbers, spacing marks and the
 * digits of scripts with their own numerals (Devanagari, Thai) are strong left-to-right.
 */
export const strongDirection = (text: string): 'ltr' | 'rtl' | null => {
  for (const char of text) {
    if (LTR_MARK.test(char)) {
      return 'ltr';
    }
    if (RTL_MARK.test(char)) {
      return 'rtl';
    }
    if (RTL_BLOCK.test(char)) {
      if (!MARK.test(char) && !RTL_BLOCK_WEAK.test(char)) {
        return 'rtl';
      }
      continue;
    }
    if (LTR_STRONG.test(char) || (DIGIT.test(char) && !WEAK_DIGIT.test(char))) {
      return 'ltr';
    }
  }
  return null;
};
