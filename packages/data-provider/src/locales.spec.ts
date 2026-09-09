import { isSupportedLocale } from './locales';

describe('isSupportedLocale', () => {
  it('accepts a canonical supported locale', () => {
    expect(isSupportedLocale('de')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('pt-BR')).toBe(true);
  });

  it('accepts selector-conform BCP-47 values and known aliases', () => {
    expect(isSupportedLocale('de-DE')).toBe(true);
    expect(isSupportedLocale('en-US')).toBe(true);
    expect(isSupportedLocale('zh-TW')).toBe(true);
  });

  it("accepts 'auto'", () => {
    expect(isSupportedLocale('auto')).toBe(true);
  });

  it('accepts an unknown region on a supported base tag', () => {
    expect(isSupportedLocale('de-AT')).toBe(true);
  });

  it('rejects clearly invalid values', () => {
    expect(isSupportedLocale('xx')).toBe(false);
    expect(isSupportedLocale('klingon')).toBe(false);
    expect(isSupportedLocale('')).toBe(false);
  });
});
