import English from './languages/Eng';
import Chinese from './languages/Zh';
import Italy from './languages/It';
// === import additional language files here === //

// New method on String allow using "{\d}" placeholder for
// loading value dynamically.
interface String {
  format(...replacements: string[]): string;
}

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

// input: language code in string
// returns an object of translated strings in the language
export const getTranslations = (langCode: string) => {
  if (langCode === 'en') {
    return English;
  }
  if (langCode === 'cn') {
    return Chinese;
  }
  if (langCode === 'it') {
    return Italy;
  }
  // === add conditionals here for additional languages here === //
  return English; // default to English
};

// input: language code in string & phrase key in string
// returns an corresponding phrase value in string
export const localize = (langCode: string, phraseKey: string, ...values: string[]) => {
  const lang = getTranslations(langCode);
  if (phraseKey in lang)
    return lang[phraseKey].format(...values);
  
  // Fall back logic to cover untranslated phrases
  return English[phraseKey].format(...values);
};
