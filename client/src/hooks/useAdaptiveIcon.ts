import { useEffect, useState } from 'react';
import { isSvgIcon, detectMonochrome } from '~/utils';

/** Resolved monochrome verdicts, keyed by icon source, shared across instances. */
const monochromeCache = new Map<string, boolean>();
/** In-flight resolutions, so concurrent instances of the same icon sample once. */
const inFlight = new Map<string, Promise<boolean>>();

function resolveMonochrome(src: string): Promise<boolean> {
  const cached = monochromeCache.get(src);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const existing = inFlight.get(src);
  if (existing) {
    return existing;
  }
  const promise = detectMonochrome(src)
    .catch(() => false)
    .then((monochrome) => {
      monochromeCache.set(src, monochrome);
      inFlight.delete(src);
      return monochrome;
    });
  inFlight.set(src, promise);
  return promise;
}

function cachedVerdict(key: string | null): boolean {
  return key != null ? (monochromeCache.get(key) ?? false) : false;
}

/**
 * Determines whether a custom icon should be tinted to `currentColor` so it
 * adapts to the active theme. An explicit `monochrome` flag wins when provided;
 * otherwise a monochrome SVG glyph is detected by drawing it to an offscreen
 * canvas and sampling its pixels, while raster images and multi-color SVG logos
 * keep their original colors. The verdict is sampled once per source and cached;
 * a load failure or a canvas tainted by a non-CORS cross-origin icon leaves it
 * untinted.
 */
export default function useAdaptiveIcon(
  src?: string | null,
  monochrome?: boolean,
): { shouldTint: boolean } {
  const key = typeof monochrome !== 'boolean' && isSvgIcon(src) ? src : null;
  const [state, setState] = useState<{ key: string | null; monochrome: boolean }>(() => ({
    key,
    monochrome: cachedVerdict(key),
  }));

  /** Reset synchronously when the source changes so a verdict resolved for a
   *  previous icon never tints the new one; seed from cache when available. */
  if (state.key !== key) {
    setState({ key, monochrome: cachedVerdict(key) });
  }

  useEffect(() => {
    if (key == null) {
      return;
    }
    let active = true;
    resolveMonochrome(key).then((resolved) => {
      if (active) {
        setState((prev) => (prev.key === key ? { key, monochrome: resolved } : prev));
      }
    });
    return () => {
      active = false;
    };
  }, [key]);

  if (typeof monochrome === 'boolean') {
    return { shouldTint: monochrome };
  }
  return { shouldTint: state.key === key && state.monochrome };
}
