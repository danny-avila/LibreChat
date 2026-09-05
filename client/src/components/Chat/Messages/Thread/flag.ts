/**
 * Prototype switch for the flat thread renderer, read once per page load.
 * `LC_FLAT_THREAD` in localStorage wins; `VITE_FLAT_THREAD` sets the default.
 */
function readFlag(): boolean {
  const fallback = import.meta.env.VITE_FLAT_THREAD === 'true';
  try {
    const stored = localStorage.getItem('LC_FLAT_THREAD');
    return stored == null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
}

export const FLAT_THREAD = readFlag();
