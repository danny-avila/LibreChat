/**
 * A ref callback that moves focus to its element when it mounts. For a field the person just
 * opened (an editor that replaces a masked value, a key input they asked to add), never for a
 * field that renders on its own: that would pull focus away on page load.
 */
export function focusElement(element: HTMLElement | null): void {
  element?.focus();
}
