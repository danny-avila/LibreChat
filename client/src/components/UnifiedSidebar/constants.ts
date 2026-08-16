export const COLLAPSED_WIDTH = 52;
export const EXPANDED_MIN = 360;
export const TRANSITION_MS = 300;
export const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * The drawer and the chat pane move as one object, so they must stay
 * frame-locked; a second copy of this string is a visible seam mid-animation.
 */
export const SIDEBAR_TRANSITION = `transform ${TRANSITION_MS}ms ${EASING}`;

/**
 * The mobile drawer is opaque and full-screen, so it sits above the chat.
 *
 * This ranks the drawer only *within* `Root`'s `relative z-0` stacking
 * context, so it cannot occlude anything portaled to `document.body` no
 * matter the value. Menus opened from inside the drawer should therefore keep
 * portaling: rendering them in place puts them under the nav's
 * `overflow-hidden` and the virtualized list, and the drawer's transform makes
 * it their containing block, which clips them.
 */
export const DRAWER_Z_INDEX = 110;

/**
 * Lets the swipe gesture (mounted in Root, which owns the chat pane) reach
 * the drawer element without threading a ref across sibling trees.
 */
export const MOBILE_DRAWER_ID = 'mobile-drawer';
