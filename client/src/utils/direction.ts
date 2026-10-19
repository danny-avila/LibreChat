const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const STRONG_CHAR =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u3040-\u9FFF\uAC00-\uD7AF]/;

/** Direction of the first strongly directional character, or null when the text has none. */
export const strongDirection = (text: string): 'ltr' | 'rtl' | null => {
  const match = STRONG_CHAR.exec(text);
  if (match == null) {
    return null;
  }
  return RTL_CHAR.test(match[0]) ? 'rtl' : 'ltr';
};
