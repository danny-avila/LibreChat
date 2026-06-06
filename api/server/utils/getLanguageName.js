const languageMap = {
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
 * @param {ServerRequest} req - The Express request object.
 * @returns {string} The full English name of the language (e.g. "Spanish"), or the code if not mapped.
 */
function getLanguageName(req) {
  if (!req) {
    return 'English';
  }
  const langCode = req.cookies?.lang || req.headers?.['accept-language']?.split(',')[0];
  if (!langCode) {
    return 'English';
  }
  const cleanCode = langCode.toLowerCase().trim();
  if (languageMap[cleanCode]) {
    return languageMap[cleanCode];
  }
  const baseCode = cleanCode.split('-')[0];
  if (languageMap[baseCode]) {
    return languageMap[baseCode];
  }
  return langCode;
}

module.exports = getLanguageName;
