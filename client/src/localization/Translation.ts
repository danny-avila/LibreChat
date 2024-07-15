import English from './languages/Eng';
import Arabic from './languages/Ar';
import Chinese from './languages/Zh';
import German from './languages/De';
import Italian from './languages/It';
import Polish from './languages/Pl';
import Portuguese from './languages/Br';
import Spanish from './languages/Es';
import French from './languages/Fr';
import Russian from './languages/Ru';
import Japanese from './languages/Jp';
import Swedish from './languages/Sv';
import Korean from './languages/Ko';
import TraditionalChinese from './languages/ZhTraditional';
import Vietnamese from './languages/Vi';
import Turkish from './languages/Tr';
import Dutch from './languages/Nl';
import Indonesia from './languages/Id';
import Hebrew from './languages/He';

// === import additional language files here === //

type Language = Record<string, string>;

const languageMap: Record<string, Language> = {
  'en-US': English,
  'ar-EG': Arabic,
  'zh-CN': Chinese,
  'de-DE': German,
  'es-ES': Spanish,
  'fr-FR': French,
  'it-IT': Italian,
  'pl-PL': Polish,
  'pt-BR': Portuguese,
  'ru-RU': Russian,
  'ja-JP': Japanese,
  'sv-SE': Swedish,
  'ko-KR': Korean,
  'zh-TC': TraditionalChinese,
  'vi-VN': Vietnamese,
  'tr-TR': Turkish,
  'nl-NL': Dutch,
  'id-ID': Indonesia,
  'he-HE': Hebrew,
  // Add additional language mappings here
};

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
      return typeof args[number] !== 'undefined' ? args[number] : match;
    });
  };
}

// input: language code in string
// returns an object of translated strings in the language
export const getTranslations = (langCode: string): Language => {
  if (languageMap[langCode]) {
    return languageMap[langCode];
  }

  const [langPart] = langCode.split('-');

  const matchingLangCode = Object.keys(languageMap).find((key) => key.startsWith(langPart));

  if (matchingLangCode) {
    return languageMap[matchingLangCode];
  }

  return English;
};

// input: language code in string & phrase key in string
// returns an corresponding phrase value in string
export const localize = (langCode: string, phraseKey: string, ...values: string[]) => {
  const lang = getTranslations(langCode);
  const phrase = lang[phraseKey] || English[phraseKey] || '';

  return phrase.format(...values);
};
