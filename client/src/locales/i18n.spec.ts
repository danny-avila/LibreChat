import { languageOptions, toSelectorLocale } from './i18n';

describe('toSelectorLocale', () => {
  it('maps a canonical locale to the selector value with a region variant', () => {
    expect(toSelectorLocale('de')).toBe('de-DE');
    expect(toSelectorLocale('en')).toBe('en-US');
    expect(toSelectorLocale('ja')).toBe('ja-JP');
  });

  it('keeps a value that is already selector-conform', () => {
    expect(toSelectorLocale('de-DE')).toBe('de-DE');
    expect(toSelectorLocale('pt-BR')).toBe('pt-BR');
  });

  it('resolves an alias to its selector value', () => {
    expect(toSelectorLocale('de-de')).toBe('de-DE');
    expect(toSelectorLocale('zh')).toBe('zh-Hans');
  });

  it('falls back to the canonical when the selector offers no region variant', () => {
    expect(toSelectorLocale('bs')).toBe('bs');
    expect(toSelectorLocale('nb')).toBe('nb');
  });

  it("passes 'auto' through unchanged", () => {
    expect(toSelectorLocale('auto')).toBe('auto');
  });

  it('is stable for every selector option value', () => {
    for (const { value } of languageOptions) {
      if (value === 'auto') {
        continue;
      }
      expect(toSelectorLocale(value)).toBe(value);
    }
  });
});

describe('languageOptions', () => {
  it('offers auto first and unique values including de-DE', () => {
    expect(languageOptions[0].value).toBe('auto');
    expect(languageOptions.map((o) => o.value)).toContain('de-DE');
    const values = languageOptions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
