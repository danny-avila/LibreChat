export const COLLAPSED_WIDTH = 52;
export const EXPANDED_MIN = 360;

/**
 * How much of the viewport the mobile drawer covers.
 *
 * Full width by default, where the drawer reads as its own screen and the
 * swipe closes it. Opting into the strip stops it short of the edge so a slice
 * of the conversation stays visible, which keeps the drawer reading as a layer
 * over the conversation and gives the close gesture a target to tap.
 *
 * Both the drawer and the pane read the one custom property, so their travel
 * cannot drift apart (see SIDEBAR_TRANSITION) and the setting can change at
 * runtime without threading a number through either. The fallback is the
 * default, so anything rendered outside the property's scope still agrees.
 */
export const MOBILE_DRAWER_WIDTH_VAR = '--mobile-drawer-width';
export const MOBILE_DRAWER_FULL_WIDTH = '100%';
export const MOBILE_DRAWER_STRIP_WIDTH = '80%';
export const MOBILE_DRAWER_WIDTH = `var(${MOBILE_DRAWER_WIDTH_VAR}, ${MOBILE_DRAWER_FULL_WIDTH})`;
export const MOBILE_PANE_SHIFT = `translateX(${MOBILE_DRAWER_WIDTH})`;
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
 * The drawer also transitions its width, because that is the one property the
 * pane tracks through its own transform. Changing the strip setting while the
 * drawer is open would otherwise jump the width in a frame while the pane
 * eased across 300ms, leaving the newly exposed slice with no conversation
 * under it. Only the drawer needs this: the pane's width is flex-driven and
 * animating it would reach the desktop sidebar's collapse as well.
 */
export const MOBILE_DRAWER_TRANSITION = `${SIDEBAR_TRANSITION}, width ${TRANSITION_MS}ms ${EASING}`;

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

/**
 * Lets a kicked toggle start the scrim fade with the drawer, rather than
 * waiting for the deferred Recoil commit that a large conversation stalls.
 */
export const MOBILE_SCRIM_ID = 'mobile-drawer-scrim';
