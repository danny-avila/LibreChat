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

    it('rejects an explicit badge alongside a default-black polyline glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="8" height="8" fill="#fff" /><polyline points="6,6 18,6 18,18 6,18" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a glyph drawn as a single default-black polyline', () => {
      const svg = '<svg viewBox="0 0 24 24"><polyline points="6,6 18,6 18,18 6,18" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('rejects an explicit badge alongside an inherited-fill glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="8" height="8" fill="#fff" /><path fill="inherit" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('resolves fill="inherit" against an ancestor fill', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g fill="#333"><path fill="inherit" d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
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

  describe('content referenced through <use>', () => {
    it('preserves a chromatic logo rendered through a referenced symbol', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="logo"><path fill="#f00" d="M4 4h16v16H4z" /></symbol></defs><use href="#logo" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a multi-tone glyph defined in defs and rendered through use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><g id="g"><path fill="#fff" d="M0 0h24v24H0z" /><path fill="#000" d="M6 6h12v12H6z" /></g></defs><use href="#g" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a monochrome glyph defined in defs and rendered through use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="p" fill="#333" d="M4 4h16v16H4z" /></defs><use href="#p" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a one-color symbol icon whose fill comes from a colored use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="p" d="M4 4h16v16H4z" /></defs><use href="#p" fill="#333" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves an explicit badge alongside a default-black use instance', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="glyph" d="M6 6h12v12H6z" /></defs><rect x="0" y="0" width="8" height="8" fill="#fff" /><use href="#glyph" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('ignores an unreferenced colored template in defs', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="unused"><path fill="#f00" d="M0 0h4v4H0z" /></symbol></defs><path fill="#333" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves a referenced currentColor symbol fixed to a chromatic color by the use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><path fill="currentColor" d="M4 4h16v16H4z" /></symbol></defs><use href="#s" color="#e00" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a referenced currentColor symbol with no fixed color at the use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><path fill="currentColor" d="M4 4h16v16H4z" /></symbol></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a default-black use hidden with display="none"', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="g" d="M6 6h12v12H6z" /></defs><path fill="#333" d="M0 0h4v4H0z" /><use href="#g" display="none" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a default-black use hidden by a CSS rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.hidden{display:none}</style><defs><path id="g" d="M6 6h12v12H6z" /></defs><path fill="#333" d="M0 0h4v4H0z" /><use href="#g" class="hidden" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a referenced color rendered only through an opacity-zero use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="red" fill="#f00" d="M6 6h12v12H6z" /></defs><path fill="#333" d="M0 0h4v4H0z" /><use href="#red" opacity="0" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a nested referenced color hidden by an opacity-zero use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#red" opacity="0" /></symbol><path id="red" fill="#f00" d="M6 6h12v12H6z" /></defs><path fill="#333" d="M0 0h4v4H0z" /><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a default-black use hidden with opacity zero', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="g" d="M6 6h12v12H6z" /></defs><path fill="#fff" d="M0 0h4v4H0z" /><use href="#g" opacity="0" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a referenced glyph whose own fill overrides the use fill', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="p" fill="#333" d="M4 4h16v16H4z" /></defs><use href="#p" fill="#000" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a use fill that the referenced shape inherits', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="p" d="M4 4h16v16H4z" /></defs><use href="#p" fill="#000" /><path fill="#ccc" d="M0 0h4v4H0z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a chromatic logo reached through a nested use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#red" /></symbol><path id="red" fill="#f00" d="M4 4h16v16H4z" /></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a grayscale glyph reached through a nested use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#g" /></symbol><path id="g" fill="#333" d="M4 4h16v16H4z" /></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('counts an outer use fill inherited through a nested use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#g" /></symbol><path id="g" d="M4 4h16v16H4z" /></defs><path fill="#000" d="M0 0h6v6H0z" /><use href="#s" fill="#fff" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a default-black glyph reached through a nested use with no instance fill', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#g" /></symbol><path id="g" d="M4 4h16v16H4z" /></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });
  });

  describe('currentColor resolved against a fixed color', () => {
    it('preserves a logo whose currentColor resolves to a fixed chromatic color', () => {
      const svg =
        '<svg viewBox="0 0 24 24" color="#e00"><path fill="currentColor" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves currentColor fixed by an ancestor group color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g color="#0a0"><path fill="currentColor" d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('still tints when the fixed color is itself grayscale', () => {
      const svg =
        '<svg viewBox="0 0 24 24" color="#333"><path fill="currentColor" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves a CSS currentColor fill fixed by an ancestor color', () => {
      const svg =
        '<svg viewBox="0 0 24 24" color="#e00"><style>.a{fill:currentColor}</style><path class="a" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a CSS currentColor fill with no fixed color in scope', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.a{fill:currentColor}</style><path class="a" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('does not count an unused CSS color declaration as a tone', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>svg{color:#333}</style><path d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('resolves CSS currentColor against a CSS color declaration', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.a{color:#e00;fill:currentColor}</style><path class="a" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('ignores an unused CSS paint rule that matches no element', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.unused{fill:#f00}.icon{fill:#333}</style><path class="icon" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a CSS paint that only targets a hidden element', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.ghost{fill:#f00;display:none}.icon{fill:#333}</style><path class="ghost" d="M0 0h4v4H0z" /><path class="icon" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a CSS currentColor paint that only targets a hidden element', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.ghost{display:none;fill:currentColor}</style><path class="ghost" d="M0 0h4v4H0z" /><path fill="#333" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a CSS currentColor paint on a visible shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.a{fill:currentColor}</style><path class="a" d="M0 0h24v24H0z" /><path fill="#fff" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a chromatic fill applied to the root via CSS', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>svg{fill:#f00}</style><path d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a root CSS currentColor fill fixed by the root color', () => {
      const svg =
        '<svg viewBox="0 0 24 24" color="#e00"><style>svg{fill:currentColor}</style><path d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a nested-use currentColor glyph fixed by the outer use color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#glyph" /></symbol><path id="glyph" fill="currentColor" d="M4 4h16v16H4z" /></defs><use href="#s" color="#e00" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a nested-use currentColor glyph fixed by the inner use color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#glyph" color="#0a0" /></symbol><path id="glyph" fill="currentColor" d="M4 4h16v16H4z" /></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a nested-use currentColor glyph with no fixed color at any use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="s"><use href="#glyph" /></symbol><path id="glyph" fill="currentColor" d="M4 4h16v16H4z" /></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves a glyph instantiated twice with different colors through nested use', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><path id="glyph" fill="currentColor" d="M4 4h16v16H4z" /><symbol id="s"><use href="#glyph" color="#000" /><use href="#glyph" color="#fff" /></symbol></defs><use href="#s" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('terminates on a self-referential use cycle and still finds its color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><symbol id="a"><use href="#b" /></symbol><symbol id="b"><use href="#a" /><path fill="#f00" d="M4 4h16v16H4z" /></symbol></defs><use href="#a" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('paint set on non-rendering containers', () => {
    it('tints a glyph whose root fill is overridden by every rendered shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24" fill="#f00"><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph whose group fill no rendered shape inherits', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g fill="#f00"><path fill="#333" d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a container fill inherited by an unpainted shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g fill="#f00"><path d="M4 4h16v16H4z" /></g><path fill="#333" d="M0 0h4v4H0z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a glyph whose root CSS fill is overridden by every rendered shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>svg{fill:#f00}</style><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph whose CSS group fill no rendered shape inherits', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>g{fill:#f00}</style><g><path fill="#333" d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a CSS container fill inherited by an unpainted shape', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>g{fill:#f00}</style><g><path d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('default fills alongside <style> rules', () => {
    it('rejects a CSS-filled shape combined with a default-black glyph', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{fill:#fff}</style><path class="bg" d="M0 0h24v24H0z" /><path d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a CSS-styled monochrome icon with no unpainted shapes', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.st0{fill:#333}</style><path class="st0" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a default-black glyph when the style block sets no conflicting fill', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.hidden{display:none}</style><path d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('preserves a class glyph that a type rule would otherwise recolor', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.fg{fill:#000}.bg{fill:#fff}path{fill:#fff}</style><path class="bg" d="M0 0h6v6H0z" /><path class="fg" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints when a more specific class rule agrees with the type rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.fg{fill:#333}path{fill:#333}</style><path class="fg" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('lets a CSS rule override a presentation fill attribute', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{fill:#fff}</style><path class="bg" fill="#000" d="M0 0h6v6H0z" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('keeps an inline style fill over a conflicting CSS rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{fill:#f00}</style><path class="bg" style="fill:#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('parses CSS rules after a leading comment in the style block', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>/* generated */ .st0{fill:#e00}</style><path class="st0" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('parses CSS rules despite a comment containing braces', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>/* a } b */ .st0{fill:#e00}</style><path class="st0" d="M4 4h16v16H4z" /></svg>';
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

  describe('filter colors', () => {
    it('preserves a black glyph with a chromatic drop shadow', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="shadow"><feDropShadow dx="1" dy="1" flood-color="#f00" /></filter></defs><path filter="url(#shadow)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a glyph with a chromatic flood filter color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="flood"><feFlood flood-color="#e00" /></filter></defs><path filter="url(#flood)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a glyph with a chromatic lighting filter color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="light"><feDiffuseLighting lighting-color="#0a0" /></filter></defs><path filter="url(#light)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('ignores an unreferenced chromatic filter color', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="unused"><feFlood flood-color="#f00" /></filter></defs><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a chromatic flood color with zero flood opacity', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="shadow"><feDropShadow flood-color="#f00" flood-opacity="0" /></filter></defs><path filter="url(#shadow)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a chromatic filter attached to an opacity-zero element', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="shadow"><feDropShadow flood-color="#f00" /></filter></defs><path filter="url(#shadow)" opacity="0" fill="#000" d="M0 0h4v4H0z" /><path fill="#333" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('resolves a mixed-case filter id referenced by attribute', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="dropShadow"><feDropShadow flood-color="#f00" /></filter></defs><path filter="url(#dropShadow)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('resolves a mixed-case filter id referenced by a CSS rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.fx{filter:url(#dropShadow)}</style><defs><filter id="dropShadow"><feFlood flood-color="#e00" /></filter></defs><path class="fx" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a glyph recolored by a feColorMatrix filter', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="r"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" /></filter></defs><path filter="url(#r)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('preserves a glyph recolored by a feComponentTransfer filter', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="ct"><feComponentTransfer><feFuncR type="linear" slope="0" intercept="1" /></feComponentTransfer></filter></defs><path filter="url(#ct)" fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('tints a grayscale glyph with a color-neutral blur filter', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="b"><feGaussianBlur stdDeviation="1" /></filter></defs><path filter="url(#b)" fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores an unreferenced recoloring filter', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><defs><filter id="r"><feColorMatrix type="hueRotate" values="90" /></filter></defs><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
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

    it('tints a glyph over a 4-digit-hex transparent background rect', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#fff0" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over an 8-digit-hex transparent background rect', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#ffffff00" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over an rgba() transparent background rect', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="rgba(255,255,255,0)" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a shape painted with a fully transparent (alpha-zero) fill', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path fill="#ff000000" d="M0 0h4v4H0z" /><path fill="#333" d="M6 6h12v12H6z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a background rect that inherits fill="none"', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g fill="none"><rect width="24" height="24" /></g><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a background rect whose fill:none comes from CSS', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{fill:none}</style><rect class="bg" width="24" height="24" /><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a rect with fill-opacity:0 in inline style', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" style="fill:#fff;fill-opacity:0" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a rect whose fill-opacity:0 comes from CSS', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{fill-opacity:0}</style><rect class="bg" width="24" height="24" fill="#fff" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a rect hidden with display="none"', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#fff" display="none" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('tints a glyph over a rect hidden by a CSS display:none rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.bg{display:none}</style><rect class="bg" width="24" height="24" fill="#fff" /><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a background rect in an opacity-zero group despite its own fill-opacity', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g opacity="0"><rect width="24" height="24" fill="#fff" fill-opacity="1" /></g><path fill="#000" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
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

  describe('opacity-zero ancestors hide their descendants', () => {
    it('ignores a colored paint inside an opacity-zero group despite its own fill-opacity', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g opacity="0"><path fill="#f00" fill-opacity="1" d="M0 0h24v24H0z" /></g><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a paint whose fill-opacity is one under a visible group', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g opacity="1"><path fill="#f00" fill-opacity="1" d="M4 4h16v16H4z" /></g></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });

    it('ignores a transparent default-filled shape via fill-opacity', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill-opacity="0" /><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a transparent default-filled shape via opacity', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" opacity="0" /><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts an opaque default-filled shape as black', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" /><path fill="#fff" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(false);
    });
  });

  describe('visibility:hidden removes paint', () => {
    it('ignores a colored shape hidden with the visibility attribute', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#f00" visibility="hidden" /><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('ignores a shape hidden by a CSS visibility:hidden rule', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><style>.hide{visibility:hidden}</style><rect class="hide" width="24" height="24" fill="#f00" /><path fill="#333" d="M4 4h16v16H4z" /></svg>';
      expect(isMonochromeSvg(svg)).toBe(true);
    });

    it('still counts a visible child inside a visibility:hidden group', () => {
      const svg =
        '<svg viewBox="0 0 24 24"><g visibility="hidden"><path fill="#f00" visibility="visible" d="M4 4h16v16H4z" /></g></svg>';
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
