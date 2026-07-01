import {
  installCanvasMock,
  registerFakeIcon,
  resetFakeIcons,
  getLastCrossOrigin,
} from 'test/canvasMock';
import { detectMonochrome, sanitizeSvg, scanMonochrome } from '../svg';

const rgba = (...quads: number[]) => Uint8ClampedArray.from(quads);

describe('scanMonochrome', () => {
  it('treats a black glyph on a transparent background as monochrome', () => {
    expect(scanMonochrome(rgba(0, 0, 0, 0, 0, 0, 0, 255))).toBe(true);
  });

  it('treats a mid-gray glyph as monochrome', () => {
    expect(scanMonochrome(rgba(128, 128, 128, 255, 0, 0, 0, 0))).toBe(true);
  });

  it('allows a channel spread within the tolerance', () => {
    expect(scanMonochrome(rgba(100, 110, 105, 255, 0, 0, 0, 0))).toBe(true);
  });

  it('accepts a channel spread exactly at the tolerance', () => {
    expect(scanMonochrome(rgba(100, 116, 100, 255, 0, 0, 0, 0))).toBe(true);
  });

  it('rejects a channel spread just past the tolerance', () => {
    expect(scanMonochrome(rgba(100, 117, 100, 255, 0, 0, 0, 0))).toBe(false);
  });

  it('rejects a chromatic pixel', () => {
    expect(scanMonochrome(rgba(255, 0, 0, 255, 0, 0, 0, 0))).toBe(false);
  });

  it('ignores transparent pixels when judging tone', () => {
    expect(scanMonochrome(rgba(255, 0, 0, 0, 20, 20, 20, 255))).toBe(true);
  });

  it('skips a chromatic pixel at the alpha threshold', () => {
    expect(scanMonochrome(rgba(255, 0, 0, 8, 20, 20, 20, 255))).toBe(true);
  });

  it('samples a chromatic pixel just above the alpha threshold', () => {
    expect(scanMonochrome(rgba(255, 0, 0, 9, 0, 0, 0, 0))).toBe(false);
  });

  it('is not monochrome when nothing is painted', () => {
    expect(scanMonochrome(rgba(0, 0, 0, 0, 255, 0, 0, 0))).toBe(false);
  });

  it('is not monochrome when any opaque pixel is chromatic', () => {
    expect(scanMonochrome(rgba(10, 10, 10, 255, 200, 10, 10, 255, 0, 0, 0, 0))).toBe(false);
  });

  it('is not monochrome when fully opaque, since a mask would flatten it to a block', () => {
    expect(scanMonochrome(rgba(0, 0, 0, 255, 90, 90, 90, 255))).toBe(false);
  });
});

describe('detectMonochrome', () => {
  beforeEach(() => {
    resetFakeIcons();
    installCanvasMock();
  });

  it('detects a grayscale glyph as monochrome', async () => {
    registerFakeIcon('/mono.svg', {
      width: 24,
      height: 24,
      pixels: [0, 0, 0, 0, 0, 0, 0, 255, 90, 90, 90, 255],
    });
    await expect(detectMonochrome('/mono.svg')).resolves.toBe(true);
  });

  it('detects a multi-color icon as not monochrome', async () => {
    registerFakeIcon('/color.svg', {
      width: 24,
      height: 24,
      pixels: [12, 120, 240, 255, 0, 0, 0, 0],
    });
    await expect(detectMonochrome('/color.svg')).resolves.toBe(false);
  });

  it('does not treat a fully-opaque grayscale image as monochrome', async () => {
    registerFakeIcon('/block.svg', {
      width: 24,
      height: 24,
      pixels: [0, 0, 0, 255, 60, 60, 60, 255],
    });
    await expect(detectMonochrome('/block.svg')).resolves.toBe(false);
  });

  it('requests cross-origin access so CORS icons can be sampled', async () => {
    registerFakeIcon('/cors.svg', { width: 8, height: 8, pixels: [0, 0, 0, 255] });
    await detectMonochrome('/cors.svg');
    expect(getLastCrossOrigin()).toBe('anonymous');
  });

  it('falls back to non-monochrome when the image fails to load', async () => {
    registerFakeIcon('/broken.svg', { width: 24, height: 24, error: true });
    await expect(detectMonochrome('/broken.svg')).resolves.toBe(false);
  });

  it('falls back to non-monochrome when the canvas is tainted', async () => {
    registerFakeIcon('/cross-origin.svg', {
      width: 24,
      height: 24,
      pixels: [0, 0, 0, 255],
      taint: true,
    });
    await expect(detectMonochrome('/cross-origin.svg')).resolves.toBe(false);
  });

  it('is not monochrome when the icon reports no intrinsic size', async () => {
    registerFakeIcon('/sizeless.svg', { width: 0, height: 0, pixels: [0, 0, 0, 255] });
    await expect(detectMonochrome('/sizeless.svg')).resolves.toBe(false);
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
