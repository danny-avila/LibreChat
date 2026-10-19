const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const STRONG_CHAR =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u3040-\u9FFF\uAC00-\uD7AF]/;

/** Digits, separators and combining marks inside the RTL blocks: neutral or weak, never strong. */
const WEAK_IN_RTL: Array<[number, number]> = [
  [0x0591, 0x05bd],
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x05c7, 0x05c7],
  [0x0600, 0x0605],
  [0x060c, 0x060c],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0660, 0x066c],
  [0x0670, 0x0670],
  [0x06d6, 0x06e4],
  [0x06e7, 0x06ed],
  [0x06f0, 0x06f9],
  [0x0711, 0x0711],
  [0x0730, 0x074a],
  [0x07a6, 0x07b0],
  [0x07eb, 0x07f3],
  [0x0816, 0x082d],
  [0x0859, 0x085b],
  [0x0898, 0x089f],
  [0x08ca, 0x08ff],
  [0xfb1e, 0xfb1e],
];
const isWeakInRtl = (char: string): boolean => {
  const code = char.codePointAt(0) ?? 0;
  return WEAK_IN_RTL.some(([from, to]) => code >= from && code <= to);
};
const NEUTRAL_LATIN = /[\u00D7\u00F7]/;

/**
 * Direction of the first strongly directional character, or null when the text has none.
 * Arabic-Indic digits, Arabic separators and combining marks are skipped, as `dir="auto"` does.
 */
export const strongDirection = (text: string): 'ltr' | 'rtl' | null => {
  for (const char of text) {
    if (!STRONG_CHAR.test(char) || NEUTRAL_LATIN.test(char)) {
      continue;
    }
    if (!RTL_CHAR.test(char)) {
      return 'ltr';
    }
    if (!isWeakInRtl(char)) {
      return 'rtl';
    }
  }
  return null;
};
