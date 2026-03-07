import type { CSSProperties } from 'react';

export const EXPAND_TRANSITION =
  'grid-template-rows 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

export default function useExpandCollapse(isExpanded: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateRows: isExpanded ? '1fr' : '0fr',
    transition: EXPAND_TRANSITION,
    opacity: isExpanded ? 1 : 0,
  };
}
