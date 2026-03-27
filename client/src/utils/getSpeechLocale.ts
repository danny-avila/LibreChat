/** Maps UI language codes to their best matching STT locale. */
const LANG_TO_STT: Record<string, string> = {
  'ar-MA': 'ar-MA',
  ar: 'ar-MA',
  fr: 'fr-FR',
  en: 'en-US',
  he: 'he',
  fa: 'fa',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  ja: 'ja',
  ko: 'ko',
  nl: 'nl-NL',
  pl: 'pl',
  pt: 'pt-PT',
  ru: 'ru',
  tr: 'tr',
  zh: 'zh-CN',
};

export const getSpeechLocale = (langcode: string): string =>
  LANG_TO_STT[langcode] ?? LANG_TO_STT[langcode.split('-')[0].toLowerCase()] ?? langcode;
