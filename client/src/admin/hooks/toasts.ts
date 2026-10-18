import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

/** Read by the toast viewport rule in styles.css: how far above the window's bottom toasts stack. */
const OFFSET_PROPERTY = '--toast-bottom-offset';

/**
 * Keeps toasts stacked above a bar fixed to the bottom of the page (the
 * unsaved-changes bar) while it is shown, so a toast never covers its buttons.
 */
export function useToastClearance(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - element.getBoundingClientRect().top);
      root.style.setProperty(OFFSET_PROPERTY, `${offset}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      root.style.removeProperty(OFFSET_PROPERTY);
    };
  }, [ref]);
}
