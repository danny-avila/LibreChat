import { createLinkTo } from './createLinkTo';

describe('createLinkTo', () => {
  describe('our domains', () => {
    it('returns a relative path object for localhost', () => {
      expect(createLinkTo('http://localhost:3080/some/path')).toEqual({
        pathname: '/some/path',
        search: '',
        hash: '',
      });
    });

    it('returns a relative path object for dev domain', () => {
      expect(createLinkTo('https://dev.ai-assistant.nj.gov/some/path')).toEqual({
        pathname: '/some/path',
        search: '',
        hash: '',
      });
    });

    it('returns a relative path object for prod domain', () => {
      expect(createLinkTo('https://ai-assistant.nj.gov/some/path')).toEqual({
        pathname: '/some/path',
        search: '',
        hash: '',
      });
    });

    it('preserves search params', () => {
      expect(createLinkTo('https://ai-assistant.nj.gov/path?foo=bar')).toEqual({
        pathname: '/path',
        search: '?foo=bar',
        hash: '',
      });
    });

    it('preserves hash', () => {
      expect(createLinkTo('https://ai-assistant.nj.gov/path#section')).toEqual({
        pathname: '/path',
        search: '',
        hash: '#section',
      });
    });
  });

  describe('external URLs', () => {
    it('returns the URL unchanged for an external site', () => {
      expect(createLinkTo('https://example.com/page')).toBe('https://example.com/page');
    });

    it('returns the URL unchanged for a similar-looking domain', () => {
      expect(createLinkTo('https://evil.ai-assistant.nj.gov/path')).toBe(
        'https://evil.ai-assistant.nj.gov/path',
      );
    });
  });

  describe('relative URLs', () => {
    it('returns already-relative URLs unchanged', () => {
      expect(createLinkTo('/some/path')).toBe('/some/path');
    });
  });
});
