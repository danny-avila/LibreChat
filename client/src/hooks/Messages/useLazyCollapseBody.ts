import { useCallback, useEffect, useState } from 'react';
import type { TransitionEvent } from 'react';

/**
 * Defers a disclosure panel's body: collapsed-by-default content stays
 * unmounted until its first expansion and unmounts again after the collapse
 * transition completes (`useExpandCollapse` keeps `transitionend` firing even
 * under reduced motion, so the release always arrives). The expansion-flag
 * effect mounts one commit after programmatic expands; toggle handlers should
 * call `mountBody` so user-driven expands mount in the same commit the
 * height transition measures.
 */
export default function useLazyCollapseBody(isExpanded: boolean): {
  shouldRenderBody: boolean;
  mountBody: () => void;
  handleTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
} {
  const [shouldRenderBody, setShouldRenderBody] = useState(isExpanded);
  const mountBody = useCallback(() => setShouldRenderBody(true), []);

  useEffect(() => {
    if (isExpanded) {
      setShouldRenderBody(true);
    }
  }, [isExpanded]);

  const handleTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget || isExpanded) {
        return;
      }
      setShouldRenderBody(false);
    },
    [isExpanded],
  );

  return { shouldRenderBody, mountBody, handleTransitionEnd };
}
