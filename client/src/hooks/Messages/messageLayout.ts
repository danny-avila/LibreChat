export const MESSAGE_CONTENT_LAYOUT_CHANGE_EVENT = 'librechat:message-content-layout-change';

export function dispatchMessageContentLayoutChange(target: HTMLElement | null): void {
  if (!target || typeof CustomEvent === 'undefined') {
    return;
  }

  target.dispatchEvent(
    new CustomEvent(MESSAGE_CONTENT_LAYOUT_CHANGE_EVENT, {
      bubbles: true,
    }),
  );
}
