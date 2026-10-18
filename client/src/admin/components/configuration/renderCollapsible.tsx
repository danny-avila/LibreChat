import type { ReactNode } from 'react';
import { cn } from '~/admin/utils';

/**
 * Shared collapsible wrapper with CSS-grid animation and deferred rendering.
 * `id` lets the expand button point at the region with `aria-controls`.
 */
export function renderCollapsible(
  isExpanded: boolean,
  hasEverExpanded: boolean,
  children: ReactNode,
  className = 'flex flex-col gap-4 pt-4',
  id?: string,
) {
  const shouldRender = isExpanded || hasEverExpanded;
  return (
    <div
      id={id}
      className={cn(
        'config-section-grid',
        isExpanded ? 'config-section-grid-open' : 'config-section-grid-closed',
      )}
      {...(!isExpanded ? { inert: '' as const } : {})}
    >
      <div className="config-section-inner">
        <div className={className}>{shouldRender && children}</div>
      </div>
    </div>
  );
}
