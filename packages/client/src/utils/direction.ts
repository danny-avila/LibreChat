const OPPOSITE: Record<string, string> = { left: 'right', right: 'left' };

/** Reads the writing direction from the element itself (nearest `dir` attribute, else computed style), so an LTR island inside an RTL page
 *  (and the reverse) resolves correctly instead of following the document. */
export function isRtl(element?: Element | null): boolean {
  if (!element || typeof window === 'undefined') {
    return false;
  }
  const declared = element.closest('[dir]')?.getAttribute('dir');
  if (declared === 'rtl' || declared === 'ltr') {
    return declared === 'rtl';
  }
  return window.getComputedStyle(element).direction === 'rtl';
}

/** Maps a physical `left`/`right` side or placement (`right`, `left-start`) to the side that
 *  is visually equivalent under RTL; `top`/`bottom` and LTR anchors pass through unchanged.
 *  The `-start`/`-end` suffix is left alone: floating positioning already resolves it per direction. */
export function resolveSide<T extends string>(side: T, element?: Element | null): T {
  if (!isRtl(element)) {
    return side;
  }
  const [base, ...rest] = side.split('-');
  const opposite = OPPOSITE[base];
  return (opposite ? [opposite, ...rest].join('-') : side) as T;
}

/** Swaps ArrowLeft and ArrowRight for horizontal navigation when the element is RTL. */
export function resolveArrowKey(key: string, element?: Element | null): string {
  if (!isRtl(element)) {
    return key;
  }
  if (key === 'ArrowLeft') {
    return 'ArrowRight';
  }
  return key === 'ArrowRight' ? 'ArrowLeft' : key;
}
