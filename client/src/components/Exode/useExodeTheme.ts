import { useEffect } from 'react';
import { useIsExodeEmbed } from './protocol';

/** Only ever a CSS colour, and only from the host's own URL — never interpolated as markup. */
const SAFE_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Applies exode's design tokens to the embedded chat.
 *
 * Sets `data-exode-embed` on <html>, which is the scope `exode-theme.css` hangs
 * off — standalone LibreChat never gets the attribute and keeps its own palette.
 *
 * The accent is per-school (exode applies it at runtime from
 * `SchoolStore.preferences.colorVariables`), so it cannot live in the stylesheet:
 * the host forwards it as `?accent=%23fa6c1c` and it is set as an inline
 * variable here. Anything that is not a plain hex colour is ignored, leaving the
 * stylesheet's default.
 */
export function useExodeTheme(): void {
  const isExodeEmbed = useIsExodeEmbed();

  useEffect(() => {
    if (!isExodeEmbed) {
      return;
    }

    const root = document.documentElement;
    root.setAttribute('data-exode-embed', '');

    const accent = new URLSearchParams(window.location.search).get('accent');
    if (accent != null && SAFE_COLOR.test(accent)) {
      root.style.setProperty('--exode-accent', accent);
    }

    /* No cleanup that removes the attribute: the latch means an embedded page
       stays embedded for its whole life, and tearing the theme down on an
       internal navigation would flash LibreChat's palette mid-session. */
  }, [isExodeEmbed]);
}
