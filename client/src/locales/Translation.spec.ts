import i18n from './i18n';
import English from './en/translation.json';
import French from './fr/translation.json';
import Spanish from './es/translation.json';
import { TranslationKeys } from '~/hooks';

describe('i18next translation tests', () => {
  // Ensure i18next is initialized before any tests run
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init();
    }
  });

  it('should return the correct translation for a valid key in English', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('com_ui_examples')).toBe(English.com_ui_examples);
  });

  it('should return the correct translation for a valid key in French', () => {
    i18n.changeLanguage('fr');
    expect(i18n.t('com_ui_examples')).toBe(French.com_ui_examples);
  });

  it('should return the correct translation for a valid key in Spanish', () => {
    i18n.changeLanguage('es');
    expect(i18n.t('com_ui_examples')).toBe(Spanish.com_ui_examples);
  });

  it('should fallback to English for an invalid language code', () => {
    // When an invalid language is provided, i18next should fallback to English
    i18n.changeLanguage('invalid-code');
    expect(i18n.t('com_ui_examples')).toBe(English.com_ui_examples);
  });

  it('should return the key itself for an invalid key', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('invalid-key' as TranslationKeys)).toBe('invalid-key'); // Returns the key itself
  });

  it('should correctly format placeholders in the translation', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('com_endpoint_default_with_num', { 0: 'John' })).toBe('default: John');

    i18n.changeLanguage('fr');
    expect(i18n.t('com_endpoint_default_with_num', { 0: 'Marie' })).toBe('par défaut : Marie');
  });
});
