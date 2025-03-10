import terms_en from '../../../terms/terms_en.md?raw';
import terms_de from '../../../terms/terms_de.md?raw';
import terms_fr from '../../../terms/terms_fr.md?raw';

/**
 * A mapping of language codes to their respective terms markdown content.
 *
 * You can add both base language codes (e.g. 'en') and full codes (e.g. 'pt-BR') if needed.
 *
 * @type {Record<string, string>}
 */
const markdownMap: Record<string, string> = {
  en: terms_en,
  de: terms_de,
  fr: terms_fr,
  // For example, to support Brazilian Portuguese, you could add:
  // 'pt-BR': terms_ptBR,
};

/**
 * Retrieves the terms markdown content for the specified language.
 *
 * The function first checks if an exact language code match exists in the markdown map.
 * If not, it attempts to extract the base language (e.g., 'pt' from 'pt-BR') and checks again.
 * If no match is found, it falls back to English.
 *
 * @param {string} lang - The language code, which may include a region (e.g., 'pt-BR', 'en-US').
 * @returns {string} The markdown content corresponding to the language,
 *                   or the English version if no matching language is found.
 */
export function getTermsMarkdown(lang: string): string {
  // Check for exact language code match (e.g., 'pt-BR').
  if (lang in markdownMap) {
    return markdownMap[lang];
  }

  // Extract the base language (e.g., 'pt' from 'pt-BR') and check again.
  const baseLang = lang.split('-')[0];
  if (baseLang in markdownMap) {
    return markdownMap[baseLang];
  }

  // Fall back to English if no match is found.
  return markdownMap['en'];
}
