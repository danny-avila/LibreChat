import i18n from './i18n';
import English from './en/translation.json';
import PortugueseBR from './pt-BR/translation.json';
import { TranslationKeys } from '~/hooks';

// Bizu only ships EN (fallback) and PT-BR. Other locales were removed.
describe('i18next translation tests', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init();
    }
  });

  it('should return the correct translation for a valid key in English', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('com_ui_examples')).toBe(English.com_ui_examples);
  });

  it('should return the correct translation for a valid key in PT-BR', () => {
    i18n.changeLanguage('pt-BR');
    expect(i18n.t('com_ui_examples')).toBe(PortugueseBR.com_ui_examples);
  });

  it('should fallback to English for an invalid language code', () => {
    i18n.changeLanguage('invalid-code');
    expect(i18n.t('com_ui_examples')).toBe(English.com_ui_examples);
  });

  it('should return the key itself for an invalid key', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('invalid-key' as TranslationKeys)).toBe('invalid-key');
  });

  it('should correctly format placeholders in the translation', () => {
    i18n.changeLanguage('en');
    expect(i18n.t('com_endpoint_default_with_num', { 0: 'John' })).toBe('default: John');

    i18n.changeLanguage('pt-BR');
    expect(i18n.t('com_endpoint_default_with_num', { 0: 'Maria' })).toBe('padrão: Maria');
  });
});
