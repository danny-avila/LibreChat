import { sanitizeMcpIconPath } from './icons';

/** Decode the percent-encoded SVG body `sanitizeMcpIconPath` re-emits. */
function decode(dataUri: string): string {
  return decodeURIComponent(dataUri.replace(/^data:image\/svg\+xml,/, ''));
}

describe('sanitizeMcpIconPath', () => {
  it('passes through non-SVG values untouched', () => {
    for (const value of [
      'https://example.com/icon.png',
      '/assets/icon.png',
      'data:image/png;base64,abc123',
      '',
    ]) {
      expect(sanitizeMcpIconPath(value)).toBe(value);
    }
  });

  it('strips scripts and event handlers from a percent-encoded SVG data URI', () => {
    const raw = '<svg onload="alert(1)"><script>alert(2)</script><path d="M0 0h1v1H0z"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('path');
  });

  it('strips active content from a base64-encoded SVG data URI (client bypass)', () => {
    const raw =
      '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject><circle r="5"/></svg>';
    const input = `data:image/svg+xml;base64,${Buffer.from(raw, 'utf-8').toString('base64')}`;
    const clean = decode(sanitizeMcpIconPath(input)).toLowerCase();
    expect(clean).not.toContain('foreignobject');
    expect(clean).not.toContain('iframe');
    expect(clean).toContain('circle');
  });

  it('drops external references that would let an SVG phone home', () => {
    const raw =
      '<svg><image href="https://evil.example/track.png"/><use href="https://evil.example/x.svg#a"/><path d="M0 0h1v1H0z"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).not.toContain('evil.example');
    expect(clean).toContain('path');
  });

  it('strips relative-path and javascript: hrefs from <use>', () => {
    for (const href of ['icons.svg#a', '//evil.example/x.svg#a', 'javascript:alert(1)']) {
      const input = `data:image/svg+xml,${encodeURIComponent(`<svg><use href="${href}"/></svg>`)}`;
      expect(decode(sanitizeMcpIconPath(input))).not.toContain('href');
    }
  });

  it('preserves local <defs>/<use> references', () => {
    const raw = '<svg><defs><path id="p" d="M0 0h10v10H0z"/></defs><use href="#p"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).toContain('<use href="#p"');
    expect(clean).toContain('d="M0 0h10v10H0z"');
  });

  it('preserves local xlink:href references and gradient inheritance', () => {
    const raw =
      '<svg><defs><path id="p" d="M0 0h1v1z"/></defs><use xlink:href="#p"/><linearGradient id="g2" href="#g" x1="0" x2="1"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).toContain('xlink:href="#p"');
    expect(clean).toContain('href="#g"');
    expect(clean).toContain('x1="0"');
  });

  it('preserves case-sensitive SVG names and multi-color paint', () => {
    const raw =
      '<svg viewBox="0 0 24 24"><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient><path d="M0 0h24v24H0z" fill="url(#g)"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).toContain('viewBox');
    expect(clean).toContain('linearGradient');
    expect(clean).toContain('fill="url(#g)"');
  });

  it('returns an empty string for a malformed SVG data URI', () => {
    expect(sanitizeMcpIconPath('data:image/svg+xml')).toBe('');
  });
});
