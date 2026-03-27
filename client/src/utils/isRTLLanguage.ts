const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ug', 'ur', 'yi', 'dv', 'ps']);

export const isRTLLanguage = (langcode: string): boolean => {
  const base = langcode.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(base);
};
