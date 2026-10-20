import { strongDirection } from '../direction';

describe('strongDirection', () => {
  it('resolves Arabic and Hebrew letters to rtl', () => {
    expect(strongDirection('مرحبا hello')).toBe('rtl');
    expect(strongDirection('שלום hello')).toBe('rtl');
  });

  it('resolves Latin letters to ltr', () => {
    expect(strongDirection('hello مرحبا')).toBe('ltr');
  });

  it('treats Devanagari and Thai letters as strong ltr characters', () => {
    expect(strongDirection('नाम مرحبا')).toBe('ltr');
    expect(strongDirection('สวัสดี שלום')).toBe('ltr');
  });

  it('skips digits and punctuation before the first letter', () => {
    expect(strongDirection('1. ١٢ (مرحبا)')).toBe('rtl');
    expect(strongDirection('42 - • hello')).toBe('ltr');
  });

  it('returns null when the text has only digits and punctuation', () => {
    expect(strongDirection('123 ١٢ × ...')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(strongDirection('')).toBeNull();
  });
});
