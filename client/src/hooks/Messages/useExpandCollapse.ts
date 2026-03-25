import { useRef, useLayoutEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';

export const EXPAND_TRANSITION =
  'grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

export default function useExpandCollapse(isExpanded: boolean): {
  style: CSSProperties;
  ref: React.RefObject<HTMLDivElement>;
} {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    if (isExpanded) {
      el.removeAttribute('inert');
    } else {
      el.setAttribute('inert', '');
    }
  }, [isExpanded]);

  const style = useMemo<CSSProperties>(
    () => ({
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      transition: EXPAND_TRANSITION,
      opacity: isExpanded ? 1 : 0,
    }),
    [isExpanded],
  );

  return { style, ref };
}
