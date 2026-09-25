const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function luminance(triplet: string): number | undefined {
  const parts = triplet.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return undefined;
  }
  const [r, g, b] = parts;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two `R G B` triplets; `undefined` when either is malformed. */
export function contrastRatio(a: string, b: string): number | undefined {
  const [first, second] = [luminance(a), luminance(b)];
  if (first === undefined || second === undefined) {
    return undefined;
  }
  const [lighter, darker] = first > second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
}
