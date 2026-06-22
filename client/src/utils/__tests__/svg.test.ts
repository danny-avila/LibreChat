import { isMonochromeSvg, sanitizeSvg } from '../svg';

describe('isMonochromeSvg', () => {
  describe('monochrome icons (tinted to currentColor)', () => {
    it('treats an SVG with no explicit colors as monochrome (default black fill)', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats a black fill as monochrome', () => {
      const svg = '<svg><path fill="#000000" d="M0 0h10v10H0z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats shorthand black hex as monochrome', () => {
      const svg = '<svg><path fill="#000" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats one grayscale tone written several ways as monochrome', () => {
      const svg =
        '<svg><path fill="#333" /><path stroke="#333333" /><path style="fill: rgb(51, 51, 51)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats a single named grayscale color as monochrome', () => {
      const svg = '<svg><path fill="black" /><path stroke="black" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats grayscale rgb() as monochrome', () => {
      const svg = '<svg><path style="fill: rgb(50, 50, 50)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats grayscale hsl() (zero saturation) as monochrome', () => {
      const svg = '<svg><path style="fill: hsl(0, 0%, 20%)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores none/transparent and currentColor', () => {
      const svg =
        '<svg><path fill="none" stroke="currentColor" /><rect fill="transparent" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('handles a single color defined inside a style block', () => {
      const svg = '<svg><style>.a{fill:#222}.b{stroke:#222}</style><path class="a" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });
  });

  describe('multiple grayscale tones (conservatively preserved)', () => {
    it('preserves an SVG with two grayscale shades', () => {
      const svg = '<svg><path fill="#333" /><path fill="#999" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a black-and-white two-tone glyph', () => {
      const svg = '<svg><path fill="black" /><path fill="white" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a full-canvas path background with a glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#fff" /><path fill="#000" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects an explicit light fill combined with a default-black glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#fff" /><path d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('still tints an explicit black fill combined with a default-black glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M2 2h4v4H2z" fill="#000" /><path d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a line-art icon that disables its fill', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M4 12h16" fill="none" stroke="#333" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('rejects a closed stroked path that still renders its default black fill', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" stroke="#fff" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects an open stroked path that does not disable its default fill', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6" stroke="#fff" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a default-black open path combined with an explicit light shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0" fill="#fff" /><path d="M6 6h12v12H6" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('inherits an ancestor fill instead of assuming the default black', () => {
      const svg = '<svg viewBox="0 0 24 24"><g fill="#333"><path d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });
  });

  describe('currentColor (a visible, theme-following tone)', () => {
    it('tints an icon painted entirely with currentColor', () => {
      const svg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves currentColor mixed with an explicit light paint', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#fff" /><path fill="currentColor" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves currentColor mixed with a default-black glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h4v4H2z" /><path d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('multi-color icons (colors preserved)', () => {
    it('treats a saturated hex color as multi-color', () => {
      const svg = '<svg><path fill="#ff0000" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('treats a mix of saturated colors as multi-color', () => {
      const svg =
        '<svg><path fill="#4285F4" /><path fill="#34A853" /><path fill="#EA4335" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('treats named chromatic colors as multi-color', () => {
      const svg = '<svg><path fill="rebeccapurple" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('treats saturated rgb() as multi-color', () => {
      const svg = '<svg><path style="fill: rgb(255, 0, 0)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('treats saturated hsl() as multi-color', () => {
      const svg = '<svg><path style="fill: hsl(210, 80%, 50%)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('treats gradient (url reference) fills as multi-color', () => {
      const svg = '<svg><path fill="url(#grad)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('opaque background (not tintable as a mask)', () => {
    it('rejects a white background rect with a black glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#ffffff" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a black background rect with a white glyph', () => {
      const svg =
        '<svg viewBox="0 0 48 48"><rect width="48" height="48" fill="black" /><path fill="white" d="M0 0h10v10H0z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a full-size percentage background rect', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="100%" height="100%" fill="#eee" /><path fill="#222" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a default-fill (opaque black) background rect', () => {
      const svg =
        '<svg viewBox="0 0 16 16"><rect width="16" height="16" /><path fill="#fff" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('still tints a glyph drawn with small rects on a transparent background', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" fill="#333" /><rect x="14" y="14" width="6" height="6" fill="#333" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a transparent background rect', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="none" /><path fill="#333" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a full-canvas rect inside a clipPath template', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><clipPath id="c"><rect width="24" height="24" /></clipPath></defs><path fill="#000" d="M4 4h16v16H4z" clip-path="url(#c)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a full-canvas rect inside a mask template', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><mask id="m"><rect width="24" height="24" fill="#fff" /></mask></defs><path fill="#333" d="M4 4h16v16H4z" mask="url(#m)" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('rejects a background rect using root width/height when no viewBox is present', () => {
      const svg =
        '<svg width="24" height="24"><rect width="24" height="24" fill="#fff" /><path fill="#000" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a background rect when root dimensions carry units', () => {
      const svg =
        '<svg width="48px" height="48px"><rect width="48" height="48" fill="black" /><path fill="white" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('does not confuse stroke-width with the canvas width', () => {
      const svg =
        '<svg width="24" height="24" stroke-width="2"><rect width="24" height="24" fill="#eee" /><path fill="#222" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects a background rect when the viewBox is comma-separated', () => {
      const svg =
        '<svg viewBox="0,0,24,24"><rect width="24" height="24" fill="#fff" /><path fill="#000" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('embedded raster/foreign content (not tintable)', () => {
    it('rejects an SVG wrapping an embedded raster image (href)', () => {
      const svg = '<svg><image href="data:image/png;base64,abc" width="24" height="24" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects an SVG wrapping an embedded raster image (xlink:href)', () => {
      const svg =
        '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="logo.png" width="24" height="24" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('rejects an SVG embedding foreignObject content', () => {
      const svg = '<svg><foreignObject><div>hi</div></foreignObject></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('parser robustness', () => {
    it('tints a namespaced monochrome svg', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves a namespaced multi-color svg', () => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" /><path fill="#34A853" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('does not tint unparseable input', () => {
      expect(isMonochromeSvg('')).toBe(false);
      expect(isMonochromeSvg('<svg><path fill="#000"')).toBe(false);
    });
  });
});

describe('sanitizeSvg', () => {
  it('strips script tags but keeps drawing elements', () => {
    const dirty = '<svg><script>alert(1)</script><path d="M0 0h10v10H0z" /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert(1)');
    expect(clean).toContain('path');
  });

  it('strips inline event handler attributes', () => {
    const dirty = '<svg onload="alert(1)"><circle cx="5" cy="5" r="5" onclick="alert(2)" /></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('circle');
  });

  it('removes foreignObject and embedded HTML', () => {
    const dirty =
      '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean.toLowerCase()).not.toContain('foreignobject');
    expect(clean.toLowerCase()).not.toContain('iframe');
  });
});
