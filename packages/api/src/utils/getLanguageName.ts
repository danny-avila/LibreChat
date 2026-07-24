import type { Request } from 'express';

const languageMap: Record<string, string> = {
  en: 'English',
  'en-us': 'English',
  'zh-hans': 'Chinese (Simplified)',
  'zh-cn': 'Chinese (Simplified)',
  'zh-hant': 'Chinese (Traditional)',
  'zh-tw': 'Chinese (Traditional)',
  'zh-hk': 'Chinese (Traditional)',
  ar: 'Arabic',
  'ar-eg': 'Arabic',
  bs: 'Bosnian',
  ca: 'Catalan',
  'ca-es': 'Catalan',
  cs: 'Czech',
  'cs-cz': 'Czech',
  da: 'Danish',
  'da-dk': 'Danish',
  de: 'German',
  'de-de': 'German',
  el: 'Greek',
  es: 'Spanish',
  'es-es': 'Spanish',
  et: 'Estonian',
  'et-ee': 'Estonian',
  fa: 'Persian',
  'fa-ir': 'Persian',
  fi: 'Finnish',
  'fi-fi': 'Finnish',
  fr: 'French',
  'fr-fr': 'French',
  he: 'Hebrew',
  'he-he': 'Hebrew',
  hu: 'Hungarian',
  'hu-hu': 'Hungarian',
  hy: 'Armenian',
  'hy-am': 'Armenian',
  id: 'Indonesian',
  'id-id': 'Indonesian',
  is: 'Icelandic',
  it: 'Italian',
  'it-it': 'Italian',
  ja: 'Japanese',
  'ja-jp': 'Japanese',
  ka: 'Georgian',
  'ka-ge': 'Georgian',
  ko: 'Korean',
  'ko-kr': 'Korean',
  lt: 'Lithuanian',
  'lt-lt': 'Lithuanian',
  lv: 'Latvian',
  'lv-lv': 'Latvian',
  nb: 'Norwegian Bokmål',
  nl: 'Dutch',
  'nl-nl': 'Dutch',
  nn: 'Norwegian Nynorsk',
  pl: 'Polish',
  'pl-pl': 'Polish',
  pt: 'Portuguese',
  'pt-br': 'Portuguese (Brazil)',
  'pt-pt': 'Portuguese (Portugal)',
  ru: 'Russian',
  'ru-ru': 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sv: 'Swedish',
  'sv-se': 'Swedish',
  th: 'Thai',
  'th-th': 'Thai',
  tr: 'Turkish',
  'tr-tr': 'Turkish',
  ug: 'Uyghur',
  uk: 'Ukrainian',
  'uk-ua': 'Ukrainian',
  vi: 'Vietnamese',
  'vi-vn': 'Vietnamese',
  bo: 'Tibetan',
};

/**
 * Extracts the user language from the request cookies or Accept-Language headers,
 * and maps it to a human-readable language name.
 *
 * @param {Request} req - The Express request object.
 * @returns {string} The full English name of the language (e.g. "Spanish"), defaulting to "English".
 */
export function getLanguageName(req?: Request): string {
  if (!req) {
    return 'English';
  }

  // 1. Check lang cookie first
  const langCookie = req.cookies?.lang;
  if (langCookie) {
    const cleanCookie = langCookie.toLowerCase().trim();
    if (languageMap[cleanCookie]) {
      return languageMap[cleanCookie];
    }
    const baseCookie = cleanCookie.split('-')[0];
    if (languageMap[baseCookie]) {
      return languageMap[baseCookie];
    }
  }

  // 2. Parse Accept-Language header
  const acceptLanguage = req.headers?.['accept-language'];
  if (acceptLanguage) {
    const languages = acceptLanguage.split(',');
    for (const lang of languages) {
      // Strip quality weight (e.g. "en-US;q=0.9" -> "en-US")
      const cleanLang = lang.split(';')[0].toLowerCase().trim();
      if (languageMap[cleanLang]) {
        return languageMap[cleanLang];
      }
      const baseLang = cleanLang.split('-')[0];
      if (languageMap[baseLang]) {
        return languageMap[baseLang];
      }
    }
  }

  return 'English';
}
