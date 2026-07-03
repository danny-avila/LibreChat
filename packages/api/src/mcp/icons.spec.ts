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

  it('keeps the xmlns:xlink declaration that binds preserved xlink:href prefixes', () => {
    const raw =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><path id="p" d="M0 0h1v1z"/></defs><use xlink:href="#p"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(clean).toContain('xlink:href="#p"');
  });

  it('preserves safe filter effects the client sanitizer allows', () => {
    const raw =
      '<svg><filter id="f"><feDropShadow dx="1" dy="1" stdDeviation="0.5" flood-color="#000" flood-opacity="0.4"/><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/><feOffset in="b" dx="2" dy="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><rect width="10" height="10" filter="url(#f)"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).toContain('feDropShadow');
    expect(clean).toContain('feGaussianBlur');
    expect(clean).toContain('stdDeviation="2"');
    expect(clean).toContain('flood-color="#000"');
    expect(clean).toContain('filter="url(#f)"');
  });

  it('strips external feImage references inside filters', () => {
    const raw =
      '<svg><filter id="f"><feImage href="https://evil.example/x.png"/></filter><rect filter="url(#f)"/></svg>';
    const input = `data:image/svg+xml,${encodeURIComponent(raw)}`;
    const clean = decode(sanitizeMcpIconPath(input));
    expect(clean).not.toContain('evil.example');
  });

  it('preserves internal stylesheet paint rules', () => {
    const raw =
      '<svg><style>.red{fill:#e00}.blue{fill:#00f}</style><path class="red" d="M0 0h1v1z"/><path class="blue" d="M1 1h1v1z"/></svg>';
    const clean = decode(sanitizeMcpIconPath(`data:image/svg+xml,${encodeURIComponent(raw)}`));
    expect(clean).toContain('<style');
    expect(clean).toContain('.red{fill:#e00}');
    expect(clean).toContain('.blue{fill:#00f}');
    expect(clean).toContain('class="red"');
  });

  it('scrubs @import and external url() from internal stylesheets', () => {
    const raw =
      '<svg><style>@import url(https://evil.example/x.css);.a{fill:url(https://evil.example/beacon)}.b{fill:url(#grad)}</style><rect class="a"/></svg>';
    const clean = decode(sanitizeMcpIconPath(`data:image/svg+xml,${encodeURIComponent(raw)}`));
    expect(clean).toContain('<style');
    expect(clean).not.toContain('evil.example');
    expect(clean).not.toContain('@import');
    expect(clean).toContain('url(#grad)');
  });

  it('strips a script smuggled after a premature </style> close', () => {
    const raw = '<svg><style>.a{}</style><script>alert(1)</script></svg>';
    const clean = decode(sanitizeMcpIconPath(`data:image/svg+xml,${encodeURIComponent(raw)}`));
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)');
  });

  it('strips external url() references from presentation and style attributes', () => {
    for (const attr of [
      'filter="url(https://evil.example/f.svg#f)"',
      'fill="url(https://evil.example/p)"',
      'style="fill:url(//evil.example/p)"',
      'clip-path="url(data:image/svg+xml,evil)"',
    ]) {
      const raw = `<svg><rect ${attr} width="10" height="10"/></svg>`;
      const clean = decode(sanitizeMcpIconPath(`data:image/svg+xml,${encodeURIComponent(raw)}`));
      expect(clean).not.toContain('evil');
    }
  });

  it('preserves local url() paint and filter references', () => {
    const raw =
      '<svg><defs><filter id="f"><feGaussianBlur stdDeviation="1"/></filter><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect fill="url(#g)" filter="url(#f)" width="10" height="10"/></svg>';
    const clean = decode(sanitizeMcpIconPath(`data:image/svg+xml,${encodeURIComponent(raw)}`));
    expect(clean).toContain('fill="url(#g)"');
    expect(clean).toContain('filter="url(#f)"');
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

  it('sanitizes an SVG data URI hidden behind leading whitespace or controls', () => {
    const evil = '<svg><image href="https://evil.example/x.png"/><path d="M0 0h1v1z"/></svg>';
    const body = `data:image/svg+xml,${encodeURIComponent(evil)}`;
    for (const prefix of ['\n ', '\t', ' \r\n', ' ', '   ']) {
      const clean = decode(sanitizeMcpIconPath(prefix + body));
      expect(clean).not.toContain('evil.example');
      expect(clean).toContain('path');
    }
  });

  it('sanitizes an SVG data URI whose media type hides an embedded newline', () => {
    const evil = '<svg><image href="https://evil.example/x.png"/></svg>';
    const input = `data:image/svg+x\nml,${encodeURIComponent(evil)}`;
    expect(decode(sanitizeMcpIconPath(input))).not.toContain('evil.example');
  });

  it('returns an empty string for a malformed SVG data URI', () => {
    expect(sanitizeMcpIconPath('data:image/svg+xml')).toBe('');
  });
});
