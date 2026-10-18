import type * as t from '~/admin/types';

/**
 * Control cell of a settings row; `width` caps click-ui fields at the S/M/L
 * token. Without one the cell sizes by control type (numbers S, others M).
 */
export function SectionControls({ children, width }: t.SectionControlsProps) {
  return (
    <div className="settings-row-control" data-width={width ?? 'auto'}>
      {children}
    </div>
  );
}
