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

    it('treats grayscale shades as monochrome', () => {
      const svg = '<svg><path fill="#333" /><path stroke="#666666" /><rect fill="#ccc" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('treats named grayscale colors as monochrome', () => {
      const svg = '<svg><path fill="black" /><path stroke="gray" /></svg>';
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

    it('handles colors defined inside a style block', () => {
      const svg = '<svg><style>.a{fill:#222}.b{stroke:#888}</style><path class="a" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
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
