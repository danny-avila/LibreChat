import { useEffect } from 'react';

/** click-ui's dialog close button, named only by its icon ("cross"). */
const UNNAMED_CLOSE = '[role="dialog"] button:not([aria-label]):has(svg[aria-label="cross"])';

/**
 * Names every click-ui dialog's close button `label` ("Close"): click-ui
 * renders it without an accessible name of its own, so screen readers read
 * the icon's name. Dialogs portal into `<body>`, so only its direct children
 * are watched; each new portal is labelled once its content has rendered.
 */
export function useDialogCloseLabels(label: string): void {
  useEffect(() => {
    const labelIn = (root: ParentNode) => {
      for (const button of root.querySelectorAll<HTMLButtonElement>(UNNAMED_CLOSE)) {
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      }
    };
    labelIn(document.body);
    const observer = new MutationObserver((mutations) => {
      const added = mutations.flatMap((mutation) => [...mutation.addedNodes]);
      if (added.length === 0) return;
      requestAnimationFrame(() => {
        for (const node of added) if (node instanceof HTMLElement) labelIn(node);
      });
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [label]);
}
