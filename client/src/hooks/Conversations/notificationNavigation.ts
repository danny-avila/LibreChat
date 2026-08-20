/**
 * A desktop notification click focuses this window on its way to another conversation.
 *
 * That focus is not the user catching up on whatever happened to be open: they are leaving it
 * for the chat the notification named, and its reply was never on screen. The click flags the
 * focus event it is about to cause, and the seen trigger consumes the flag instead of
 * acknowledging a reply nobody read.
 */
let suppressNextFocus = false;

/** Only meaningful while the window is unfocused, which is the only time alerts fire; a click
 *  that raises no focus event would otherwise leave the flag set for a later, genuine one. */
export const suppressFocusAcknowledgement = (): void => {
  if (document.hasFocus()) {
    return;
  }
  suppressNextFocus = true;
};

export const consumeFocusSuppression = (): boolean => {
  if (!suppressNextFocus) {
    return false;
  }
  suppressNextFocus = false;
  return true;
};
