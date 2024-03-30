import { getTranslations, localize } from './Translation';
import English from './languages/Eng';
import Spanish from './languages/Es';
import French from './languages/Fr';

describe('getTranslations', () => {
  it('should return the correct language object for a valid language code', () => {
    expect(getTranslations('en-US')).toEqual(English);
    expect(getTranslations('fr-FR')).toEqual(French);
  });

  it('should return the correct language object for a language code without region', () => {
    expect(getTranslations('fr')).toEqual(French);
    expect(getTranslations('es')).toEqual(Spanish);
  });

  it('should return the English language object for an invalid language code', () => {
    expect(getTranslations('invalid-code')).toEqual(English);
  });
});

describe('localize', () => {
  it('should return the correct localized phrase for a valid language code and phrase key', () => {
    expect(localize('en-US', 'com_ui_examples')).toBe('Examples');
    expect(localize('fr-FR', 'com_ui_examples')).toBe('Exemples');
  });

  it('should return the English phrase for an invalid language code or phrase key', () => {
    expect(localize('invalid-code', 'com_ui_examples')).toBe('Examples');
    expect(localize('en-US', 'invalid-key')).toBe('');
  });

  it('should correctly format placeholders in the phrase', () => {
    expect(localize('en-US', 'com_endpoint_default_with_num', 'John')).toBe('default: John');
    expect(localize('fr-FR', 'com_endpoint_default_with_num', 'Marie')).toBe('par défaut : Marie');
  });
});
