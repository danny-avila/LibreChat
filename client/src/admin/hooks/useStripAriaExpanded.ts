import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Workaround for click-ui Dropdown.Trigger placing aria-expanded on a
 * role-less wrapper <div>, violating WCAG aria-allowed-attr: the state moves
 * to the trigger button itself, where screen readers announce it.
 * Remove once fix is merged upstream into click-ui.
 */
export function useStripAriaExpanded<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const wrapper = ref.current?.parentElement;
    if (!wrapper || wrapper.tagName !== 'DIV') return;

    const strip = () => {
      const expanded = wrapper.getAttribute('aria-expanded');
      if (expanded === null) return;
      ref.current?.setAttribute('aria-expanded', expanded);
      wrapper.removeAttribute('aria-expanded');
    };
    strip();

    const observer = new MutationObserver(strip);
    observer.observe(wrapper, { attributes: true, attributeFilter: ['aria-expanded'] });
    return () => observer.disconnect();
  }, []);

  return ref;
}
