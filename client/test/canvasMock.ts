/**
 * Test shim for the icon monochrome detector. jsdom does not decode images and
 * `jest-canvas-mock` only returns transparent pixels, so this replaces `Image`
 * and `canvas.getContext('2d')` with fakes driven by a per-source registry. The
 * real detection logic (`scanMonochrome`) still runs against the sampled bytes.
 */

export interface FakeIcon {
  width: number;
  height: number;
  /** Flat RGBA quads returned by `getImageData`; omit for a transparent image. */
  pixels?: number[];
  /** Simulate a canvas tainted by a non-CORS cross-origin image. */
  taint?: boolean;
  /** Simulate the image failing to load. */
  error?: boolean;
  /** Simulate an image whose load never resolves. */
  pending?: boolean;
}

const icons = new Map<string, FakeIcon>();
let lastCrossOrigin: string | null = null;
let loadCount = 0;

export function registerFakeIcon(src: string, icon: FakeIcon): void {
  icons.set(src, icon);
}

export function resetFakeIcons(): void {
  icons.clear();
  lastCrossOrigin = null;
  loadCount = 0;
}

/** The `crossOrigin` set on the most recently loaded image, so tests can assert
 *  the detector opts into CORS before reading pixels. */
export function getLastCrossOrigin(): string | null {
  return lastCrossOrigin;
}

/** How many images the detector has loaded, so tests can assert that the cache
 *  and in-flight dedup avoid re-sampling the same source. */
export function getImageLoadCount(): number {
  return loadCount;
}

class MockImage {
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  private currentSrc = '';

  get src(): string {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    lastCrossOrigin = this.crossOrigin;
    loadCount += 1;
    const icon = icons.get(value);
    if (icon?.pending === true) {
      return;
    }
    Promise.resolve().then(() => {
      if (!icon || icon.error === true) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = icon.width;
      this.naturalHeight = icon.height;
      this.onload?.();
    });
  }
}

class FakeContext {
  private drawn: MockImage | null = null;

  drawImage(image: MockImage): void {
    this.drawn = image;
  }

  getImageData(): ImageData {
    const icon = this.drawn ? icons.get(this.drawn.src) : undefined;
    if (icon?.taint === true) {
      throw new DOMException('tainted canvas', 'SecurityError');
    }
    if (!icon?.pixels || icon.pixels.length === 0) {
      return new ImageData(1, 1);
    }
    const data = Uint8ClampedArray.from(icon.pixels);
    /* `ImageData(data, width)` — the second arg is the row width in pixels, so
     * this yields a 1-row image. `scanMonochrome` walks the flat RGBA buffer and
     * ignores geometry, so a single row is all the detector needs. */
    return new ImageData(data, data.length / 4);
  }
}

/**
 * Installs the `Image`/canvas fakes on the current jsdom globals. `defineProperty`
 * is used because lib.dom types `PropertyDescriptor.value` loosely, so the
 * overload-heavy `getContext` signature is satisfied without a cast. Call from a
 * `beforeEach`; jsdom resets globals between test files, so no teardown is needed.
 */
export function installCanvasMock(): void {
  Object.defineProperty(global, 'Image', {
    value: MockImage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => new FakeContext(),
    configurable: true,
    writable: true,
  });
}
