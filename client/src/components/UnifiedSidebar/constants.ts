export const COLLAPSED_WIDTH = 52;
export const EXPANDED_MIN = 360;
export const TRANSITION_MS = 300;
export const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * The drawer and the chat pane move as one object, so they must stay
 * frame-locked; a second copy of this string is a visible seam mid-animation.
 */
export const SIDEBAR_TRANSITION = `transform ${TRANSITION_MS}ms ${EASING}`;
