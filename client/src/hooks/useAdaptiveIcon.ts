import { useEffect, useState } from 'react';
import { isSvgIcon, isMonochromeSvg } from '~/utils';

/** Resolved monochrome verdicts, keyed by icon source, shared across instances. */
const monochromeCache = new Map<string, boolean>();
/** In-flight resolutions, so concurrent instances of the same icon fetch once. */
const inFlight = new Map<string, Promise<boolean>>();

function decodeDataUri(uri: string): string {
  const comma = uri.indexOf(',');
  if (comma === -1) {
    return '';
  }
  const meta = uri.slice(0, comma);
  const content = uri.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    return atob(content);
  }
  return decodeURIComponent(content);
}

async function loadSvgContent(src: string): Promise<string> {
  if (src.startsWith('data:')) {
    return decodeDataUri(src);
  }
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load SVG icon (${response.status})`);
  }
  return response.text();
}

function resolveMonochrome(src: string): Promise<boolean> {
  const cached = monochromeCache.get(src);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const existing = inFlight.get(src);
  if (existing) {
    return existing;
  }
  const promise = loadSvgContent(src)
    .then(isMonochromeSvg)
    .catch(() => false)
    .then((monochrome) => {
      monochromeCache.set(src, monochrome);
      inFlight.delete(src);
      return monochrome;
    });
  inFlight.set(src, promise);
  return promise;
}

/**
 * Determines whether a custom icon should be tinted to `currentColor` so it
 * adapts to the active theme. Only monochrome SVG glyphs are tinted; raster
 * images and multi-color SVG logos keep their original colors. SVG content is
 * fetched once and cached; any fetch failure (e.g. CORS) leaves the icon
 * untinted.
 */
function cachedVerdict(key: string | null): boolean {
  return key != null ? (monochromeCache.get(key) ?? false) : false;
}

export default function useAdaptiveIcon(src?: string | null): { shouldTint: boolean } {
  const key = isSvgIcon(src) ? src : null;
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
    resolveMonochrome(key).then((monochrome) => {
      if (active) {
        setState((prev) => (prev.key === key ? { key, monochrome } : prev));
      }
    });
    return () => {
      active = false;
    };
  }, [key]);

  return { shouldTint: state.key === key && state.monochrome };
}
