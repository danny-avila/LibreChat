import English from './languages/Eng';
import Chinese from './languages/Zh';
import German from './languages/De';
import Italian from './languages/It';
import Polish from './languages/Pl';
import Portuguese from './languages/Br';
import Spanish from './languages/Es';
import French from './languages/Fr';
import Russian from './languages/Ru';
import Japanese from './languages/Jp';
// === import additional language files here === //

// New method on String allow using "{\d}" placeholder for
// loading value dynamically.
declare global {
  interface String {
    format(...replacements: string[]): string;
  }
}

if (!String.prototype.format) {
  String.prototype.format = function (...args: string[]) {
    return this.replace(/{(\d+)}/g, function (match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}

// input: language code in string
// returns an object of translated strings in the language
export const getTranslations = (langCode: string) => {
  if (langCode === 'en-US') {
    return English;
  }
  if (langCode === 'zh-CN') {
    return Chinese;
  }
  if (langCode === 'de-DE') {
    return German;
  }
  if (langCode === 'es-ES') {
    return Spanish;
  }
  if (langCode === 'fr-FR') {
    return French;
  }
  if (langCode === 'it-IT') {
    return Italian;
  }
  if (langCode === 'pl-PL') {
    return Polish;
  }
  if (langCode === 'pt-BR') {
    return Portuguese;
  }
  if (langCode === 'ru-RU') {
    return Russian;
  }
  if (langCode === 'ja-JP') {
    return Japanese;
  }

  // === add conditionals here for additional languages here === //
  return English; // default to English
};

// input: language code in string & phrase key in string
// returns an corresponding phrase value in string
export const localize = (langCode: string, phraseKey: string, ...values: string[]) => {
  const lang = getTranslations(langCode);
  if (phraseKey in lang) {
    return lang[phraseKey].format(...values);
  }

  if (phraseKey in English) {
    // Fall back logic to cover untranslated phrases
    return English[phraseKey].format(...values);
  }

  // In case the key is not defined, return empty instead of throw errors.
  return '';
};
