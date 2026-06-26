import { Request } from 'express';
import { getLanguageName } from '../getLanguageName';

describe('getLanguageName', () => {
  it('should return English if no request object is provided', () => {
    expect(getLanguageName()).toBe('English');
  });

  it('should return English if request has no cookies or headers', () => {
    const req = {} as Request;
    expect(getLanguageName(req)).toBe('English');
  });

  describe('lang cookie', () => {
    it('should resolve language from exact cookie match', () => {
      const req = {
        cookies: { lang: 'zh-Hans' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('Chinese (Simplified)');
    });

    it('should resolve language from case-insensitive cookie match', () => {
      const req = {
        cookies: { lang: 'ES-ES' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('Spanish');
    });

    it('should resolve language from base cookie match', () => {
      const req = {
        cookies: { lang: 'fr-CA' },
      } as unknown as Request;
      // fr-CA should split to fr and match French
      expect(getLanguageName(req)).toBe('French');
    });

    it('should ignore unmapped cookies and fall back to headers or English', () => {
      const req = {
        cookies: { lang: 'unsupported-locale' },
        headers: { 'accept-language': 'es-ES' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('Spanish');
    });
  });

  describe('accept-language header', () => {
    it('should resolve language from exact header match without quality weight', () => {
      const req = {
        headers: { 'accept-language': 'de-DE' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('German');
    });

    it('should resolve language from base header match', () => {
      const req = {
        headers: { 'accept-language': 'de-CH' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('German');
    });

    it('should strip quality weights and match specific locale', () => {
      const req = {
        headers: { 'accept-language': 'pt-BR;q=0.9,pt-PT;q=0.8' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('Portuguese (Brazil)');
    });

    it('should strip quality weights and match base locale', () => {
      const req = {
        headers: { 'accept-language': 'pt-XX;q=0.9' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('Portuguese');
    });

    it('should scan through the languages and pick the first supported locale when the first is unsupported', () => {
      const req = {
        headers: { 'accept-language': 'ro-RO,es-ES;q=0.9,en-US;q=0.8' },
      } as unknown as Request;
      // ro-RO is unsupported, so it should scan and match es-ES -> Spanish
      expect(getLanguageName(req)).toBe('Spanish');
    });

    it('should fall back to English if no accepted language matches', () => {
      const req = {
        headers: { 'accept-language': 'ro-RO,xy-ZZ;q=0.9' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('English');
    });
  });

  describe('precedence', () => {
    it('should prioritize cookie over accept-language header', () => {
      const req = {
        cookies: { lang: 'fr' },
        headers: { 'accept-language': 'es-ES' },
      } as unknown as Request;
      expect(getLanguageName(req)).toBe('French');
    });
  });
});
