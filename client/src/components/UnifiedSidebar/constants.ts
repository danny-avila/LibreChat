export const COLLAPSED_WIDTH = 52;
export const EXPANDED_MIN = 360;

/**
 * The mobile drawer stops short of the edge so a strip of the chat stays on
 * screen: it keeps the drawer reading as a layer over the conversation rather
 * than a separate screen, and gives the close gesture a target to tap.
 *
 * The drawer and the pane derive their travel from this one number so they
 * cannot drift apart (see SIDEBAR_TRANSITION).
 */
export const MOBILE_DRAWER_WIDTH_PCT = 80;
export const MOBILE_DRAWER_WIDTH = `${MOBILE_DRAWER_WIDTH_PCT}%`;
export const MOBILE_PANE_SHIFT = `translateX(${MOBILE_DRAWER_WIDTH_PCT}%)`;
export const TRANSITION_MS = 300;
/**
 * Decelerating, but it settles rather than crawls. The previous
 * cubic-bezier(0.2, 0, 0, 1) spent its last third of time on a few percent of
 * distance, which reads as the drawer sticking just before it lands — most
 * obvious on close, where the tail is the part you watch.
 */
export const EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

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
