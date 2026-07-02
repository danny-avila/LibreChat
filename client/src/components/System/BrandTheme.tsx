import { useEffect } from 'react';
import { useBrand } from '~/hooks';

const BRAND_ATTR = 'data-brand';

/**
 * BrandTheme
 *
 * Mirrors the active brand (from `/api/config`, selected by the `BRAND` env var)
 * onto `<html data-brand="…">` so the cosmetic palette/font overrides in
 * `brands.css` can scope to it. Purely visual: it sets a single root attribute
 * and touches no automation-facing selector. When no brand is active the
 * attribute is removed, leaving the DOM byte-identical to stock LibreChat.
 *
 * Rendered at the app root (alongside `WakeLockManager`) so the theme follows
 * the deployment across every route.
 */
const BrandTheme = () => {
  const { brand } = useBrand();
  const name = brand?.brand ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (name == null) {
      root.removeAttribute(BRAND_ATTR);
      return;
    }
    root.setAttribute(BRAND_ATTR, name);
    return () => {
      root.removeAttribute(BRAND_ATTR);
    };
  }, [name]);

  return null;
};

export default BrandTheme;
