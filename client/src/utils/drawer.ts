/** Viewport width, in baseline pixels, below which navigation becomes the drawer. */
export const DRAWER_MAX_WIDTH = 768;

const BASE_FONT_SIZE = 16;

/**
 * Deliberately not `getRemScale` from `@librechat/client`: this module is pulled in by
 * `~/store`, which nearly every suite loads, and many of them replace that package with
 * a partial mock. React consumers go through `useDrawerViewport`, which does use the
 * shared hook.
 */
const readRemScale = (): number => {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return 1;
  }
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize / BASE_FONT_SIZE : 1;
};

/**
 * The sidebar is laid out in rem, so the drawer breakpoint has to compare the viewport
 * in the same units. Every consumer builds its query from here: the hook that owns the
 * open state and the route controls that reveal the reopen affordance have to agree, or
 * a viewport between the fixed and scaled breakpoints opens the drawer with no visible
 * way back out of it.
 */
export const drawerMediaQuery = (remScale: number): string =>
  `(max-width: ${DRAWER_MAX_WIDTH * remScale}px)`;

/** Read synchronously where a hook cannot run: `useMediaQuery` only resolves after paint. */
export const isDrawerViewport = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(drawerMediaQuery(readRemScale())).matches;
